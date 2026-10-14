import { App } from './app/App.js';

/**
 * Entry point. Grabs the DOM handles and boots the composition root.
 * Everything else is wired inside App.
 */
// eslint-disable-next-line no-new
new App({
  appEl: document.getElementById('app'),
  canvas: document.getElementById('scene'),
  panelRoot: document.getElementById('control-panel'),
  statusCoords: document.getElementById('status-coords'),
  statusZoom: document.getElementById('status-zoom'),
  hintEl: document.getElementById('canvas-hint'),
  floatingLayer: document.getElementById('floating-layer'),
  dockInspector: document.getElementById('dock-inspector'),
  infoOverlay: document.getElementById('info-overlay'),
  inspectModeBtn: document.getElementById('btn-inspect-mode'),
  importBtn: document.getElementById('btn-import'),
  exportBtn: document.getElementById('btn-export'),
  fileInput: document.getElementById('file-input')
});
