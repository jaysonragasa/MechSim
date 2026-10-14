/**
 * Tracks what the user has selected: any mix of joints, links and rigid
 * bodies. Items are referenced as {type:'joint'|'link'|'body', ref}. Kept
 * separate from hover-highlight so selection persists across pointer moves.
 */
export class Selection {
  constructor() {
    this.joints = new Set();
    this.links = new Set();
    this.bodies = new Set();
  }

  _bucket(type) {
    return type === 'joint' ? this.joints : type === 'link' ? this.links : this.bodies;
  }

  clear() {
    this.joints.clear();
    this.links.clear();
    this.bodies.clear();
  }

  has(item) {
    return !!item && this._bucket(item.type).has(item.ref);
  }

  add(item) {
    if (item) this._bucket(item.type).add(item.ref);
  }

  remove(item) {
    if (item) this._bucket(item.type).delete(item.ref);
  }

  toggle(item) {
    if (!item) return;
    if (this.has(item)) this.remove(item);
    else this.add(item);
  }

  /** Replace the whole selection with a single item (or clear if null). */
  set(item) {
    this.clear();
    this.add(item);
  }

  get isEmpty() {
    return this.joints.size + this.links.size + this.bodies.size === 0;
  }

  get count() {
    return this.joints.size + this.links.size + this.bodies.size;
  }

  /** @returns {{type: string, ref: object}[]} */
  all() {
    return [
      ...[...this.joints].map((ref) => ({ type: 'joint', ref })),
      ...[...this.links].map((ref) => ({ type: 'link', ref })),
      ...[...this.bodies].map((ref) => ({ type: 'body', ref }))
    ];
  }

  /** The single selected item if exactly one is selected, else null. */
  single() {
    return this.count === 1 ? this.all()[0] : null;
  }
}
