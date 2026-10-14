/**
 * Renderer interface. Decouples the application/loop from any specific drawing
 * backend (Dependency Inversion). Today there is a CanvasRenderer; a WebGL or
 * SVG renderer could be dropped in by implementing this same contract.
 */
export class IRenderer {
  /**
   * Draw one frame of the mechanism.
   * @param {import('../domain/Mechanism.js').Mechanism} _mechanism
   * @param {object} [_viewState] { highlight, selection, drivers, linkStart }
   * @abstract
   */
  render(_mechanism, _viewState) {
    throw new Error('IRenderer.render() must be implemented by a subclass');
  }

  /** Resize the drawing surface to the given CSS pixel size. */
  resize(_widthPx, _heightPx) {}
}
