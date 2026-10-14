/**
 * Small 2D geometry helpers shared by the renderer (drawing rigid-body hulls)
 * and the interaction layer (hit-testing links and bodies under the pointer).
 * Operate on any {x, y} points — Vector2 works directly.
 */

/** Shortest distance from point p to segment a–b. */
export function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Convex hull (Andrew's monotone chain). Returns ordered hull points. */
export function convexHull(points) {
  if (points.length < 3) return [...points];
  const pts = [...points].sort((p, q) => (p.x - q.x) || (p.y - q.y));
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Absolute shoelace area of a polygon. */
export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = (yi > p.y) !== (yj > p.y) &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** The two points farthest apart in a small set. */
export function farthestPair(pts) {
  let best = [pts[0], pts[0]];
  let bestD = -1;
  for (let i = 0; i < pts.length; i++) {
    for (let k = i + 1; k < pts.length; k++) {
      const d = Math.hypot(pts[i].x - pts[k].x, pts[i].y - pts[k].y);
      if (d > bestD) { bestD = d; best = [pts[i], pts[k]]; }
    }
  }
  return best;
}
