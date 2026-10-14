import { Vector2 } from '../math/Vector2.js';

/**
 * Maps between world space (millimeters, Y-up, origin at the mechanism's
 * (0,0)) and screen space (CSS pixels, Y-down, origin at top-left of canvas).
 *
 * Keeping every pixel/mm conversion in one place means the rest of the app
 * reasons purely in millimeters (Single Responsibility + a clean seam between
 * physical units and the display).
 */
export class Camera {
  /**
   * @param {object} [opts]
   * @param {number} [opts.pxPerMm] Zoom: screen pixels per millimeter.
   * @param {Vector2} [opts.originPx] Screen pixel that represents world (0,0).
   */
  constructor({ pxPerMm = 3, originPx = new Vector2(400, 400) } = {}) {
    this.pxPerMm = pxPerMm;
    this.originPx = originPx;
  }

  /** @param {Vector2} worldMm @returns {Vector2} screen pixels */
  worldToScreen(worldMm) {
    return new Vector2(
      this.originPx.x + worldMm.x * this.pxPerMm,
      this.originPx.y - worldMm.y * this.pxPerMm // flip Y: world up -> screen up
    );
  }

  /** @param {Vector2} screenPx @returns {Vector2} world millimeters */
  screenToWorld(screenPx) {
    return new Vector2(
      (screenPx.x - this.originPx.x) / this.pxPerMm,
      (this.originPx.y - screenPx.y) / this.pxPerMm
    );
  }

  /** Convert a length in mm to a length in pixels. */
  mmToPx(mm) { return mm * this.pxPerMm; }

  /** Convert a length in pixels to a length in mm. */
  pxToMm(px) { return px / this.pxPerMm; }

  /**
   * Zoom toward a fixed screen point (keeps the world point under the cursor
   * stationary while scaling).
   * @param {number} factor Multiplier (>1 zoom in, <1 zoom out).
   * @param {Vector2} anchorPx Screen point to zoom around.
   */
  zoomAt(factor, anchorPx) {
    const worldBefore = this.screenToWorld(anchorPx);
    this.pxPerMm = Math.min(60, Math.max(0.2, this.pxPerMm * factor));
    const worldAfter = this.screenToWorld(anchorPx);
    // Shift origin so the anchored world point maps back to the same pixel.
    const driftPx = worldAfter.sub(worldBefore).scale(this.pxPerMm);
    this.originPx = new Vector2(
      this.originPx.x + driftPx.x,
      this.originPx.y - driftPx.y
    );
  }

  /** Pan by a screen-space delta in pixels. @param {Vector2} deltaPx */
  panBy(deltaPx) {
    this.originPx = this.originPx.add(deltaPx);
  }
}
