/**
 * Wires the toolbar DOM (tool buttons, play/pause, info, panel collapse) to
 * callbacks and reflects state back (active tool, playing, info open,
 * collapsed). Keeps all toolbar DOM concerns in one place.
 */
export class Toolbar {
  /**
   * @param {object} cb
   * @param {(tool:string)=>void} cb.onTool
   * @param {()=>void} cb.onPlayToggle
   * @param {()=>void} cb.onInfoToggle
   * @param {()=>void} cb.onPanelToggle
   */
  constructor(cb) {
    this.cb = cb;
    this.toolButtons = [...document.querySelectorAll('.tool-btn[data-tool]')];
    this.playBtn = document.getElementById('btn-play');
    this.playIco = document.getElementById('play-ico');
    this.playLbl = document.getElementById('play-lbl');
    this.infoBtn = document.getElementById('btn-info');
    this.snapBtn = document.getElementById('btn-snap');
    this.panelToggle = document.getElementById('panel-toggle');

    for (const b of this.toolButtons) {
      b.addEventListener('click', () => cb.onTool?.(b.dataset.tool));
    }
    this.playBtn.addEventListener('click', () => cb.onPlayToggle?.());
    this.infoBtn.addEventListener('click', () => cb.onInfoToggle?.());
    this.snapBtn.addEventListener('click', () => cb.onSnapToggle?.());
    this.panelToggle.addEventListener('click', () => cb.onPanelToggle?.());
  }

  setSnap(on) {
    this.snapBtn.classList.toggle('on', on);
  }

  setTool(tool) {
    for (const b of this.toolButtons) b.classList.toggle('active', b.dataset.tool === tool);
  }

  setPlaying(playing) {
    this.playBtn.classList.toggle('playing', playing);
    this.playIco.textContent = playing ? '❚❚' : '▶';
    this.playLbl.textContent = playing ? 'Pause' : 'Play';
  }

  setInfo(open) {
    this.infoBtn.classList.toggle('active', open);
  }

  setCollapsed(collapsed) {
    this.panelToggle.textContent = collapsed ? '⟨' : '⟩';
  }
}
