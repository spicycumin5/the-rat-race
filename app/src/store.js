// Data layer: one Supabase table (`records`) holds every map item for every user.
// Row-level security on the server limits each signed-in person to their own rows,
// so this module only ever sees the current user's map.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key) : null;
// Demo mode: with no Supabase configured, `?demo` runs the app in memory (nothing is saved).
export const demo = !configured && new URLSearchParams(location.search).has('demo');
const BUCKET = 'files';
const ok = Promise.resolve({ error: null });

export function createStore(cols, onChange) {
  const data = Object.fromEntries(cols.map(c => [c, new Map()]));
  let uid = null, channel = null, loaded = false;

  const put = (col, id, body) => { for (const c of cols) if (c !== col) data[c].delete(id); data[col]?.set(id, { ...body, id }); };
  const drop = id => { for (const c of cols) data[c].delete(id); };
  const bodyOf = r => { const o = { ...r }; delete o.id; return o; };

  async function loadAll() {
    if (demo) { loaded = true; onChange(); return; }
    const fresh = Object.fromEntries(cols.map(c => [c, new Map()]));
    for (let from = 0; ; from += 1000) {
      const { data: rows, error } = await supabase.from('records').select('id,col,data').eq('user_id', uid).range(from, from + 999);
      if (error) throw error;
      for (const r of rows) fresh[r.col]?.set(r.id, { ...r.data, id: r.id });
      if (rows.length < 1000) break;
    }
    for (const c of cols) data[c] = fresh[c];
    loaded = true; onChange();
  }

  async function start(userId) {
    stop(); uid = userId; loaded = false;
    for (const c of cols) data[c] = new Map();
    onChange();
    if (demo) return loadAll();
    channel = supabase.channel('records-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${uid}` }, p => {
        if (p.eventType === 'DELETE') drop(p.old.id);
        else put(p.new.col, p.new.id, p.new.data);
        onChange();
      })
      .subscribe(status => { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('[rat-race] realtime', status); });
    await loadAll();
  }
  function stop() {
    if (channel && supabase) supabase.removeChannel(channel);
    channel = null; uid = null; loaded = false;
    for (const c of cols) data[c] = new Map();
  }

  // Writes are optimistic: the local map changes first, then the server confirms.
  // On failure the map is reloaded from the server so it never shows unsaved data.
  const tbl = () => demo ? { upsert: () => ok, delete: () => ({ eq: () => ok, in: () => ok }) } : supabase.from('records');
  async function guard(promise) {
    const { error } = await promise;
    if (error) { loadAll().catch(() => {}); throw error; }
  }
  async function set(col, id, body) {
    put(col, id, body); onChange();
    await guard(tbl().upsert({ id, col, data: bodyOf(body), user_id: uid }));
  }
  async function update(col, id, patch) {
    const cur = data[col].get(id);
    if (!cur) throw new Error('That item no longer exists.');
    return set(col, id, { ...bodyOf(cur), ...patch });
  }
  async function remove(col, id) {
    drop(id); onChange();
    await guard(tbl().delete().eq('id', id));
  }
  async function add(col, body) { const id = newId(); await set(col, id, body); return id; }
  async function insertMany(rows) {
    for (const r of rows) put(r.col, r.id, r.data);
    onChange();
    for (let i = 0; i < rows.length; i += 500)
      await guard(tbl().upsert(rows.slice(i, i + 500).map(r => ({ id: r.id, col: r.col, data: bodyOf(r.data), user_id: uid }))));
  }
  async function removeMany(ids) {
    ids.forEach(drop); onChange();
    for (let i = 0; i < ids.length; i += 200) await guard(tbl().delete().in('id', ids.slice(i, i + 200)));
  }
  const newId = () => crypto.randomUUID();

  // Files live in a private bucket under a folder named after the user id.
  async function upload(file, type) {
    if (demo) return { id: 'mem:' + URL.createObjectURL(file), contentType: type };
    const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
    const path = `${uid}/${newId()}-${safe}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: type, upsert: false });
    if (error) throw error;
    return { id: path, contentType: type };
  }
  const urlCache = new Map();
  async function fileUrl(path) {
    if (path.startsWith('mem:')) return path.slice(4);
    const hit = urlCache.get(path);
    if (hit && hit.exp > Date.now()) return hit.url;
    const { data: d, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error) throw error;
    urlCache.set(path, { url: d.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
    return d.signedUrl;
  }
  async function deleteFile(path) { if (demo) return; await supabase.storage.from(BUCKET).remove([path]); }

  return {
    data, get loaded() { return loaded; }, get uid() { return uid; },
    start, stop, set, update, remove, add, insertMany, removeMany, newId, upload, fileUrl, deleteFile, reload: loadAll,
  };
}
