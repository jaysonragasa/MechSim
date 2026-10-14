import { el, button, input, row, select, swatchRow } from './dom.js';

/** Clock positions -> world angle (deg) of the servo's 0° reference. */
export const ZERO_OPTIONS = [
  { label: "3 o'clock (0°)", value: '0' },
  { label: "12 o'clock (90°)", value: '90' },
  { label: "9 o'clock (180°)", value: '180' },
  { label: "6 o'clock (270°)", value: '270' }
];

const LIMIT_OPTIONS = [
  { label: '360° (free)', value: '360' },
  { label: '270°', value: '270' },
  { label: '180°', value: '180' },
  { label: '90°', value: '90' }
];

const round = (n) => String(Math.round(n * 100) / 100);

/**
 * Builds the DOM contents for inspector popovers. Pure view construction: it
 * reads the target and mutates only through the injected `ctx` facade
 * (actions + a couple of lookups), so it stays decoupled from App internals.
 */
export const Inspector = {
  /**
   * @param {import('../domain/Joint.js').Joint} joint
   * @param {object} ctx { actions, getMotorFor(joint), getNeighbors(joint) }
   */
  joint(joint, ctx) {
    const { actions } = ctx;
    const wrap = el('div');

    const name = input('text', { value: joint.name });
    name.addEventListener('change', () => actions.renameJoint(joint, name.value.trim() || joint.name));
    wrap.appendChild(row('Name', name));

    const xy = el('div', 'row');
    const x = input('number', { step: 0.5, value: round(joint.position.x) });
    const y = input('number', { step: 0.5, value: round(joint.position.y) });
    const commit = () => actions.setJointPosition(joint, Number(x.value) || 0, Number(y.value) || 0);
    x.addEventListener('change', commit);
    y.addEventListener('change', commit);
    xy.append(el('label', null, 'X / Y'), x, y);
    wrap.appendChild(xy);
    ctx._xyInputs = { x, y }; // let App live-update while dragging

    const grounded = input('checkbox', { checked: joint.fixed });
    grounded.addEventListener('change', () => actions.setJointFixed(joint, grounded.checked));
    const gRow = el('label', 'row');
    gRow.style.cssText = 'display:flex;align-items:center;gap:8px';
    gRow.append(grounded, el('span', null, 'Grounded (anchored)'));
    wrap.appendChild(gRow);

    wrap.appendChild(el('div', 'hint', 'Color'));
    wrap.appendChild(swatchRow(joint.color, (hex) => actions.setJointColor(joint, hex)));

    // ---- Motor section --------------------------------------------------
    wrap.appendChild(el('div', 'menu-sep'));
    const motor = ctx.getMotorFor(joint);
    if (motor) {
      wrap.appendChild(this._motorControls(motor, actions));
    } else {
      const neighbors = ctx.getNeighbors(joint);
      if (neighbors.length) {
        wrap.appendChild(el('div', 'hint', 'This joint links to others — drive it as a motor:'));
        const crankSel = select(neighbors.map((n) => ({ label: n.name, value: n.id })), neighbors[0].id);
        wrap.appendChild(row('Crank', crankSel));
        wrap.appendChild(button('⟳ Make motor', () => {
          if (crankSel.value) actions.addMotor(joint.id, crankSel.value, 60);
        }, 'primary'));
      } else {
        wrap.appendChild(el('div', 'hint', 'Connect a link from this joint to make it a motor.'));
      }
    }

    return wrap;
  },

  _motorControls(motor, actions) {
    const box = el('div');
    box.appendChild(el('div', 'hint', 'Motor'));

    const speed = input('range', { min: -360, max: 360, step: 5, value: motor.speedDegPerSec });
    const speedVal = el('span', 'readout', `${motor.speedDegPerSec}°/s`);
    speed.addEventListener('input', () => {
      speedVal.textContent = `${Number(speed.value)}°/s`;
      actions.setMotorParams(motor, { speed: Number(speed.value) });
    });
    const sRow = row('Speed', speed);
    sRow.appendChild(speedVal);
    box.appendChild(sRow);

    const invert = input('checkbox', { checked: motor.inverted });
    invert.addEventListener('change', () => actions.setMotorParams(motor, { inverted: invert.checked }));
    const iRow = el('label', 'row');
    iRow.style.cssText = 'display:flex;align-items:center;gap:8px';
    iRow.append(invert, el('span', null, 'Invert direction'));
    box.appendChild(iRow);

    const zero = select(ZERO_OPTIONS, String(motor.zeroDegrees));
    zero.addEventListener('change', () => actions.setMotorParams(motor, { zeroDegrees: Number(zero.value) }));
    box.appendChild(row('Zero at', zero));

    const limit = select(LIMIT_OPTIONS, String(motor.limitDegrees));
    limit.addEventListener('change', () => actions.setMotorParams(motor, { limitDegrees: Number(limit.value) }));
    box.appendChild(row('Limit', limit));

    box.appendChild(button('Remove motor', () => actions.removeMotor(motor), 'danger'));
    return box;
  },

  /** @param {import('../domain/Link.js').Link} link */
  link(link, ctx) {
    const { actions } = ctx;
    const wrap = el('div');
    const name = input('text', { value: link.name });
    name.addEventListener('change', () => actions.renameLink(link, name.value.trim() || link.name));
    wrap.appendChild(row('Name', name));

    const len = input('number', { step: 0.5, value: round(link.length) });
    len.addEventListener('change', () => actions.setLinkLength(link, Number(len.value) || link.length));
    wrap.appendChild(row('Length', len));

    wrap.appendChild(el('div', 'hint', `${link.jointA.name} — ${link.jointB.name}`));
    wrap.appendChild(el('div', 'hint', 'Color'));
    wrap.appendChild(swatchRow(link.color, (hex) => actions.setLinkColor(link, hex)));
    wrap.appendChild(el('div', 'menu-sep'));
    wrap.appendChild(button('Delete link', () => actions.removeLink(link), 'danger'));
    return wrap;
  },

  /** @param {import('../domain/RigidBody.js').RigidBody} body */
  body(body, ctx) {
    const { actions } = ctx;
    const wrap = el('div');
    const name = input('text', { value: body.name });
    name.addEventListener('change', () => actions.renameBody(body, name.value.trim() || body.name));
    wrap.appendChild(row('Name', name));
    wrap.appendChild(el('div', 'hint', `${body.memberCount} pivots · ${body.joints.map((j) => j.name).join(', ')}`));
    wrap.appendChild(el('div', 'hint', 'Color'));
    wrap.appendChild(swatchRow(body.color, (hex) => actions.setBodyColor(body, hex)));
    wrap.appendChild(el('div', 'menu-sep'));
    wrap.appendChild(button('Convert to links', () => actions.bodyToLinks(body)));
    wrap.appendChild(button('Delete body', () => actions.removeRigidBody(body), 'danger'));
    return wrap;
  }
};
