/**
 * Undo/redo via full-scene snapshots. Each snapshot is a serialized scene
 * object (small for these mechanisms), which keeps the implementation simple
 * and bullet-proof: restoring is just rebuilding from a snapshot.
 *
 * `present` always mirrors the live scene. `push` records a new present and
 * moves the old one onto the undo stack (clearing the redo stack). `undo`/
 * `redo` walk between stacks and return the snapshot to restore.
 */
export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.present = null;
  }

  /** Seed the baseline without creating an undo step. */
  init(snapshot) {
    this.present = snapshot;
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Record a new state as the current present (a new undoable step). */
  push(snapshot) {
    if (this.present !== null) {
      this.undoStack.push(this.present);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.present = snapshot;
    this.redoStack = [];
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  /** @returns {*|null} snapshot to restore, or null if nothing to undo. */
  undo() {
    if (!this.canUndo) return null;
    this.redoStack.push(this.present);
    this.present = this.undoStack.pop();
    return this.present;
  }

  /** @returns {*|null} snapshot to restore, or null if nothing to redo. */
  redo() {
    if (!this.canRedo) return null;
    this.undoStack.push(this.present);
    this.present = this.redoStack.pop();
    return this.present;
  }
}
