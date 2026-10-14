/**
 * Immutable 2D vector. All operations return a new Vector2 so that domain
 * objects can share references safely without aliasing bugs.
 *
 * Coordinates are expressed in world units (millimeters) throughout the app.
 */
export class Vector2 {
  /**
   * @param {number} x
   * @param {number} y
   */
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    Object.freeze(this);
  }

  /** @param {Vector2} v */
  add(v) { return new Vector2(this.x + v.x, this.y + v.y); }

  /** @param {Vector2} v */
  sub(v) { return new Vector2(this.x - v.x, this.y - v.y); }

  /** @param {number} s */
  scale(s) { return new Vector2(this.x * s, this.y * s); }

  /** @param {Vector2} v */
  dot(v) { return this.x * v.x + this.y * v.y; }

  /** 2D cross product magnitude (z component). @param {Vector2} v */
  cross(v) { return this.x * v.y - this.y * v.x; }

  get length() { return Math.hypot(this.x, this.y); }

  get lengthSq() { return this.x * this.x + this.y * this.y; }

  /** Unit vector; returns zero vector if length is 0. */
  normalized() {
    const l = this.length;
    return l === 0 ? Vector2.ZERO : new Vector2(this.x / l, this.y / l);
  }

  /** @param {Vector2} v */
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y); }

  /** Angle of this vector in radians, measured CCW from +X. */
  get angle() { return Math.atan2(this.y, this.x); }

  /**
   * Rotate around an origin by `radians` (CCW).
   * @param {number} radians
   * @param {Vector2} [origin]
   */
  rotate(radians, origin = Vector2.ZERO) {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    const dx = this.x - origin.x;
    const dy = this.y - origin.y;
    return new Vector2(
      origin.x + dx * c - dy * s,
      origin.y + dx * s + dy * c
    );
  }

  /** @param {Vector2} v @param {number} t */
  lerp(v, t) {
    return new Vector2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t);
  }

  withX(x) { return new Vector2(x, this.y); }
  withY(y) { return new Vector2(this.x, y); }

  clone() { return new Vector2(this.x, this.y); }

  toString() { return `(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`; }

  /**
   * Build a vector from a polar angle and radius.
   * @param {number} radians
   * @param {number} [radius]
   */
  static fromAngle(radians, radius = 1) {
    return new Vector2(Math.cos(radians) * radius, Math.sin(radians) * radius);
  }
}

Vector2.ZERO = new Vector2(0, 0);
