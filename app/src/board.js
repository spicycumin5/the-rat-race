// The case board: every record is a piece of paper pinned to cork.
//   companies    = mugshot polaroids (the "perps")
//   people       = small polaroids (informants)
//   roles        = ruled index cards
//   applications = manila case tags with a rubber stamp for the stage
//   documents    = typed sheets          interviews = sticky notes
//   events       = newspaper clippings
// Cards are drawn centered on 0,0. Colors come from CSS classes, so both themes work.
import { sketchEllipse, sketchCross, sketchSlash, sketchCheck } from './sketch.js';

const NS = 'http://www.w3.org/2000/svg';
export const CARD = {
  companies: { w: 96, h: 116 }, people: { w: 66, h: 82 }, roles: { w: 108, h: 66 },
  applications: { w: 82, h: 50 }, documents: { w: 58, h: 72 }, interviews: { w: 70, h: 72 }, events: { w: 68, h: 38 },
};

function el(tag, attrs, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, v);
  for (const k of kids.flat()) if (k) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const g = (cls, ...kids) => el('g', { class: cls }, ...kids);
const text = (x, y, cls, s, extra) => el('text', { x, y, class: cls, ...extra }, s);
const rect = (x, y, w, h, cls, extra) => el('rect', { x, y, width: w, height: h, class: cls, ...extra });

/** Greedy word wrap into at most `max` lines of ~`n` characters, with an ellipsis on overflow. */
export function wrap(str, n, max) {
  const words = String(str || '').split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    if (w.length > n) w = w.slice(0, n - 1) + '…';
    const next = cur ? cur + ' ' + w : w;
    if (next.length <= n) { cur = next; continue; }
    lines.push(cur); cur = w;
    if (lines.length === max) { const last = lines[max - 1]; lines[max - 1] = (last.length > n - 1 ? last.slice(0, n - 1) : last) + '…'; return lines; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, max);
}
const clean = s => String(s || '').replace(/\s*\(sample\)$/i, '');
const initials = s => clean(s).split(/[\s\-/&]+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 3).map(w => w[0].toUpperCase()).join('') || '?';

export function rotationOf(col, seed) { const span = col === 'companies' ? 5 : 10; return ((seed % 1000) / 1000 - .5) * span; }
/** Where the thumbtack sits, in the card's own (unrotated) coordinates. */
export function pinLocal(col) { return { x: 0, y: -CARD[col].h / 2 + 7 }; }
export function collideRadius(n) {
  const c = CARD[n.col];
  return n.col === 'companies' ? 84 + Math.min(n.face.reach || 0, 4) * 5 : Math.max(c.w, c.h) / 2 + 22;
}

const silhouette = (cx, top, s) => [
  el('circle', { cx, cy: top + 10 * s, r: 9.5 * s, class: 'c-sil' }),
  el('path', { class: 'c-sil', d: `M${cx - 21 * s},${top + 48 * s}C${cx - 21 * s},${top + 28 * s} ${cx - 11 * s},${top + 21 * s} ${cx},${top + 21 * s}C${cx + 11 * s},${top + 21 * s} ${cx + 21 * s},${top + 28 * s} ${cx + 21 * s},${top + 48 * s}Z` })];

const star = (x, y, R) => {
  let d = '';
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * .45 : R; d += (i ? 'L' : 'M') + (x + r * Math.cos(a)).toFixed(1) + ',' + (y + r * Math.sin(a)).toFixed(1); }
  return el('path', { d: d + 'Z', class: 'c-star' });
};
function stamp(label, status, y, rot) {
  const w = label.length * 6.6 + 12;
  return el('g', { class: 'stamp st-' + status, transform: `translate(0,${y}) rotate(${rot})` },
    rect(-w / 2, -8, w, 16, 'stamp-box', { rx: 2 }), text(0, 4, 'stamp-txt', label));
}

/** Fill a node's <g class="card"> with its paper, face, marker marks and selection loop. */
export function drawCard(cardG, col, face, seed) {
  const { w, h } = CARD[col], x0 = -w / 2, y0 = -h / 2;
  const paper = g('paper'), body = g('face'), halo = g('halo'), marks = g('marks');
  const parts = [];
  switch (col) {
    case 'companies': {
      paper.append(rect(x0, y0, w, h, 'c-card'));
      const px = x0 + 7, py = y0 + 7, pw = w - 14, ph = 74;
      body.append(rect(px, py, pw, ph, 'c-photo'));
      for (let i = 0; i < 5; i++) {
        const ly = py + 10 + i * 13;
        body.append(el('line', { x1: px, x2: px + pw, y1: ly, y2: ly, class: 'c-height' }), text(px + pw - 3, ly - 2, 'c-height-n', String(7 - i)));
      }
      body.append(...silhouette(0, py + 14, 1));
      const card = 'No. ' + String(1000 + seed % 9000);
      body.append(rect(-22, py + ph - 25, 44, 18, 'c-placard'),
        text(0, py + ph - 17.5, 'c-placard-t', initials(face.name)), text(0, py + ph - 10, 'c-placard-n', card));
      body.append(rect(px, py, pw, ph, 'c-shade'), rect(px, py, pw, ph, 'c-grain'));
      const name = (clean(face.name) || 'Unnamed company').toUpperCase();
      const lines = wrap(name, 13, 2);
      lines.forEach((ln, i) => body.append(text(0, lines.length === 1 ? y0 + 103 : y0 + 97 + i * 11, 'c-type c-cap', ln)));
      if (+face.interest >= 4) body.append(stamp('WANTED', 'wanted', py + 12, -14));
      const k = Math.min(face.reach || 0, 4);
      for (let i = 0; i < k; i++) halo.append(g(`loop i${i}`, ...sketchEllipse(w + 26 + i * 9, h + 22 + i * 8, seed + i + 1)));
      break;
    }
    case 'people': {
      paper.append(rect(x0, y0, w, h, 'c-card'));
      const px = x0 + 5, py = y0 + 5, pw = w - 10, ph = 50;
      body.append(rect(px, py, pw, ph, 'c-photo2 k-' + (face.kind || 'Other').replace(/\s+/g, '-')));
      body.append(...silhouette(0, py + 9, .82), rect(px, py, pw, ph, 'c-shade'), rect(px, py, pw, ph, 'c-grain'));
      body.append(text(0, y0 + 67, 'c-type c-pname', wrap(clean(face.name) || 'Unnamed', 13, 1)[0] || ''));
      body.append(text(0, y0 + 77, 'c-mono c-tiny', (face.kind || '').toUpperCase()));
      if (face.kind === 'Referral') body.append(star(w / 2 - 6, y0 + 6, 8));
      break;
    }
    case 'roles': {
      paper.append(rect(x0, y0, w, h, 'c-card'));
      body.append(el('line', { x1: x0, x2: x0 + w, y1: y0 + 17, y2: y0 + 17, class: 'c-rule-red' }));
      for (let i = 0; i < 4; i++) body.append(el('line', { x1: x0, x2: x0 + w, y1: y0 + 29 + i * 11, y2: y0 + 29 + i * 11, class: 'c-rule' }));
      body.append(text(x0 + 6, y0 + 13, 'c-mono c-tiny c-left', 'POSITION' + (face.workplace ? ' · ' + face.workplace.toUpperCase() : '')));
      wrap(face.title || 'Untitled role', 17, 2).forEach((ln, i) => body.append(text(x0 + 6, y0 + 27 + i * 11, 'c-type c-left', ln)));
      if (face.salary) body.append(text(x0 + 6, y0 + 60, 'c-hand c-blue c-left', face.salary));
      break;
    }
    case 'applications': {
      const n = 11;
      paper.append(el('path', { class: 'c-manila', d: `M${x0 + n},${y0}H${x0 + w}V${y0 + h}H${x0 + n}L${x0},${y0 + h - n}V${y0 + n}Z` }));
      body.append(el('circle', { cx: x0 + 8, cy: 0, r: 3, class: 'c-hole' }));
      body.append(text(4, y0 + 13, 'c-type c-small', wrap(face.title || 'Application', 14, 1)[0]));
      body.append(stamp(face.statusLabel.toUpperCase(), face.status, 4, -6 + (seed % 7) - 3));
      if (face.applied) body.append(text(4, y0 + h - 5, 'c-mono c-tiny', 'FILED ' + face.applied));
      if (face.referral) body.append(star(w / 2 - 5, y0 + 3, 8));
      if (face.status === 'rejected') marks.append(...sketchCross(w / 2 - 4, h / 2 - 2, seed + 3));
      if (face.status === 'withdrawn') marks.append(...sketchSlash(w / 2 - 6, h / 2 - 2, seed + 3));
      if (face.status === 'offer') halo.append(g('loop-offer', ...sketchEllipse(w + 26, h + 26, seed + 12)));
      break;
    }
    case 'documents': {
      const f = 11;
      paper.append(el('path', { class: 'c-card', d: `M${x0},${y0}H${x0 + w - f}L${x0 + w},${y0 + f}V${y0 + h}H${x0}Z` }));
      body.append(el('path', { class: 'c-fold', d: `M${x0 + w - f},${y0}V${y0 + f}H${x0 + w}Z` }));
      body.append(text(x0 + 5, y0 + 11, 'c-mono c-tiny c-left', 'EXHIBIT ' + (10 + seed % 90)));
      body.append(text(x0 + 5, y0 + 20, 'c-mono c-tiny c-left c-red', (face.kind || 'Document').toUpperCase()));
      wrap(clean(face.name) || 'Untitled', 11, 2).forEach((ln, i) => body.append(text(x0 + 5, y0 + 30 + i * 9, 'c-type c-xs c-left', ln)));
      for (let i = 0; i < 4; i++) body.append(rect(x0 + 5, y0 + 44 + i * 6, (w - 10) * (i === 3 ? .55 : .9 - (seed >> i) % 3 * .1), 2, 'c-redact'));
      break;
    }
    case 'interviews': {
      paper.append(rect(x0, y0, w, h, 'c-sticky'));
      body.append(rect(x0, y0, w, 12, 'c-sticky-top'));
      wrap(face.round || 'Interview', 10, 2).forEach((ln, i) => body.append(text(0, y0 + 27 + i * 13, 'c-hand c-note', ln)));
      if (face.date) body.append(text(0, y0 + h - 17, 'c-hand c-note-sm', face.date));
      if (face.time) body.append(text(0, y0 + h - 5, 'c-hand c-note-sm', face.time));
      if (face.outcome === 'Passed') marks.append(g('ok', ...sketchCheck(9, seed + 4)));
      if (face.outcome === 'Did not pass') marks.append(...sketchCross(w / 2 - 8, h / 2 - 8, seed + 4));
      if (face.outcome === 'Cancelled') marks.append(...sketchSlash(w / 2 - 8, h / 2 - 8, seed + 4));
      for (const m of marks.children) if (face.outcome === 'Passed') m.setAttribute('transform', `translate(${w / 2 - 12},${-h / 2 + 16})`);
      break;
    }
    case 'events': {
      // A torn clipping: a jagged edge, seeded so it stays the same.
      let d = `M${x0},${y0}`, s = seed;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let x = x0; x <= x0 + w; x += 6) d += `L${x.toFixed(1)},${(y0 + rnd() * 3).toFixed(1)}`;
      for (let y = y0; y <= y0 + h; y += 6) d += `L${(x0 + w - rnd() * 3).toFixed(1)},${y.toFixed(1)}`;
      for (let x = x0 + w; x >= x0; x -= 6) d += `L${x.toFixed(1)},${(y0 + h - rnd() * 3).toFixed(1)}`;
      paper.append(el('path', { class: 'c-news', d: d + 'Z' }));
      wrap(face.title || 'Event', 15, 2).forEach((ln, i) => body.append(text(x0 + 5, y0 + 14 + i * 9, 'c-type c-xs c-left', ln)));
      if (face.date) body.append(text(x0 + 5, y0 + h - 5, 'c-mono c-tiny c-left', face.date));
      break;
    }
  }
  const sel = g('selring', ...sketchEllipse(w + (col === 'companies' ? 44 : 30), h + (col === 'companies' ? 38 : 28), seed + 21, { strokeWidth: 1.8, roughness: .8 }));
  parts.push(halo, sel, paper, body, marks);
  cardG.setAttribute('transform', `rotate(${rotationOf(col, seed).toFixed(2)})`);
  cardG.replaceChildren(...parts);
}

/** A thumbtack, drawn in the pin layer above the string. */
export function drawPin(pinG) {
  pinG.replaceChildren(
    el('ellipse', { cx: 2.6, cy: 3.4, rx: 5.2, ry: 3.6, class: 'pin-shadow' }),
    el('circle', { r: 5.4, class: 'pin-head' }),
    el('circle', { cx: -1.7, cy: -1.9, r: 1.8, class: 'pin-shine' }));
}

/** Tiny inline icons for chips, menus, lists and the panel. */
const ICONS = {
  companies: '<rect x="-6" y="-7.5" width="12" height="15" class="c-card"/><rect x="-4.8" y="-6.3" width="9.6" height="9" class="c-photo"/><circle cy="-3.4" r="1.9" class="c-sil"/><path d="M-3.6,2.7C-3.6,.2 -2,-1.2 0,-1.2C2,-1.2 3.6,.2 3.6,2.7Z" class="c-sil"/>',
  people: '<rect x="-5.5" y="-6.5" width="11" height="13" class="c-card"/><rect x="-4.4" y="-5.4" width="8.8" height="7.8" class="c-photo2"/><circle cy="-2.6" r="1.7" class="c-sil"/><path d="M-3.2,2.4C-3.2,.2 -1.8,-.8 0,-.8C1.8,-.8 3.2,.2 3.2,2.4Z" class="c-sil"/>',
  roles: '<rect x="-8" y="-5.5" width="16" height="11" class="c-card"/><line x1="-8" x2="8" y1="-2.5" y2="-2.5" class="c-rule-red"/><line x1="-8" x2="8" y1=".8" y2=".8" class="c-rule"/><line x1="-8" x2="8" y1="3.6" y2="3.6" class="c-rule"/>',
  applications: '<path d="M-5,-5H8V5H-5L-8,2V-2Z" class="c-manila"/><circle cx="-5.6" r="1" class="c-hole"/><rect x="-2.5" y="-2" width="9" height="4" rx=".6" class="stamp-box"/>',
  documents: '<path d="M-5.5,-7H2.5L5.5,-4V7H-5.5Z" class="c-card"/><path d="M2.5,-7V-4H5.5Z" class="c-fold"/><rect x="-3.8" y="-2" width="7.5" height="1.2" class="c-redact"/><rect x="-3.8" y="1" width="7.5" height="1.2" class="c-redact"/><rect x="-3.8" y="4" width="4.5" height="1.2" class="c-redact"/>',
  interviews: '<rect x="-6.5" y="-6.5" width="13" height="13" class="c-sticky"/><rect x="-6.5" y="-6.5" width="13" height="3" class="c-sticky-top"/>',
  events: '<path d="M-8,-4.5L-5,-5.2L-2,-4.4L1,-5.3L4,-4.6L8,-5V4.6L5,5.2L2,4.4L-1,5.3L-4,4.6L-8,5Z" class="c-news"/><rect x="-6" y="-2.4" width="11" height="1.1" class="c-redact"/><rect x="-6" y=".6" width="8" height="1.1" class="c-redact"/>',
};
export function iconMarkup(col, status) {
  let s = ICONS[col] || '';
  if (col === 'applications' && status) {
    s = `<g class="st-${status}">${s}</g>`;
    if (status === 'rejected') s += '<path d="M-5,-5L7,5M7,-5L-5,5" class="ico-x"/>';
    if (status === 'withdrawn') s += '<path d="M7,-5L-5,5" class="ico-x"/>';
  }
  return s;
}
