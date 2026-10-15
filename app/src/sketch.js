// Marker scribbles for the case board, built on rough.js: circles around a lead,
// an X through a dead end. Shapes are seeded so they never "wiggle" between renders,
// and emitted as plain <path> elements colored by CSS (.ink = marker strokes).
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
    el.setAttribute('class', 'ink');
    el.setAttribute('stroke-width', p.strokeWidth);
    return el;
  });
}
// Kept steady (low roughness, one pass) so it reads as a real marker, not a cartoon.
const marker = seed => ({ seed, stroke: 'S', strokeWidth: 2, roughness: .55, bowing: .9, disableMultiStroke: true });

/** A loose marker loop around a w×h box. */
export function sketchEllipse(w, h, seed, extra = {}) {
  return toEls(gen.ellipse(0, 0, w, h, { ...marker(seed), ...extra }));
}
export function sketchCross(a, b, seed) {
  return [...toEls(gen.line(-a, -b, a, b, { ...marker(seed), strokeWidth: 2.6 })),
    ...toEls(gen.line(a, -b, -a, b, { ...marker(seed + 1), strokeWidth: 2.6 }))];
}
export function sketchSlash(a, b, seed) { return toEls(gen.line(a, -b, -a, b, { ...marker(seed), strokeWidth: 2.6 })); }
export function sketchCheck(s, seed) {
  return toEls(gen.linearPath([[-s, 0], [-s * .3, s * .7], [s, -s * .8]], { ...marker(seed), strokeWidth: 2.6 }));
}
