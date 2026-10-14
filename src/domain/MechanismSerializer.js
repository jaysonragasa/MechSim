import { Mechanism } from './Mechanism.js';
import { Vector2 } from '../math/Vector2.js';
import { AxisConstraint } from '../constraints/AxisConstraint.js';
import { AngleDriver } from '../simulation/AngleDriver.js';

const FORMAT = 'mechsim';
const VERSION = 1;

/**
 * Converts a scene (mechanism + motor drivers) to/from a plain, JSON-safe
 * object. This single source of truth powers three features at once:
 * undo/redo snapshots, localStorage autosave, and file import/export.
 *
 * On load it assigns fresh runtime objects and wires references by a local
 * id map, so stored ids never collide with the live id counters.
 */
export const MechanismSerializer = {
  /**
   * @param {Mechanism} mechanism
   * @param {import('../simulation/Driver.js').Driver[]} drivers
   * @returns {object}
   */
  toObject(mechanism, drivers = []) {
    const joints = mechanism.jointList.map((j) => ({
      id: j.id,
      name: j.name,
      x: round(j.position.x),
      y: round(j.position.y),
      fixed: j.fixed,
      color: j.color
    }));

    const links = mechanism.links.map((l) => ({
      id: l.id,
      name: l.name,
      a: l.jointA.id,
      b: l.jointB.id,
      length: round(l.length),
      color: l.color
    }));

    const bodies = mechanism.rigidBodies.map((b) => ({
      id: b.id,
      name: b.name,
      color: b.color,
      joints: b.joints.map((j) => j.id)
    }));

    const sliders = mechanism.constraints
      .filter((c) => c instanceof AxisConstraint)
      .map((c) => ({
        joint: c.joint.id,
        px: round(c.point.x),
        py: round(c.point.y),
        dx: round(c.direction.x),
        dy: round(c.direction.y)
      }));

    const motors = drivers
      .filter((d) => d instanceof AngleDriver)
      .map((d) => ({
        type: 'angle',
        pivot: d.pivot.id,
        crank: d.crank.id,
        speed: d.speedDegPerSec,
        inverted: d.inverted,
        zeroDegrees: d.zeroDegrees,
        limitDegrees: d.limitDegrees
      }));

    return { format: FORMAT, version: VERSION, joints, links, bodies, sliders, motors };
  },

  toJSON(mechanism, drivers) {
    return JSON.stringify(this.toObject(mechanism, drivers), null, 2);
  },

  /**
   * @param {object} data
   * @returns {{mechanism: Mechanism, drivers: AngleDriver[]}}
   */
  fromObject(data) {
    const mechanism = new Mechanism();
    const byId = new Map(); // stored id -> live Joint

    for (const j of data.joints ?? []) {
      const joint = mechanism.addJoint({
        name: j.name,
        position: new Vector2(j.x, j.y),
        fixed: !!j.fixed,
        color: j.color ?? null
      });
      byId.set(j.id, joint);
    }

    for (const l of data.links ?? []) {
      const a = byId.get(l.a);
      const b = byId.get(l.b);
      if (a && b) mechanism.addLink(a, b, { name: l.name, length: l.length, color: l.color ?? null });
    }

    for (const b of data.bodies ?? []) {
      const joints = (b.joints ?? []).map((id) => byId.get(id)).filter(Boolean);
      if (joints.length >= 2) {
        const body = mechanism.addRigidBody(joints, { name: b.name });
        body.color = b.color ?? null;
      }
    }

    for (const s of data.sliders ?? []) {
      const joint = byId.get(s.joint);
      if (joint) {
        mechanism.addConstraint(
          new AxisConstraint(joint, new Vector2(s.px, s.py), new Vector2(s.dx, s.dy))
        );
      }
    }

    const drivers = [];
    for (const m of data.motors ?? []) {
      const pivot = byId.get(m.pivot);
      const crank = byId.get(m.crank);
      if (pivot && crank) {
        drivers.push(new AngleDriver({
          pivot,
          crank,
          speed: m.speed ?? 60,
          inverted: !!m.inverted,
          zeroDegrees: m.zeroDegrees ?? 0,
          limitDegrees: m.limitDegrees ?? 360
        }));
      }
    }

    return { mechanism, drivers };
  },

  fromJSON(json) {
    const data = JSON.parse(json);
    if (data.format !== FORMAT) throw new Error('Not a MechSim file');
    return this.fromObject(data);
  }
};

function round(n) {
  return Math.round(n * 1000) / 1000;
}
