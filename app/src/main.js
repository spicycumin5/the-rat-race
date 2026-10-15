import * as d3 from 'd3';
import './style.css';
import { configured, demo, supabase, createStore } from './store.js';
import { sampleRows } from './sample.js';
import { seedOf, sketchShape, sketchCircle, sketchCross, sketchSlash, sketchStar, sketchIconMarkup } from './sketch.js';

const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/* ---------- Schema ---------- */
const STATUSES = [
  { k: 'wishlist', l: 'Wishlist' }, { k: 'applied', l: 'Applied' }, { k: 'screen', l: 'Screen' },
  { k: 'interviewing', l: 'Interviewing' }, { k: 'offer', l: 'Offer' }, { k: 'rejected', l: 'Rejected' },
  { k: 'ghosted', l: 'Ghosted' }, { k: 'withdrawn', l: 'Withdrawn' }];
const STATUS_L = Object.fromEntries(STATUSES.map(s => [s.k, s.l]));
const CLOSED = ['rejected', 'ghosted', 'withdrawn'];
const opts = a => a.map(x => ({ v: x, l: x || '—' }));

const TYPES = {
  companies: { label: 'Company', plural: 'Companies', r: 17, fields: [
    { k: 'name', label: 'Name', kind: 'text', req: true, ph: 'e.g. Acme Corp' },
    { k: 'industry', label: 'Industry', kind: 'text', half: true },
    { k: 'location', label: 'Location', kind: 'text', half: true },
    { k: 'url', label: 'Website', kind: 'url', half: true },
    { k: 'interest', label: 'Interest (1–5)', kind: 'select', options: opts(['', '1', '2', '3', '4', '5']), half: true },
    { k: 'notes', label: 'Notes', kind: 'textarea' }] },
  roles: { label: 'Role', plural: 'Roles', r: 10, fields: [
    { k: 'title', label: 'Job title', kind: 'text', req: true, ph: 'e.g. Senior Data Analyst' },
    { k: 'companyId', label: 'Company', kind: 'ref', to: 'companies' },
    { k: 'url', label: 'Posting link', kind: 'url' },
    { k: 'salary', label: 'Salary range', kind: 'text', ph: '$110k–135k', half: true },
    { k: 'workplace', label: 'Workplace', kind: 'select', options: opts(['', 'Remote', 'Hybrid', 'On-site']), half: true },
    { k: 'posted', label: 'Posted', kind: 'date', half: true },
    { k: 'notes', label: 'Notes', kind: 'textarea' }] },
  applications: { label: 'Application', plural: 'Applications', r: 10, fields: [
    { k: 'roleId', label: 'Role', kind: 'ref', to: 'roles', req: true },
    { k: 'status', label: 'Stage', kind: 'status' },
    { k: 'applied', label: 'Date applied', kind: 'date', half: true },
    { k: 'source', label: 'Source', kind: 'select', half: true, options: opts(['', 'Company site', 'LinkedIn', 'Referral', 'Recruiter', 'Job board', 'Cold outreach', 'Other']) },
    { k: 'resumeId', label: 'Resume used', kind: 'ref', to: 'documents', filter: d => d.kind === 'Resume' },
    { k: 'letterId', label: 'Cover letter / outreach', kind: 'ref', to: 'documents', filter: d => d.kind !== 'Resume' },
    { k: 'personIds', label: 'Contacts', kind: 'refs', to: 'people' },
    { k: 'notes', label: 'Notes', kind: 'textarea' }] },
  documents: { label: 'Document', plural: 'Documents', r: 9, fields: [
    { k: 'name', label: 'Version name', kind: 'text', req: true, ph: 'e.g. Resume v3 (analytics)' },
    { k: 'kind', label: 'Kind', kind: 'select', options: opts(['Resume', 'Cover letter', 'Cold email', 'Portfolio', 'Other']) },
    { k: 'fileId', label: 'File', kind: 'file' },
    { k: 'notes', label: 'Notes', kind: 'textarea' }] },
  people: { label: 'Contact', plural: 'Contacts', r: 9, fields: [
    { k: 'name', label: 'Name', kind: 'text', req: true },
    { k: 'kind', label: 'Relationship', kind: 'select', half: true, options: opts(['Recruiter', 'Referral', 'Hiring manager', 'Interviewer', 'Other']) },
    { k: 'companyId', label: 'Company', kind: 'ref', to: 'companies', half: true },
    { k: 'email', label: 'Email', kind: 'text', half: true },
    { k: 'phone', label: 'Phone', kind: 'text', half: true },
    { k: 'linkedin', label: 'LinkedIn', kind: 'url' },
    { k: 'notes', label: 'Notes', kind: 'textarea' }] },
  interviews: { label: 'Interview', plural: 'Interviews', r: 8, fields: [
    { k: 'applicationId', label: 'Application', kind: 'ref', to: 'applications', req: true },
    { k: 'round', label: 'Round', kind: 'select', half: true, options: opts(['Recruiter screen', 'Phone screen', 'Technical', 'Take-home', 'Onsite', 'Panel', 'Hiring manager', 'Final', 'Other']) },
    { k: 'date', label: 'When', kind: 'datetime', half: true },
    { k: 'personIds', label: 'Interviewers', kind: 'refs', to: 'people' },
    { k: 'outcome', label: 'Outcome', kind: 'select', options: opts(['Pending', 'Passed', 'Did not pass', 'Cancelled']) },
    { k: 'notes', label: 'Notes / questions asked', kind: 'textarea' }] },
  events: { label: 'Event', plural: 'Events', r: 5, fields: [
    { k: 'title', label: 'What happened', kind: 'text', req: true, ph: 'e.g. Sent follow-up to recruiter' },
    { k: 'kind', label: 'Kind', kind: 'select', half: true, options: opts(['Note', 'Outreach sent', 'Follow-up', 'Reply received', 'Rejection', 'Offer', 'Status change']) },
    { k: 'date', label: 'Date', kind: 'date', half: true },
    { k: 'refs', label: 'Related to', kind: 'anyrefs' },
    { k: 'notes', label: 'Notes', kind: 'textarea' }] },
};
const COLS = Object.keys(TYPES);
const DEFAULTS = {
  applications: () => ({ status: 'applied', applied: localDate() }),
  documents: () => ({ kind: 'Resume' }),
  people: () => ({ kind: 'Recruiter' }),
  interviews: () => ({ outcome: 'Pending', round: 'Phone screen' }),
  events: () => ({ kind: 'Note', date: localDate() }),
};

/* ---------- State ---------- */
const store = createStore(COLS, () => scheduleRender());
const state = {
  data: store.data, view: 'graph', selected: null, search: '',
  types: new Set(COLS.filter(c => c !== 'events')), statuses: new Set(STATUSES.map(s => s.k)),
  tlCompany: '', dbState: 'connecting',
};
let readOnly = false;
let panel = { mode: null };

/* ---------- Helpers ---------- */
function localDate(d = new Date()) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function parseD(iso) { return iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso) : null; }
function daysBetween(a, b) { const x = parseD(a), y = parseD(b); return x && y ? Math.max(0, Math.round((y - x) / 864e5)) : null; }
function daysSince(iso) { const d = parseD(iso); return d ? Math.floor((Date.now() - d) / 864e5) : null; }
function fmtDate(iso, withTime = true) {
  const d = parseD(iso); if (!d || isNaN(d)) return '';
  const o = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  let s = d.toLocaleDateString(undefined, o);
  if (withTime && iso.length > 10) s += ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return s;
}
const get = (col, id) => id ? state.data[col]?.get(id) : undefined;
const getKey = key => { if (!key) return; const [c, id] = key.split('/'); return get(c, id); };
const exists = key => !!getKey(key);
const all = col => [...state.data[col].values()];
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';

function companyOf(col, r) {
  if (!r) return;
  switch (col) {
    case 'companies': return r;
    case 'roles': case 'people': return get('companies', r.companyId);
    case 'applications': return companyOf('roles', get('roles', r.roleId));
    case 'interviews': return companyOf('applications', get('applications', r.applicationId));
    case 'events': for (const k of r.refs || []) { const c = companyOf(k.split('/')[0], getKey(k)); if (c) return c; }
  }
}
function titleOf(col, r) {
  if (!r) return '(missing)';
  switch (col) {
    case 'companies': return r.name || 'Unnamed company';
    case 'roles': return r.title || 'Untitled role';
    case 'applications': { const role = get('roles', r.roleId); return role ? (role.title || 'Untitled role') : 'Application'; }
    case 'documents': return r.name || 'Untitled document';
    case 'people': return r.name || 'Unnamed contact';
    case 'interviews': return r.round || 'Interview';
    case 'events': return r.title || 'Event';
  }
}
function subOf(col, r) {
  if (!r) return '';
  const co = companyOf(col, r)?.name;
  switch (col) {
    case 'companies': return [r.industry, r.location].filter(Boolean).join(' · ');
    case 'roles': return [co, r.workplace, r.salary].filter(Boolean).join(' · ');
    case 'applications': return [co, STATUS_L[r.status] || 'Applied'].filter(Boolean).join(' · ');
    case 'documents': return r.kind || '';
    case 'people': return [r.kind, co].filter(Boolean).join(' at ');
    case 'interviews': return [co, fmtDate(r.date)].filter(Boolean).join(' · ');
    case 'events': return [r.kind, fmtDate(r.date)].filter(Boolean).join(' · ');
  }
}
function optLabel(col, r) {
  const co = companyOf(col, r)?.name;
  switch (col) {
    case 'roles': case 'applications': return titleOf(col, r) + (co ? ' · ' + co : '');
    case 'interviews': return titleOf(col, r) + (co ? ' · ' + co : '');
    case 'people': return titleOf(col, r) + (r.kind ? ' (' + r.kind + ')' : '');
    default: return titleOf(col, r);
  }
}
function matches(col, r) {
  const q = state.search.trim().toLowerCase(); if (!q) return true;
  return [optLabel(col, r), subOf(col, r), r.notes, r.email, r.source, r.salary].filter(Boolean).join(' ').toLowerCase().includes(q);
}
function interviewsFor(appId) { return all('interviews').filter(i => i.applicationId === appId); }
function reachedInterview(a) { return ['interviewing', 'offer'].includes(a.status) || interviewsFor(a.id).length > 0; }
// Distinct people you've reached at a company: contacts filed under it, plus contacts on its applications/interviews.
function companyContacts(cid) {
  const ids = new Set();
  for (const p of all('people')) if (p.companyId === cid) ids.add(p.id);
  for (const a of all('applications')) if (companyOf('applications', a)?.id === cid) (a.personIds || []).forEach(id => get('people', id) && ids.add(id));
  for (const i of all('interviews')) if (companyOf('interviews', i)?.id === cid) (i.personIds || []).forEach(id => get('people', id) && ids.add(id));
  return ids;
}
// A referral is a linked contact whose relationship is Referral, or Source set to Referral.
function referralOf(a) {
  if (!a) return null;
  const p = (a.personIds || []).map(id => get('people', id)).find(p => p && p.kind === 'Referral');
  return p || (a.source === 'Referral' ? { name: '' } : null);
}
const STAR = 'M0,-3.6L1.06,-1.1L3.42,-1.1L1.6,0.45L2.2,2.9L0,1.5L-2.2,2.9L-1.6,0.45L-3.42,-1.1L-1.06,-1.1Z';
function markPath(status, r) {
  const a = r * .55;
  if (status === 'rejected') return `M${-a},${-a}L${a},${a}M${a},${-a}L${-a},${a}`;
  if (status === 'withdrawn') return `M${a},${-a}L${-a},${a}`;
  return '';
}

function refsOf(col, r) {
  const out = [];
  for (const f of TYPES[col].fields) {
    const v = r[f.k]; if (!v) continue;
    if (f.kind === 'ref') out.push({ f, key: f.to + '/' + v });
    else if (f.kind === 'refs' && Array.isArray(v)) v.forEach(id => out.push({ f, key: f.to + '/' + id }));
    else if (f.kind === 'anyrefs' && Array.isArray(v)) v.forEach(k => out.push({ f, key: k }));
  }
  return out;
}
function allLinks() {
  const L = [];
  for (const c of COLS) for (const r of state.data[c].values())
    for (const x of refsOf(c, r)) if (exists(x.key)) L.push({ source: c + '/' + r.id, target: x.key, kind: c + '-' + x.f.k, rel: x.f.label });
  return L;
}

/* ---------- Shapes ---------- */
function shapePath(col, r) {
  switch (col) {
    case 'companies': { let p = ''; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2; p += (i ? 'L' : 'M') + (r * Math.cos(a)).toFixed(2) + ',' + (r * Math.sin(a)).toFixed(2); } return p + 'Z'; }
    case 'roles': { const s = r * .82; return `M${-s},${-s}H${s}V${s}H${-s}Z`; }
    case 'documents': { const w = r * .74, t = r; return `M${-w},${-t}H${w * .35}L${w},${-t + w * .65}V${t}H${-w}Z`; }
    case 'people': return `M0,${-r}L${r * .95},${r * .72}L${-r * .95},${r * .72}Z`;
    case 'interviews': return `M0,${-r * 1.1}L${r * 1.1},0L0,${r * 1.1}L${-r * 1.1},0Z`;
    default: return `M${r},0A${r},${r} 0 1 1 ${-r},0A${r},${r} 0 1 1 ${r},0Z`;
  }
}
function icon(col, status) {
  const r = col === 'companies' ? 6.5 : col === 'events' ? 4 : 5.5;
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('class', 'ico'); el.setAttribute('viewBox', '-9 -9 18 18'); el.setAttribute('aria-hidden', 'true');
  const key = 'ic-' + col + '-' + (status || '');
  const art = sketchIconMarkup(key, () => {
    const els = sketchShape(col, r, shapePath(col, r), seedOf(key), status);
    if (status === 'rejected') els.push(...wrapMark(sketchCross(r * .6, 3)));
    if (status === 'withdrawn') els.push(...wrapMark(sketchSlash(r * .6, 3)));
    return els;
  });
  el.innerHTML = '<g class="t-' + col + (status ? ' s-' + status : '') + '">' + art + '</g>';
  return el;
}
const statusColor = s => `var(--s-${s})`;

/* ---------- Data layer ---------- */
function handleErr(e) {
  const msg = (e && (e.message || e.error_description)) || '';
  if (/JWT|session|not authenticated/i.test(msg)) toast('Your session expired. Sign in again to keep saving.');
  else if (/Map is full/.test(msg)) toast('Your map is full. Delete old events or sample data to make room.');
  else if (/fetch|network/i.test(msg)) toast('You seem to be offline. That change did not save.');
  else toast('That change did not save. Try again in a moment.');
  console.warn('[rat-race]', e);
}
async function write(col, id, body) {
  try { await store.set(col, id, body); return true; } catch (e) { handleErr(e); return false; }
}
async function patch(col, id, body) {
  try { await store.update(col, id, body); return true; } catch (e) { handleErr(e); return false; }
}
function stripId(r) { const o = { ...r }; delete o.id; return o; }
const newId = () => store.newId();

async function logEvent(title, kind, refs) {
  try { await store.add('events', { title, kind, date: localDate(), refs, auto: true, createdAt: new Date().toISOString() }); } catch (e) { handleErr(e); }
}
async function setStatus(id, s) {
  const a = get('applications', id); if (!a || a.status === s) return;
  const body = { status: s, statusAt: localDate(), updatedAt: new Date().toISOString() };
  if (s !== 'wishlist' && !a.applied) body.applied = localDate();
  if (await patch('applications', id, body)) {
    const kind = s === 'rejected' ? 'Rejection' : s === 'offer' ? 'Offer' : 'Status change';
    await logEvent('Moved to ' + STATUS_L[s], kind, ['applications/' + id]);
    toast('Moved to ' + STATUS_L[s]);
  }
}
async function deleteRecord(col, id) {
  const key = col + '/' + id, rec = get(col, id);
  const autoEvents = [];
  for (const c of COLS) for (const r of [...state.data[c].values()]) {
    if (c === col && r.id === id) continue;
    if (c === 'events' && r.auto && (r.refs || []).length === 1 && r.refs[0] === key) { autoEvents.push(r.id); continue; }
    const p = {};
    for (const f of TYPES[c].fields) {
      const v = r[f.k];
      if (f.kind === 'ref' && f.to === col && v === id) p[f.k] = '';
      if (f.kind === 'refs' && f.to === col && Array.isArray(v) && v.includes(id)) p[f.k] = v.filter(x => x !== id);
      if (f.kind === 'anyrefs' && Array.isArray(v) && v.includes(key)) p[f.k] = v.filter(x => x !== key);
    }
    if (Object.keys(p).length) await patch(c, r.id, p);
  }
  try {
    await store.removeMany([id, ...autoEvents]);
    if (rec && rec.fileId) store.deleteFile(rec.fileId).catch(() => {});
    closePanel(); toast('Deleted');
  } catch (e) { handleErr(e); }
}
async function clearSample() {
  const btn = $('#clearSample'); btn.disabled = true; btn.textContent = 'Clearing…';
  const ids = COLS.flatMap(c => all(c).filter(r => r.sample).map(r => r.id));
  try { await store.removeMany(ids); toast('Sample data cleared. The map is yours now.'); } catch (e) { handleErr(e); }
  btn.disabled = false; btn.textContent = 'Clear sample data';
  if (panel.mode) closePanel();
}
async function loadSample() {
  try { await store.insertMany(sampleRows(store.newId)); toast('Sample map loaded. Clear it any time from the top bar.'); didFit = false; }
  catch (e) { handleErr(e); }
}

/* ---------- Export / import (your data, as a JSON file) ---------- */
function exportJSON() {
  const rows = COLS.flatMap(c => all(c).map(r => ({ id: r.id, col: c, data: stripId(r) })));
  const blob = new Blob([JSON.stringify({ app: 'the-rat-race', version: 1, exportedAt: new Date().toISOString(), records: rows }, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `rat-race-${localDate()}.json` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  closeAccount();
}
async function importJSON(file) {
  closeAccount();
  let parsed;
  try { parsed = JSON.parse(await file.text()); } catch { toast('That file is not valid JSON.'); return; }
  const recs = Array.isArray(parsed) ? parsed : parsed.records;
  if (!Array.isArray(recs)) { toast('No records found in that file.'); return; }
  // Fresh ids so an import never collides with existing rows; references are rewritten to match.
  const idMap = new Map(recs.map(r => [String(r.id), store.newId()]));
  const fix = v => idMap.get(String(v)) || v;
  const rows = recs.filter(r => COLS.includes(r.col) && r.data && typeof r.data === 'object').map(r => {
    const d = { ...r.data }; delete d.fileId; delete d.fileName; delete d.fileType;
    for (const f of TYPES[r.col].fields) {
      if (f.kind === 'ref' && d[f.k]) d[f.k] = fix(d[f.k]);
      if (f.kind === 'refs' && Array.isArray(d[f.k])) d[f.k] = d[f.k].map(fix);
      if (f.kind === 'anyrefs' && Array.isArray(d[f.k])) d[f.k] = d[f.k].map(k => { const [c, i] = String(k).split('/'); return c + '/' + fix(i); });
    }
    return { id: idMap.get(String(r.id)), col: r.col, data: d };
  });
  try { await store.insertMany(rows); toast(`Imported ${rows.length} item${rows.length === 1 ? '' : 's'}.`); didFit = false; }
  catch (e) { handleErr(e); }
}

/* ---------- Auth ---------- */
let session = null;
function showAuth(on) { $('#auth').hidden = !on; $('#app').hidden = on; }
async function boot() {
  if (demo) { onSession({ user: { id: 'demo', email: 'Demo (not saved)' } }); $('#signOutBtn').hidden = true; return; }
  if (!configured) {
    showAuth(true);
    $('#authForm').hidden = true;
    $('#authMsg').textContent = 'This copy is not connected to a database yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env (see README.md).';
    return;
  }
  if (import.meta.env.VITE_GOOGLE_AUTH === 'true') $('#googleBtn').hidden = false;
  const { data } = await supabase.auth.getSession();
  supabase.auth.onAuthStateChange((_evt, s) => { if (s?.user?.id !== session?.user?.id) onSession(s); else session = s; });
  onSession(data.session);
}
function onSession(s) {
  session = s;
  if (!s) { store.stop(); panel = { mode: null }; $('#panel').hidden = true; showAuth(true); return; }
  showAuth(false);
  $('#acctEmail').textContent = s.user.email || 'Signed in';
  didFit = false;
  requestAnimationFrame(centerView);
  state.dbState = 'ok';
  store.start(s.user.id).catch(e => { state.dbState = 'none'; handleErr(e); render(); });
}
$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#authEmail').value.trim(), btn = $('#authSubmit'), msg = $('#authMsg');
  if (!email) return;
  btn.disabled = true; msg.textContent = 'Sending…';
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  btn.disabled = false;
  msg.textContent = error ? (/rate/i.test(error.message) ? 'Too many sign-in emails just now. Wait a minute and try again.' : 'Could not send the link: ' + error.message)
    : `Check ${email} for a sign-in link. Open it in this browser.`;
});
$('#googleBtn').addEventListener('click', () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }));
const acctBtn = $('#acctBtn'), acctMenu = $('#acctMenu');
function closeAccount() { acctMenu.hidden = true; acctBtn.setAttribute('aria-expanded', 'false'); }
acctBtn.onclick = e => { e.stopPropagation(); acctMenu.hidden = !acctMenu.hidden; acctBtn.setAttribute('aria-expanded', String(!acctMenu.hidden)); };
document.addEventListener('click', e => { if (!acctMenu.contains(e.target)) closeAccount(); });
$('#exportBtn').onclick = exportJSON;
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importJSON(f); };
$('#signOutBtn').onclick = async () => { closeAccount(); await supabase.auth.signOut(); };

/* ---------- Render loop ---------- */
let raf = 0;
function scheduleRender() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
function render() {
  renderBanner(); renderStats(); renderChips(); renderEmpty();
  $('#clearSample').hidden = !COLS.some(c => all(c).some(r => r.sample));
  if (state.view === 'graph') updateGraph();
  else if (state.view === 'pipeline') renderPipeline();
  else renderTimeline();
  renderPanel(false);
}
function renderBanner() {
  const b = $('#banner');
  if (state.dbState === 'none') { b.hidden = false; b.textContent = 'Your map could not load. Check your connection, then reload the page.'; }
  else b.hidden = true;
}

/* ---------- Stats ---------- */
function renderStats() {
  const apps = all('applications');
  const sent = apps.filter(a => a.status !== 'wishlist');
  const heard = sent.filter(a => ['screen', 'interviewing', 'offer', 'rejected'].includes(a.status) || interviewsFor(a.id).length);
  const active = apps.filter(a => ['applied', 'screen', 'interviewing'].includes(a.status));
  const now = Date.now();
  const upcoming = all('interviews').filter(i => i.date && parseD(i.date) >= now && i.outcome !== 'Cancelled');
  const offers = apps.filter(a => a.status === 'offer').length;
  const el = $('#stats'); el.replaceChildren();
  const stat = (n, l) => h('div', { class: 'stat' }, h('b', null, n), h('span', null, l));
  el.append(stat(sent.length, 'Sent'), stat(active.length, 'Active'), stat(pct(heard.length, sent.length), 'Heard back'),
    stat(upcoming.length, 'Upcoming interviews'), stat(offers, 'Offers'));
  const counts = STATUSES.map(s => ({ ...s, n: apps.filter(a => (a.status || 'applied') === s.k).length })).filter(s => s.n);
  const bar = h('div', { class: 'funnel-bar', role: 'img', 'aria-label': counts.map(s => `${s.l} ${s.n}`).join(', ') || 'No applications yet' },
    counts.map(s => { const i = h('i', { title: `${s.l}: ${s.n}` }); i.style.width = (100 * s.n / apps.length) + '%'; i.style.background = statusColor(s.k); return i; }));
  const legend = h('div', { class: 'funnel-legend' }, counts.length ? counts.map(s => { const d = h('span', { class: 'dot' }); d.style.background = statusColor(s.k); return h('em', null, d, `${s.l} ${s.n}`); }) : 'Applications will fill this bar by stage.');
  el.append(h('div', { class: 'funnel' }, bar, legend));
  // best-performing resume version
  const res = all('documents').filter(d => d.kind === 'Resume').map(d => {
    const used = apps.filter(a => a.resumeId === d.id && a.status !== 'wishlist');
    return { d, used: used.length, hit: used.filter(reachedInterview).length };
  }).filter(x => x.used >= 2).sort((a, b) => b.hit / b.used - a.hit / a.used || b.used - a.used);
  if (res.length) el.append(h('div', { class: 'best' }, 'Best resume: ', h('strong', null, res[0].d.name), ` · ${res[0].hit} of ${res[0].used} reached interview`));
}

/* ---------- Graph ---------- */
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const svg = d3.select('#graph');
svg.append('defs').html(`<filter id="pencil" x="-5%" y="-5%" width="110%" height="110%">
  <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7"/>
  <feDisplacementMap in="SourceGraphic" scale="1.8"/></filter>`);
const gRoot = svg.append('g').attr('class', 'root'), gLinks = gRoot.append('g').attr('class', 'links').attr('filter', 'url(#pencil)'), gNodes = gRoot.append('g');
// Companies get extra room for their handwritten name underneath.
const collideR = d => d.r + 10 + (d.col === 'companies' ? Math.min(d.reach || 0, 4) * 5 + 26 : 0);
let simNodes = [], simLinks = [], sig = '', sizeSig = '', didFit = false, dragging = false,
  linkSel = gLinks.selectAll('path'), nodeSel = gNodes.selectAll('g.node');

// Gentle zoom; the graph paper moves and scales with the drawing.
const zoom = d3.zoom().scaleExtent([0.2, 3.5])
  .wheelDelta(e => -e.deltaY * (e.deltaMode === 1 ? 0.03 : e.deltaMode ? 1 : 0.0011))
  .on('zoom', e => {
    const t = e.transform;
    gRoot.attr('transform', t);
    // Labels appear in layers as you zoom in: companies always, roles next, everything else up close.
    svg.classed('z1', t.k > 1.15).classed('zoomed', t.k > 1.8);
    let s = 24 * t.k; while (s < 12) s *= 4;
    svg.style('background-size', `${s}px ${s}px`).style('background-position', `${t.x}px ${t.y}px`);
  });
svg.call(zoom).on('dblclick.zoom', null);
function centerView() { const n = svg.node(); svg.call(zoom.transform, d3.zoomIdentity.translate(n.clientWidth / 2, n.clientHeight / 2)); }

const LINKDIST = { 'roles-companyId': 70, 'people-companyId': 78, 'applications-roleId': 46, 'interviews-applicationId': 40, 'events-refs': 34 };
const sim = d3.forceSimulation()
  .force('link', d3.forceLink().id(d => d.key).distance(l => LINKDIST[l.kind] || 90).strength(l => l.kind.includes('resume') || l.kind.includes('letter') ? .08 : .55))
  .force('charge', d3.forceManyBody().strength(d => d.col === 'companies' ? -1100 : d.col === 'events' ? -60 : -240).distanceMax(600))
  .force('collide', d3.forceCollide().radius(collideR).strength(.8))
  .force('x', d3.forceX().strength(.04)).force('y', d3.forceY().strength(.055))
  .force('labels', labelForce)
  .velocityDecay(.55).alphaDecay(.045)
  .on('tick', ticked);
// Company names are wide, so circles alone don't keep them apart. Treat each name as a box
// under its hexagon: push other companies (and nodes sitting on the name) out of it.
function labelForce(alpha) {
  const cs = simNodes.filter(n => n.col === 'companies');
  const box = c => ({ x: c.x, y: c.y + c.r + 22 + Math.min(c.reach || 0, 4) * 5, hw: c.lw / 2 + 10, hh: 16 });
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j], w = (a.lw + b.lw) / 2 + 30, h = 90, dx = b.x - a.x, dy = b.y - a.y;
    const ox = w - Math.abs(dx), oy = h - Math.abs(dy);
    if (ox > 0 && oy > 0) {
      if (ox * .55 < oy) { const m = ox * alpha * .4 * (Math.sign(dx) || 1); a.vx -= m; b.vx += m; }
      else { const m = oy * alpha * .4 * (Math.sign(dy) || 1); a.vy -= m; b.vy += m; }
    }
  }
  for (const c of cs) {
    const bx = box(c);
    for (const n of simNodes) {
      if (n === c) continue;
      const dx = n.x - bx.x, dy = n.y - bx.y, ox = bx.hw + n.r - Math.abs(dx), oy = bx.hh + n.r - Math.abs(dy);
      if (ox > 0 && oy > 0) {
        if (ox < oy * 1.5 && Math.abs(dx) > bx.hw * .6) n.vx += (Math.sign(dx) || 1) * ox * alpha * 1.1;
        else n.vy += (Math.sign(dy) || 1) * oy * alpha * 1.1;
      }
    }
  }
}
function linkPath(l) {
  const x1 = l.source.x, y1 = l.source.y, x2 = l.target.x, y2 = l.target.y;
  const cx = (x1 + x2) / 2 - (y2 - y1) * l.bend, cy = (y1 + y2) / 2 + (x2 - x1) * l.bend;
  return `M${x1.toFixed(1)},${y1.toFixed(1)}Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}
function ticked() {
  linkSel.attr('d', linkPath);
  nodeSel.attr('transform', n => `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`);
}

function zoomToFit(dur = 750) {
  if (!simNodes.length) return;
  const el = svg.node(), W = el.clientWidth, H = el.clientHeight;
  if (!W || !H) return;
  const xs = simNodes.map(n => n.x), ys = simNodes.map(n => n.y);
  const x0 = Math.min(...xs) - 50, x1 = Math.max(...xs) + 50, y0 = Math.min(...ys) - 70, y1 = Math.max(...ys) + 60;
  const k = Math.min(1.4, .9 * Math.min(W / (x1 - x0), H / (y1 - y0)));
  const t = d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, H / 2 - k * (y0 + y1) / 2 + 24).scale(k);
  if (RM || !dur) svg.call(zoom.transform, t);
  else svg.transition().duration(dur).ease(d3.easeCubicInOut).call(zoom.transform, t);
}
// Dragged nodes stay where you put them (double-click one, or use Tidy, to let it float again).
const drag = d3.drag()
  .on('start', (e, d) => { dragging = true; setHover(null); if (!e.active) sim.alphaTarget(.04).restart(); d.fx = d.x; d.fy = d.y; })
  .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
  .on('end', e => { dragging = false; if (!e.active) sim.alphaTarget(0); });
function tidy() {
  for (const n of simNodes) { n.fx = null; n.fy = null; }
  sim.alpha(.35).restart();
  setTimeout(() => zoomToFit(), RM ? 0 : 900);
}

// Each node's drawing depends only on these; redraw just when they change.
const visualSig = n => [n.col, n.r, n.rec.status, n.reach, !!n.referral].join('|');
function drawNode(g, n) {
  const seed = seedOf(n.key), sel = d3.select(g);
  const art = sel.select('g.art').node();
  const halo = sel.select('g.halo').node(), body = sel.select('g.body').node(), mark = sel.select('g.mark').node(),
    star = sel.select('g.star').node(), ring = sel.select('g.selring').node();
  sel.select('path.paper').attr('d', n.col === 'applications' || n.col === 'events' ? shapePath('x', n.r) : shapePath(n.col, n.r));
  body.replaceChildren(...sketchShape(n.col, n.r, shapePath(n.col, n.r), seed, n.rec.status));
  const rings = [];
  if (n.col === 'companies') {
    const k = Math.min(n.reach || 0, 4);
    for (let i = 0; i < k; i++) { const gr = svgEl('g', `ring-reach i${i}${i === k - 1 ? ' last' : ''}`); gr.append(...sketchCircle(n.r + 6 + i * 5, seed + i + 1)); rings.push(gr); }
  }
  if (n.referral) { const gr = svgEl('g', 'ring-ref'); gr.append(...sketchCircle(n.r + 4, seed + 11, { strokeWidth: 1.8 })); rings.push(gr); }
  if (n.col === 'applications' && n.rec.status === 'offer') { const gr = svgEl('g', 'ring-offer'); gr.append(...sketchCircle(n.r + (n.referral ? 9 : 5), seed + 12, { strokeWidth: 3 })); rings.push(gr); }
  halo.replaceChildren(...rings);
  mark.replaceChildren(...(n.col !== 'applications' ? [] : n.rec.status === 'rejected' ? sketchCross(n.r * .62, seed + 3) : n.rec.status === 'withdrawn' ? sketchSlash(n.r * .62, seed + 3) : []));
  star.replaceChildren(...(n.referral ? sketchStar(n.r * .95, -n.r * .95, 5.5, seed + 5) : []));
  ring.replaceChildren(...sketchCircle(n.r + (n.col === 'companies' ? 8 + Math.min(n.reach || 0, 4) * 5 : 7), seed + 21, { strokeWidth: 1.6, roughness: 2 }));
  n._vsig = visualSig(n);
  void art;
}
function svgEl(tag, cls) { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); if (cls) el.setAttribute('class', cls); return el; }

function updateGraph() {
  const nodes = [];
  for (const c of COLS) {
    if (!state.types.has(c)) continue;
    for (const r of state.data[c].values()) {
      if (c === 'applications' && !state.statuses.has(r.status || 'applied')) continue;
      nodes.push({ key: c + '/' + r.id, col: c, rec: r, r: TYPES[c].r });
    }
  }
  const inSet = new Set(nodes.map(n => n.key));
  const links = allLinks().filter(l => inSet.has(l.source) && inSet.has(l.target))
    .map(l => { const id = l.source + '>' + l.target + ':' + l.kind; return { ...l, id, bend: ((seedOf(id) % 100) / 100 - .5) * .28 }; });
  const newSig = nodes.map(n => n.key).join('|') + '#' + links.map(l => l.id).join('|');
  const old = new Map(simNodes.map(n => [n.key, n]));
  const merged = nodes.map(n => { const o = old.get(n.key); if (o) { o.rec = n.rec; return o; } return n; });
  for (const n of merged) {
    if (n.col === 'companies') {
      n.reach = companyContacts(n.rec.id).size; n.r = TYPES.companies.r + Math.min(n.reach, 6) * 1.6;
      n.lw = Math.min(titleOf('companies', n.rec).length, 27) * 9.2; // approx. width of the Caveat label
    }
    if (n.col === 'applications') n.referral = referralOf(n.rec);
  }
  const newSizeSig = merged.filter(n => n.col === 'companies').map(n => n.reach + ':' + n.lw).join(',');
  const sizeChanged = newSizeSig !== sizeSig;
  if (sizeChanged) { sizeSig = newSizeSig; sim.force('collide').radius(collideR); }
  if (newSig !== sig) {
    sig = newSig;
    const byKey = new Map(merged.map(n => [n.key, n]));
    for (const n of merged) if (n.x == null) {
      const l = links.find(l => (l.source === n.key && byKey.get(l.target)?.x != null) || (l.target === n.key && byKey.get(l.source)?.x != null));
      const nb = l && byKey.get(l.source === n.key ? l.target : l.source);
      const a = Math.random() * Math.PI * 2;
      if (nb) { n.x = nb.x + Math.cos(a) * 30; n.y = nb.y + Math.sin(a) * 30; }
    }
    simNodes = merged; simLinks = links;
    sim.nodes(simNodes); sim.force('link').links(simLinks);
    if (!didFit && simNodes.length) {
      // First view (or a fresh import): settle the layout off-screen, then show it already calm.
      sim.alpha(1).stop();
      for (let i = 0; i < 320; i++) sim.tick();
      sim.alpha(0);
      didFit = true;
      requestAnimationFrame(() => zoomToFit(old.size ? 750 : 0));
      svg.classed('settled', true);
    } else sim.alpha(old.size ? .12 : .5).restart();
  } else if (sizeChanged) sim.alpha(.1).restart();

  const isRefLink = l => l.kind === 'applications-personIds' && getKey(l.target.key || l.target)?.kind === 'Referral';
  const isDead = l => [l.source, l.target].some(e => { const k = e.key || e; return k.startsWith('applications/') && CLOSED.includes(getKey(k)?.status); });
  const isFaint = l => /resumeId|letterId|events-refs/.test(l.kind);
  linkSel = gLinks.selectAll('path').data(simLinks, l => l.id).join('path')
    .attr('class', l => 'link k-' + l.kind + (isRefLink(l) ? ' referral' : '') + (isDead(l) ? ' dead' : '') + (isFaint(l) ? ' faint' : ''));
  nodeSel = gNodes.selectAll('g.node').data(simNodes, n => n.key).join(enter => {
    const g = enter.append('g').call(drag)
      .on('click', (e, n) => { e.stopPropagation(); openRecord(n.key); })
      .on('dblclick', (e, n) => { e.stopPropagation(); n.fx = null; n.fy = null; sim.alpha(.08).restart(); })
      .on('mouseenter', (e, n) => setHover(n))
      .on('mouseleave', () => setHover(null));
    const art = g.append('g').attr('class', 'art');
    art.append('g').attr('class', 'halo');
    art.append('g').attr('class', 'selring');
    art.append('path').attr('class', 'paper');
    art.append('g').attr('class', 'body');
    art.append('g').attr('class', 'mark');
    art.append('g').attr('class', 'star');
    g.append('text').attr('class', 'label');
    g.append('text').attr('class', 'reach');
    g.append('title');
    return g;
  });
  const q = !!state.search.trim();
  svg.classed('searching', q);
  nodeSel
    .attr('class', n => `node t-${n.col}${n.col === 'applications' ? ' s-' + (n.rec.status || 'applied') : ''}${n.reach >= 3 ? ' hot' : ''}${state.selected === n.key ? ' selected' : ''}${q && matches(n.col, n.rec) ? ' match' : ''}`)
    .attr('tabindex', 0).attr('role', 'button').attr('aria-label', n => `${TYPES[n.col].label}: ${optLabel(n.col, n.rec)}`)
    .on('keydown', (e, n) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRecord(n.key); } })
    .each(function (n) { if (n._vsig !== visualSig(n)) drawNode(this, n); });
  const labelY = n => n.r + 15 + (n.col === 'companies' ? Math.min(n.reach || 0, 4) * 5 + 2 : n.referral ? 4 : 0);
  nodeSel.select('text.label').attr('y', labelY).text(n => { const t = titleOf(n.col, n.rec); return t.length > 28 ? t.slice(0, 26) + '…' : t; });
  nodeSel.select('text.reach').attr('y', n => labelY(n) + 14).text(n => n.col === 'companies' && n.reach ? `${n.reach} contact${n.reach === 1 ? '' : 's'}` : '');
  nodeSel.select('title').text(n => {
    let s = `${TYPES[n.col].label}: ${optLabel(n.col, n.rec)}${subOf(n.col, n.rec) ? '\n' + subOf(n.col, n.rec) : ''}`;
    if (n.col === 'companies') s += `\n${n.reach || 0} contact${n.reach === 1 ? '' : 's'} reached`;
    if (n.referral) s += '\nReferral' + (n.referral.name ? ' from ' + n.referral.name : '');
    return s;
  });
  ticked();
}
// Hover waits a beat before dimming the rest, and lingers briefly on the way out,
// so sweeping the mouse across the map doesn't flicker.
let hoverT = 0, hovered = null;
function setHover(n) {
  clearTimeout(hoverT);
  if (dragging && n) return;
  hoverT = setTimeout(() => { hovered = n; highlight(n); }, n ? (hovered ? 60 : 140) : 180);
}
function highlight(n) {
  svg.classed('hovering', !!n);
  if (!n) { nodeSel.classed('hl', false); linkSel.classed('hl', false); return; }
  const nb = new Set([n.key]);
  linkSel.classed('hl', l => { const on = l.source.key === n.key || l.target.key === n.key; if (on) { nb.add(l.source.key); nb.add(l.target.key); } return on; });
  nodeSel.classed('hl', d => nb.has(d.key));
}
svg.on('click', () => { if (panel.mode) closePanel(); });
$('#fitBtn').onclick = () => zoomToFit();
$('#tidyBtn').onclick = tidy;

function renderLegend() {
  const ico = (key, build) => `<svg viewBox="-12 -12 24 24" aria-hidden="true">${sketchIconMarkup(key, build)}</svg>`;
  const wrap = (cls, els) => () => { const g = svgEl('g', cls); g.append(...els()); return [g]; };
  $('#legend').innerHTML = [
    [ico('lg-reach', () => [...wrap('ring-reach i1', () => sketchCircle(10, 3))(), ...wrap('ring-reach i0', () => sketchCircle(7.5, 4))(), ...wrap('t-companies', () => sketchShape('companies', 5, shapePath('companies', 5), 5))()]), 'Rings = contacts reached'],
    [ico('lg-ref', () => [...wrap('ring-ref', () => sketchCircle(8, 6))(), ...wrap('s-applied', () => sketchShape('applications', 5, '', 7, 'applied'))(), ...wrap('star', () => sketchStar(6, -6, 4, 8))()]), 'Referral'],
    [ico('lg-rej', () => wrap('s-rejected', () => [...sketchShape('applications', 6, '', 9, 'rejected'), ...wrapMark(sketchCross(3.6, 10))])()), 'Rejected'],
    [ico('lg-offer', () => [...wrap('ring-offer', () => sketchCircle(8.5, 12, { strokeWidth: 2.5 }))(), ...wrap('s-offer', () => sketchShape('applications', 5, '', 13, 'offer'))()]), 'Offer'],
  ].map(([svgm, label]) => `<span>${svgm}${label}</span>`).join('');
}
function wrapMark(els) { const g = svgEl('g', 'mark'); g.append(...els); return [g]; }

function renderChips() {
  const tc = $('#typeChips'); tc.replaceChildren();
  for (const c of COLS) {
    const on = state.types.has(c);
    tc.append(h('button', { class: 'chip', 'aria-pressed': String(on), title: (on ? 'Hide ' : 'Show ') + TYPES[c].plural.toLowerCase(),
      onclick: () => { on ? state.types.delete(c) : state.types.add(c); scheduleRender(); } },
      icon(c), TYPES[c].plural, h('span', { class: 'n' }, state.data[c].size)));
  }
  const sc = $('#statusChips'); sc.replaceChildren();
  if (!state.types.has('applications') || !state.data.applications.size) return;
  for (const s of STATUSES) {
    const n = all('applications').filter(a => (a.status || 'applied') === s.k).length; if (!n) continue;
    const on = state.statuses.has(s.k);
    sc.append(h('button', { class: 'chip', 'aria-pressed': String(on), title: (on ? 'Hide ' : 'Show ') + s.l.toLowerCase() + ' applications',
      onclick: () => { on ? state.statuses.delete(s.k) : state.statuses.add(s.k); scheduleRender(); } },
      icon('applications', s.k), s.l, h('span', { class: 'n' }, n)));
  }
}
function renderEmpty() {
  const el = $('#empty'); const total = COLS.reduce((t, c) => t + state.data[c].size, 0);
  const loading = state.dbState === 'connecting' || (state.dbState === 'ok' && !store.loaded);
  if (total && !loading) { el.hidden = true; return; }
  if (state.view !== 'graph') { el.hidden = true; return; }
  el.hidden = false; el.replaceChildren(h('div', { class: 'empty-card' },
    loading ? [h('h2', null, 'Loading your job hunt…'), h('p', null, 'Companies, roles and applications will appear here as a connected map.')]
      : [h('h2', null, 'Map your job hunt'), h('p', null, 'Start with a company you want to work for. Then add the role, your application, the resume you sent and the people you talk to. Each one links up on this map.'),
        h('div', { class: 'row', style: 'justify-content:center' },
          h('button', { class: 'btn primary', onclick: () => openNew('companies') }, 'Add your first company'),
          h('button', { class: 'btn', onclick: loadSample }, 'Explore a sample map'))]));
}

/* ---------- Pipeline ---------- */
let dragId = null;
function renderPipeline() {
  const board = $('#board'); board.replaceChildren();
  const apps = all('applications').filter(a => matches('applications', a));
  for (const s of STATUSES) {
    const list = apps.filter(a => (a.status || 'applied') === s.k).sort((a, b) => (b.statusAt || b.applied || '').localeCompare(a.statusAt || a.applied || ''));
    const dot = h('span', { class: 'dot' }); dot.style.background = statusColor(s.k);
    const col = h('div', { class: 'col' + (CLOSED.includes(s.k) ? ' closed' : '') },
      h('div', { class: 'col-head' }, dot, s.l, h('span', { class: 'count' }, list.length)),
      h('div', { class: 'cards' }, list.length ? list.map(card) : h('div', { class: 'col-empty' }, s.k === 'wishlist' ? 'Roles you plan to apply to' : 'Drop an application here')));
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
    col.addEventListener('drop', e => { e.preventDefault(); col.classList.remove('over'); const id = e.dataTransfer.getData('text/plain') || dragId; if (id) setStatus(id, s.k); });
    board.append(col);
  }
}
function card(a) {
  const co = companyOf('applications', a)?.name || 'No company';
  const days = daysSince(a.statusAt || a.applied);
  const next = interviewsFor(a.id).filter(i => i.date && parseD(i.date) >= Date.now()).sort((x, y) => x.date.localeCompare(y.date))[0];
  const resume = get('documents', a.resumeId);
  const stale = a.status === 'applied' && days != null && days >= 14;
  const ref = referralOf(a);
  const el = h('div', { class: 'card' + (ref ? ' ref-card' : '') + (['rejected', 'withdrawn'].includes(a.status) ? ' closed-card' : ''), draggable: 'true', tabindex: 0, role: 'button', 'aria-label': `${titleOf('applications', a)} at ${co}`,
    onclick: () => openRecord('applications/' + a.id),
    onkeydown: e => { if (e.key === 'Enter') openRecord('applications/' + a.id); } },
    h('div', { class: 't' }, titleOf('applications', a)), h('div', { class: 'c' }, co),
    h('div', { class: 'meta' },
      ref ? h('span', { class: 'tag-ref' }, '★ Referral' + (ref.name ? ': ' + ref.name.replace(/ \(sample\)$/, '') : '')) : null,
      days != null ? h('span', { class: stale ? 'warn' : '' }, a.status === 'rejected' ? `rejected after ${daysBetween(a.applied, a.statusAt) ?? '?'}d` : stale ? `${days}d, no reply` : `${days}d in stage`) : null,
      next ? h('span', null, 'next: ' + fmtDate(next.date, false)) : null,
      resume ? h('span', null, resume.name) : null));
  el.addEventListener('dragstart', e => { dragId = a.id; e.dataTransfer.setData('text/plain', a.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); });
  el.addEventListener('dragend', () => { dragId = null; el.classList.remove('dragging'); });
  return el;
}

/* ---------- Timeline ---------- */
function renderTimeline() {
  const root = $('#timeline'); root.replaceChildren();
  const items = [];
  for (const a of all('applications')) if (a.applied && a.status !== 'wishlist') items.push({ col: 'applications', r: a, date: a.applied, what: 'Applied: ' + titleOf('applications', a), status: a.status });
  for (const i of all('interviews')) if (i.date) items.push({ col: 'interviews', r: i, date: i.date, what: titleOf('interviews', i) + ' interview' });
  for (const e of all('events')) if (e.date) items.push({ col: 'events', r: e, date: e.date, what: e.title || 'Event' });
  const companies = all('companies').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const sel = h('select', { id: 'tlCompany' }, h('option', { value: '' }, 'All companies'), companies.map(c => h('option', { value: c.id }, c.name)));
  sel.value = state.tlCompany; sel.onchange = () => { state.tlCompany = sel.value; renderTimeline(); };
  root.append(h('div', { class: 'tl-bar' }, h('label', { for: 'tlCompany' }, 'Company'), sel));
  const filtered = items.filter(it => (!state.tlCompany || companyOf(it.col, it.r)?.id === state.tlCompany) && matches(it.col, it.r));
  const row = it => {
    const co = companyOf(it.col, it.r)?.name;
    return h('button', { class: 'tl-item', onclick: () => openRecord(it.col + '/' + it.r.id) },
      icon(it.col, it.status), h('time', { datetime: it.date }, fmtDate(it.date, false)),
      h('div', { class: 'what' }, h('b', null, it.what), (co || it.r.kind) ? h('span', null, [co, it.col === 'events' ? it.r.kind : it.col === 'interviews' ? fmtDate(it.date) : STATUS_L[it.status]].filter(Boolean).join(' · ')) : null));
  };
  const now = Date.now(), todayStr = localDate();
  const future = filtered.filter(it => it.date.length > 10 ? parseD(it.date) >= now : it.date > todayStr).sort((a, b) => a.date.localeCompare(b.date));
  const past = filtered.filter(it => !future.includes(it)).sort((a, b) => b.date.localeCompare(a.date));
  if (future.length) root.append(h('section', { class: 'upcoming' }, h('h3', null, 'Coming up', h('small', null, future.length)), h('div', { class: 'tl-list' }, future.map(row))));
  if (!past.length && !future.length) { root.append(h('p', { class: 'tl-none' }, 'Nothing on the timeline yet. Applications with a date applied, interviews and events show up here, newest first.')); return; }
  const groups = d3.groups(past, it => it.date.slice(0, 7));
  for (const [ym, list] of groups) {
    const label = new Date(ym + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    root.append(h('section', null, h('h3', null, label, h('small', null, list.length)), h('div', { class: 'tl-list' }, list.map(row))));
  }
}

/* ---------- Panel ---------- */
function openRecord(key) {
  const [col, id] = key.split('/'); const rec = get(col, id); if (!rec) return;
  panel = { mode: 'edit', col, id, dirty: false, draft: structuredClone(rec), confirmDel: false };
  state.selected = key; renderPanel(true); scheduleRender();
}
function openNew(col, preset = {}) {
  closeMenu();
  panel = { mode: 'new', col, id: newId(col), dirty: true, draft: { ...(DEFAULTS[col]?.() || {}), ...preset }, confirmDel: false };
  state.selected = null; renderPanel(true); scheduleRender();
  setTimeout(() => $('#panel input, #panel select')?.focus(), 30);
}
function closePanel() { panel = { mode: null }; state.selected = null; $('#panel').hidden = true; scheduleRender(); }
function markDirty() { panel.dirty = true; const b = $('#saveBtn'); if (b) b.disabled = false; }

function fieldEl(col, f) {
  const d = panel.draft, id = `f-${col}-${f.k}`;
  let ctl;
  const bind = (el, fn) => { el.addEventListener('input', () => { fn(); markDirty(); }); el.addEventListener('change', () => { fn(); markDirty(); }); };
  switch (f.kind) {
    case 'text': case 'url': case 'date': case 'datetime':
      ctl = h('input', { id, type: { text: 'text', url: 'url', date: 'date', datetime: 'datetime-local' }[f.kind], placeholder: f.ph || '' });
      ctl.value = d[f.k] || ''; bind(ctl, () => { d[f.k] = ctl.value; }); break;
    case 'textarea':
      ctl = h('textarea', { id, rows: 3 }); ctl.value = d[f.k] || ''; bind(ctl, () => { d[f.k] = ctl.value; }); break;
    case 'select':
      ctl = h('select', { id }, f.options.map(o => h('option', { value: o.v }, o.l))); ctl.value = d[f.k] || f.options[0].v;
      if (!d[f.k]) d[f.k] = f.options[0].v;
      bind(ctl, () => { d[f.k] = ctl.value; }); break;
    case 'status':
      if (panel.mode === 'edit') {
        ctl = h('div', { class: 'pills', role: 'group', 'aria-label': 'Stage' }, STATUSES.map(s =>
          h('button', { class: 'pill', type: 'button', 'aria-pressed': String((d.status || 'applied') === s.k), onclick: () => { d.status = s.k; setStatus(panel.id, s.k); } }, icon('applications', s.k), s.l)));
      } else {
        ctl = h('select', { id }, STATUSES.map(s => h('option', { value: s.k }, s.l))); ctl.value = d.status || 'applied';
        bind(ctl, () => { d.status = ctl.value; });
      }
      break;
    case 'ref': {
      const list = all(f.to).filter(r => !f.filter || f.filter(r)).map(r => ({ id: r.id, l: optLabel(f.to, r) })).sort((a, b) => a.l.localeCompare(b.l));
      ctl = h('select', { id }, h('option', { value: '' }, list.length ? '— None —' : `— No ${TYPES[f.to].plural.toLowerCase()} yet —`), list.map(o => h('option', { value: o.id }, o.l)));
      ctl.value = d[f.k] && exists(f.to + '/' + d[f.k]) ? d[f.k] : '';
      bind(ctl, () => { d[f.k] = ctl.value; }); break;
    }
    case 'refs': case 'anyrefs': {
      const any = f.kind === 'anyrefs';
      const toKey = v => any ? v : f.to + '/' + v;
      ctl = h('div', { class: 'multi' });
      const draw = () => {
        const cur = (d[f.k] || []).filter(v => exists(toKey(v)));
        const tags = h('div', { class: 'tags' }, cur.map(v => {
          const [c] = toKey(v).split('/');
          return h('span', { class: 'tag' }, icon(c), h('span', null, optLabel(c, getKey(toKey(v)))),
            h('button', { type: 'button', 'aria-label': 'Remove', onclick: () => { d[f.k] = cur.filter(x => x !== v); markDirty(); draw(); } }, '×'));
        }));
        const add = h('select', { id }, h('option', { value: '' }, '+ Add…'));
        const groupsFor = any ? COLS.filter(c => !(panel.col === c && false)) : [f.to];
        for (const c of groupsFor) {
          const opts2 = all(c).filter(r => !(c === panel.col && r.id === panel.id)).map(r => ({ v: any ? c + '/' + r.id : r.id, l: optLabel(c, r) }))
            .filter(o => !cur.includes(o.v)).sort((a, b) => a.l.localeCompare(b.l));
          if (!opts2.length) continue;
          const opEls = opts2.map(o => h('option', { value: o.v }, o.l));
          if (any) add.append(h('optgroup', { label: TYPES[c].plural }, opEls)); else add.append(...opEls);
        }
        add.onchange = () => { if (add.value) { d[f.k] = [...cur, add.value]; markDirty(); draw(); $('#' + CSS.escape(id))?.focus(); } };
        ctl.replaceChildren(cur.length ? tags : null, add);
      };
      draw(); break;
    }
    case 'file': {
      ctl = h('div', { class: 'file-box' });
      const draw = () => {
        const kids = [];
        if (d.fileId) {
          // Files are private: each view asks for a short-lived signed link.
          const img = (d.fileType || '').startsWith('image/') ? h('img', { alt: d.fileName || 'Attached image' }) : null;
          const link = h('a', { href: '#', target: '_blank', rel: 'noopener' }, d.fileName || 'Open file');
          const path = d.fileId;
          store.fileUrl(path).then(u => { if (d.fileId !== path) return; link.href = u; if (img) img.src = u; })
            .catch(() => { link.replaceWith(h('span', { class: 'note' }, 'File not found. It may have been deleted.')); img?.remove(); });
          if (img) kids.push(img);
          kids.push(h('div', { class: 'file-row' }, link,
            h('button', { class: 'btn small', type: 'button', onclick: () => { d.fileId = ''; d.fileName = ''; d.fileType = ''; markDirty(); draw(); } }, 'Remove')));
        }
        {
          const inp = h('input', { id, type: 'file', accept: '.pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md' });
          inp.onchange = async () => {
            const file = inp.files[0]; if (!file) return;
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            const typeMap = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', txt: 'text/plain', md: 'text/markdown' };
            const type = typeMap[ext];
            if (!type) { toast(ext === 'docx' || ext === 'doc' ? 'Word files can’t be stored here. Export it as a PDF and attach that.' : 'Attach a PDF, image, or text file.'); inp.value = ''; return; }
            const note = h('div', { class: 'note' }, 'Uploading ' + file.name + '…'); ctl.append(note);
            if (file.size > 20 * 1024 * 1024) { toast('That file is over 20 MB. Compress it and try again.'); inp.value = ''; return; }
            try { const res = await store.upload(file, type); d.fileId = res.id; d.fileName = file.name; d.fileType = res.contentType; markDirty(); toast('File attached. Save to keep it.'); }
            catch (e) { console.warn('[rat-race] upload', e); toast('Upload failed. Try again in a moment.'); }
            draw();
          };
          kids.push(inp);
        }
        ctl.replaceChildren(...kids);
      };
      draw(); break;
    }
  }
  return h('div', { class: 'field' + (f.half ? ' half' : '') }, h('label', { for: id }, f.label + (f.req ? ' *' : '')), ctl);
}

function renderPanel(force) {
  const el = $('#panel');
  if (!panel.mode) { el.hidden = true; return; }
  const { col, id } = panel;
  if (panel.mode === 'edit') {
    const rec = get(col, id);
    if (!rec) { if (store.loaded) closePanel(); return; }
    if (!force && panel.dirty) return;
    if (!force) panel.draft = structuredClone(rec);
  } else if (!force) return;
  const scroll = el.querySelector('.p-body')?.scrollTop || 0;
  const T = TYPES[col], d = panel.draft, isNew = panel.mode === 'new';
  const body = h('div', { class: 'p-body' });
  body.append(h('div', null, h('h2', { class: 'p-title' }, isNew ? 'New ' + T.label.toLowerCase() : optLabel(col, d)), !isNew && subOf(col, d) ? h('p', { class: 'p-sub' }, subOf(col, d)) : null));

  if (!isNew && col === 'applications') {
    const days = daysSince(d.statusAt || d.applied);
    if (d.status === 'applied' && days >= 14) body.append(h('div', { class: 'nudge' }, `No reply in ${days} days. Send a follow-up, or move it to Ghosted.`));
    const ref = referralOf(d);
    if (ref) body.append(h('div', { class: 'perf tag-ref' }, '★ Referral' + (ref.name ? ' from ' + ref.name : ' (source)')));
    if (d.status === 'rejected') {
      const n = interviewsFor(id).length, after = daysBetween(d.applied, d.statusAt);
      body.append(h('div', { class: 'perf' }, '✕ Rejected', d.statusAt ? ' on ' + fmtDate(d.statusAt) : '',
        after != null ? `, ${after} days after applying` : '', n ? ` and ${n} interview${n === 1 ? '' : 's'}` : ', before any interview', '.'));
    }
  }
  if (!isNew && col === 'companies') {
    const ppl = [...companyContacts(id)].map(pid => get('people', pid));
    body.append(h('div', { class: 'perf' }, h('b', null, ppl.length), ` contact${ppl.length === 1 ? '' : 's'} reached here`,
      ppl.some(p => p.kind === 'Referral') ? ', including a referral' : '', ppl.length ? '' : '. Add a contact to light this company up on the map.'));
  }
  if (!isNew && col === 'documents' && d.kind === 'Resume') {
    const used = all('applications').filter(a => a.resumeId === id && a.status !== 'wishlist');
    body.append(h('div', { class: 'perf' }, 'Sent with ', h('b', null, used.length), ' application' + (used.length === 1 ? '' : 's'), ' · ', h('b', null, used.filter(reachedInterview).length), ' reached interview'));
  }
  if (!isNew && col === 'people' && d.email) {
    body.append(h('div', { class: 'row' }, h('span', { class: 'note' }, d.email),
      h('button', { class: 'btn small', type: 'button', onclick: () => navigator.clipboard.writeText(d.email).then(() => toast('Email copied'), () => toast('Copy failed. Select the address instead.')) }, 'Copy email')));
  }

  const form = h('form', { class: 'form', onsubmit: e => { e.preventDefault(); savePanel(); } }, T.fields.map(f => fieldEl(col, f)));
  body.append(form);

  if (!isNew) {
    const key = col + '/' + id;
    const out = refsOf(col, d).filter(x => exists(x.key)).map(x => ({ key: x.key, rel: x.f.label }));
    const inc = allLinks().filter(l => l.target === key).map(l => ({ key: l.source, rel: TYPES[l.source.split('/')[0]].label + ' → ' + l.rel.toLowerCase() }));
    const seen = new Set(); const links = [...out, ...inc].filter(x => !seen.has(x.key) && seen.add(x.key));
    const quick = {
      companies: [['roles', 'Role', { companyId: id }], ['people', 'Contact', { companyId: id }], ['events', 'Event', { refs: [key] }]],
      roles: [['applications', 'Application', { roleId: id }], ['events', 'Event', { refs: [key] }]],
      applications: [['interviews', 'Interview', { applicationId: id }], ['events', 'Event', { refs: [key] }]],
      people: [['events', 'Event', { kind: 'Outreach sent', refs: [key] }]],
      interviews: [['events', 'Event', { refs: [key] }]],
      documents: [], events: [],
    }[col];
    if (quick.length) body.append(h('div', { class: 'row' }, quick.map(([c, l, p]) => h('button', { class: 'btn small', type: 'button', onclick: () => openNew(c, p) }, icon(c), ' + ' + l))));
    body.append(h('div', { class: 'links' }, h('div', { class: 'sec-label' }, 'Connected to'),
      links.length ? links.map(x => { const [c] = x.key.split('/'); const r = getKey(x.key);
        return h('button', { class: 'link-chip', type: 'button', onclick: () => openRecord(x.key) }, icon(c, c === 'applications' ? r.status : null), h('span', { class: 'lt' }, optLabel(c, r)), h('span', { class: 'rel' }, x.rel)); })
        : h('div', { class: 'note' }, 'Nothing linked yet. Use the fields above to connect it.')));
  }

  const foot = h('div', { class: 'p-foot' });
  if (panel.confirmDel) {
    const n = allLinks().filter(l => l.target === col + '/' + id).length;
    foot.append(h('span', { class: 'note' }, n ? `Delete this? ${n} linked item${n === 1 ? '' : 's'} will lose the link.` : 'Delete this for good?'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn small', type: 'button', onclick: () => { panel.confirmDel = false; renderPanel(true); } }, 'Keep'),
      h('button', { class: 'btn small danger solid', type: 'button', onclick: () => deleteRecord(col, id) }, 'Delete'));
  } else {
    foot.append(h('button', { id: 'saveBtn', class: 'btn primary', type: 'button', disabled: !panel.dirty, onclick: savePanel }, isNew ? 'Add ' + T.label.toLowerCase() : 'Save changes'));
    if (!isNew && panel.dirty) foot.append(h('button', { class: 'btn', type: 'button', onclick: () => { panel.dirty = false; renderPanel(false); renderPanel(true); } }, 'Discard'));
    foot.append(h('span', { class: 'spacer' }));
    if (!isNew) foot.append(h('button', { class: 'btn small danger', type: 'button', onclick: () => { panel.confirmDel = true; renderPanel(true); } }, 'Delete'));
  }

  el.replaceChildren(
    h('div', { class: 'p-head' }, h('span', { class: 'badge' }, icon(col, col === 'applications' ? d.status : null), T.label),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Close', onclick: closePanel }, '×')),
    body, foot);
  el.hidden = false;
  body.scrollTop = scroll;
}

async function savePanel() {
  if (readOnly) { toast('Changes are not allowed for your account.'); return; }
  const { col, id, draft } = panel, T = TYPES[col];
  for (const f of T.fields) if (f.req && !String(draft[f.k] || '').trim()) {
    toast(`${f.label} is required.`); $(`#f-${col}-${f.k}`)?.focus(); return;
  }
  const prev = panel.mode === 'edit' ? get(col, id) : null;
  const body = stripId(draft);
  for (const k of Object.keys(body)) if (typeof body[k] === 'string') body[k] = body[k].trim();
  body.updatedAt = new Date().toISOString();
  if (!prev) body.createdAt = body.updatedAt;
  if (col === 'applications' && (!prev || prev.status !== body.status)) body.statusAt = localDate();
  const ok = await write(col, id, body); if (!ok) return;
  if (col === 'applications' && !prev && body.status !== 'wishlist') await logEvent('Applied', 'Status change', ['applications/' + id]);
  if (prev && prev.fileId && prev.fileId !== body.fileId) store.deleteFile(prev.fileId).catch(() => {});
  panel = { mode: 'edit', col, id, dirty: false, draft: structuredClone({ ...body, id }), confirmDel: false };
  state.selected = col + '/' + id;
  toast(prev ? 'Saved' : T.label + ' added');
  renderPanel(true); scheduleRender();
}

/* ---------- Chrome ---------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200); }
const addBtn = $('#addBtn'), addMenu = $('#addMenu');
addMenu.append(...COLS.map(c => h('button', { type: 'button', onclick: () => openNew(c) }, icon(c, c === 'applications' ? 'applied' : null), TYPES[c].label)));
function closeMenu() { addMenu.hidden = true; addBtn.setAttribute('aria-expanded', 'false'); }
addBtn.onclick = e => { e.stopPropagation(); addMenu.hidden = !addMenu.hidden; addBtn.setAttribute('aria-expanded', String(!addMenu.hidden)); if (!addMenu.hidden) addMenu.querySelector('button').focus(); };
document.addEventListener('click', e => { if (!addMenu.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!addMenu.hidden) closeMenu(); else if (panel.mode && !panel.dirty) closePanel(); } });
$('#clearSample').onclick = clearSample;
let searchT; $('#search').addEventListener('input', e => { clearTimeout(searchT); searchT = setTimeout(() => { state.search = e.target.value; scheduleRender(); }, 120); });
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => setView(b.dataset.view));
function setView(v) {
  state.view = v;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  for (const k of ['graph', 'pipeline', 'timeline']) $('#view-' + k).hidden = k !== v;
  try { localStorage.setItem('rr-view', v); } catch (e) {}
  scheduleRender();
}
try { const v = localStorage.getItem('rr-view'); if (['graph', 'pipeline', 'timeline'].includes(v)) setView(v); } catch (e) {}
const KEYS = ['graph', 'pipeline', 'timeline'];
if (KEYS.includes(location.hash.slice(1))) setView(location.hash.slice(1));

centerView();
new ResizeObserver(() => { if (!didFit) centerView(); }).observe(svg.node());
renderLegend();
render();
boot();
