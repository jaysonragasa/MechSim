import { Driver } from './Driver.js';
import { AngleDriver } from './AngleDriver.js';
import { Vector2 } from '../math/Vector2.js';

/**
 * Runs a user-authored function once per simulation frame to control the
 * mechanism — forward (set motor angles) or inverse (set an IK target for a
 * joint and let the solver resolve the chain). It is just another Driver, so
 * the Simulator and solver need no knowledge of scripting.
 *
 * The script is compiled with `new Function('t', 'm', source)` — a lightweight
 * sandbox: the body sees only the two parameters it's given (`t` = sim seconds,
 * `m` = the control API) plus the JS globals like `Math`. No DOM/window/network
 * handle is passed in. It runs as a per-frame body (no loops needed), is wrapped
 * in try/catch, and auto-disables on a runtime error so a bad script can't spam.
 *
 * Runs before motors (low `order`) so a `m.setMotor(...)` command suppresses
 * that motor's own spin for the frame.
 */
export class ScriptDriver extends Driver {
  /**
   * @param {object} opts
   * @param {string} opts.source
   * @param {import('../domain/Mechanism.js').Mechanism} opts.mechanism
   * @param {import('./Driver.js').Driver[]} opts.driversRef Live drivers array (to find motors).
   */
  constructor({ source = '', mechanism, driversRef }) {
    super();
    this.order = -100;
    this.source = source;
    this.mechanism = mechanism;
    this.driversRef = driversRef;
    this.error = null;
    this._fn = null;
    this._t = 0;
    this.compile();
  }

  compile() {
    this.error = null;
    if (!this.source || !this.source.trim()) { this._fn = null; return; }
    try {
      // eslint-disable-next-line no-new-func
      this._fn = new Function('t', 'm', `"use strict";\n${this.source}`);
    } catch (e) {
      this._fn = null;
      this.error = `Compile error: ${e.message}`;
    }
  }

  reset() { this._t = 0; }

  update(dt) {
    if (!this.enabled || !this._fn) return;
    this._t += dt;
    this._invoke();
  }

  /**
   * Evaluate the script once at the current time, regardless of enabled/running
   * state. Used to preview the result when Apply/Reset is clicked while paused.
   */
  runOnce() {
    if (!this._fn) return;
    this._invoke();
  }

  _invoke() {
    try {
      this._fn(this._t, this._api());
    } catch (e) {
      this.error = `Runtime error: ${e.message}`;
      this.enabled = false; // stop after an error until re-applied / re-enabled
    }
  }

  _findJoint(name) {
    for (const j of this.mechanism.joints.values()) {
      if (j.name === name || j.id === name) return j;
    }
    return null;
  }

  _findMotor(name) {
    for (const d of this.driversRef) {
      if (!(d instanceof AngleDriver)) continue;
      if (d.crank && (d.crank.name === name || d.crank.id === name)) return d;
      if (d.pivot && (d.pivot.name === name || d.pivot.id === name)) return d;
    }
    return null;
  }

  /** The control API handed to the script as `m`. */
  _api() {
    const self = this;
    return {
      t: this._t,

      /** Handle for a motor by crank (or pivot) name: `m.motor('Hip').angle = 30`. */
      motor(name) {
        const d = self._findMotor(name);
        return {
          get angle() { return d ? d.measuredAngleDegrees() : 0; },
          set angle(v) { if (d) d.commandServo(Number(v) || 0); }
        };
      },

      /** Command a motor's angle (degrees from its zero reference). */
      setMotor(name, deg) {
        const d = self._findMotor(name);
        if (d) d.commandServo(Number(deg) || 0);
      },

      /** Read a motor's current angle (degrees), honoring zero/invert. */
      angle(name) {
        const d = self._findMotor(name);
        return d ? d.measuredAngleDegrees() : 0;
      },

      /** A motor's travel limit in degrees (360 = free spin). Lets a script
       *  fit its commanded angle to the servo's real range. */
      motorLimit(name) {
        const d = self._findMotor(name);
        return d ? d.limitDegrees : 360;
      },

      /** Set an IK target (mm) for a joint; the solver pulls the chain to it. */
      target(name, x, y) {
        const j = self._findJoint(name);
        if (j && !j.fixed) {
          j.pulled = true;
          j.position = new Vector2(Number(x) || 0, Number(y) || 0);
        }
      },

      /** Read a joint position in mm: `const p = m.pos('Foot')`. */
      pos(name) {
        const j = self._findJoint(name);
        return j ? { x: j.position.x, y: j.position.y } : null;
      }
    };
  }
}
