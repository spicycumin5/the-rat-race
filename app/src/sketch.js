// Hand-drawn rendering for the map, built on rough.js.
// Shapes are generated once per node (seeded, so they never "wiggle" between renders)
// and emitted as plain <path> elements whose colors come from CSS classes:
//   .ink   = outline strokes   .hatch = hachure fill strokes   .solid = solid fills
// so the light and dark themes both work through tokens.
import rough from 'roughjs';

const gen = rough.generator();
const NS = 'http://www.w3.org/2000/svg';

export function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 2147483646 + 1;
}

function toEls(drawable) {
  return gen.toPaths(drawable).map(p => {
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', p.d);
    if (p.fill === 'F') el.setAttribute('class', 'solid');
    else {
      el.setAttribute('class', p.stroke === 'F' ? 'hatch' : 'ink');
      el.setAttribute('stroke-width', p.strokeWidth);
    }
    return el;
  });
}
const base = seed => ({ seed, stroke: 'S', strokeWidth: 1.5, roughness: 1.15, bowing: 1.3, hachureGap: 3.4, fillWeight: .9, hachureAngle: -41 + (seed % 24) });

const FILL = { companies: 'hachure', applications: 'hachure', people: 'zigzag', interviews: 'cross-hatch', events: 'solid' };

/** The node's body. `d` is the plain outline path for non-round shapes. */
export function sketchShape(col, r, d, seed, status) {
  const o = base(seed);
  if (FILL[col]) { o.fill = 'F'; o.fillStyle = FILL[col]; }
  if (col === 'companies') { o.strokeWidth = 1.9; o.hachureGap = 3; }
  if (col === 'events') o.roughness = .5;
  if (col === 'applications') {
    if (['rejected', 'withdrawn', 'ghosted'].includes(status)) delete o.fill;
    if (status === 'ghosted') o.strokeLineDash = [3, 3.5];
    if (status === 'offer') { o.fillStyle = 'solid'; }
  }
  const round = col === 'applications' || col === 'events';
  return toEls(round ? gen.circle(0, 0, r * 2, o) : gen.path(d, o));
}
export function sketchCircle(r, seed, extra = {}) {
  return toEls(gen.circle(0, 0, r * 2, { ...base(seed), strokeWidth: 1.3, roughness: 1.4, bowing: 2.2, ...extra }));
}
export function sketchCross(a, seed) {
  return [...toEls(gen.line(-a, -a, a, a, { ...base(seed), strokeWidth: 2, roughness: 1.4 })),
    ...toEls(gen.line(a, -a, -a, a, { ...base(seed + 1), strokeWidth: 2, roughness: 1.4 }))];
}
export function sketchSlash(a, seed) { return toEls(gen.line(a, -a, -a, a, { ...base(seed), strokeWidth: 2, roughness: 1.4 })); }
export function sketchStar(cx, cy, R, seed) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * .45 : R; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
  return toEls(gen.polygon(pts, { ...base(seed), fill: 'F', fillStyle: 'solid', strokeWidth: 1, roughness: .7 }));
}
/** Small icon markup (for chips, lists, the legend). Cached because chips re-render often. */
const iconCache = new Map();
export function sketchIconMarkup(key, build) {
  if (!iconCache.has(key)) iconCache.set(key, build().map(el => el.outerHTML).join(''));
  return iconCache.get(key);
}
