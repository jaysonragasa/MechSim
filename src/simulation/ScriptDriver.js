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
    this._state = {}; // persistent per-run scratch exposed to scripts as `m.state`
    this.compile();
  }

  compile() {
    this.error = null;
    this._state = {}; // recompiling (Apply / new script) starts with fresh state
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

  _findLink(name) {
    for (const l of this.mechanism.links) {
      if (l.name === name || l.id === name) return l;
    }
    return null;
  }

  /** The control API handed to the script as `m`. */
  _api() {
    const self = this;
    return {
      t: this._t,

      /** Persistent per-run scratch object: survives across frames so a script
       *  can capture geometry once (e.g. `if (!m.state.ok) { ... }`). Cleared
       *  when the script is re-applied. */
      state: this._state,

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
      },

      /**
       * Full joint properties (by name or id), including live x/y:
       * `{ id, name, x, y, fixed, color }`. Returns null if not found.
       */
      getJoint(name) {
        const j = self._findJoint(name);
        if (!j) return null;
        return {
          id: j.id,
          name: j.name,
          x: j.position.x,
          y: j.position.y,
          fixed: j.fixed,
          color: j.color ?? null
        };
      },

      /**
       * Full motor properties (addressed by crank or pivot, name or id),
       * including the live measured `angle` in degrees. pivot/crank/reference
       * are given as both ids and names so you don't have to map them.
       * Returns null if no motor matches.
       */
      getMotor(name) {
        const d = self._findMotor(name);
        if (!d) return null;
        return {
          type: 'angle',
          pivot: d.pivot ? d.pivot.id : null,
          crank: d.crank ? d.crank.id : null,
          reference: d.reference ? d.reference.id : null,
          pivotName: d.pivot ? d.pivot.name : null,
          crankName: d.crank ? d.crank.name : null,
          referenceName: d.reference ? d.reference.name : null,
          speed: d.speedDegPerSec,
          inverted: d.inverted,
          zeroDegrees: d.zeroDegrees,
          limitDegrees: d.limitDegrees,
          angle: d.measuredAngleDegrees()
        };
      },

      /**
       * Full link properties (by name or id): endpoint ids `a`/`b`, design
       * `length`, live `currentLength`, and the live endpoint coordinates
       * `ax,ay` (joint A) and `bx,by` (joint B). Returns null if not found.
       */
      getLink(name) {
        const l = self._findLink(name);
        if (!l) return null;
        return {
          id: l.id,
          name: l.name,
          a: l.jointA.id,
          b: l.jointB.id,
          aName: l.jointA.name,
          bName: l.jointB.name,
          length: l.length,
          currentLength: l.currentLength,
          color: l.color ?? null,
          ax: l.jointA.position.x,
          ay: l.jointA.position.y,
          bx: l.jointB.position.x,
          by: l.jointB.position.y
        };
      }
    };
  }
}
