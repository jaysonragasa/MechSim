import { Mechanism } from './Mechanism.js';
import { Vector2 } from '../math/Vector2.js';
import { AxisConstraint } from '../constraints/AxisConstraint.js';
import { AngleDriver } from '../simulation/AngleDriver.js';

/**
 * Walking gait for the serial 2-DOF leg. Traces a "D-shape" foot path: the
 * foot drags flat along the ground during stance, then lifts in a smooth
 * half-ellipse during swing. Analytic 2-link IK maps the foot target to the
 * hip (crank J20) and knee (crank Feet) servos. Link lengths and each servo's
 * zero/invert/limit are READ from the scene (m.getLink / m.getMotor), so only
 * the gait shape is authored.
 */
const LEG_SERIAL_GAIT = `// Serial 2-DOF leg · walking gait (D-shape foot path)
// Link lengths and servo zero/invert/limit are READ from the scene
// (m.getLink / m.getMotor) — only the gait shape below is authored.
// Base frame: the hip (Ground).  +X = forward, -X = back, +Y = up.

// fit an angle (deg) into a servo's real travel by picking the best 360°-wrap
const fit = (d, limit) => {
  let best = d, bestDist = Infinity;
  for (const c of [d - 360, d, d + 360]) {
    const cl = Math.max(0, Math.min(limit, c));
    const dist = Math.abs(c - cl);
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best;
};

// ---- read the live scene --------------------------------------------------
const femur = m.getLink('Femur');   // Ground -> J20
const tibia = m.getLink('Tibia');   // J20 -> Feet
const mh = m.getMotor('J20');       // hip  (crank J20)
const mk = m.getMotor('Feet');      // knee (crank Feet, measured vs the femur)
if (!(femur && tibia && mh && mk)) return; // scene not ready
const L1 = femur.length, L2 = tibia.length; // femur, tibia (mm)

// ---- foot path (D-shape), relative to the hip -----------------------------
const Y0 = -120;             // neutral foot depth below the hip (mm)
const X_FWD = 20, X_BACK = -20;     // stride: forward / back of base (mm)
const LIFT = 20;             // swing lift height (mm)
const PERIOD = 2.0;          // seconds per full stride
const STANCE = 0.5;          // fraction of cycle on the ground

const phase = (t % PERIOD) / PERIOD;
let x, y;
if (phase < STANCE) {        // STANCE: flat ground drag (foot planted), fwd -> back
  const u = phase / STANCE;
  x = X_FWD + (X_BACK - X_FWD) * u;
  y = Y0;
} else {                     // SWING: half-ellipse, back -> forward, lifting
  const v = (phase - STANCE) / (1 - STANCE);
  x = X_BACK + (X_FWD - X_BACK) * v;
  y = Y0 + LIFT * Math.sin(Math.PI * v);
}
x = -x; // face forward toward +X on screen

// ---- analytic 2-link inverse kinematics (elbow-down) ----------------------
const D = (x*x + y*y - L1*L1 - L2*L2) / (2 * L1 * L2);
const Dc = Math.max(-1, Math.min(1, D));
const q2 = -Math.acos(Dc);                               // knee (elbow) angle
const q1 = Math.atan2(y, x) - Math.atan2(L2*Math.sin(q2), L1 + L2*Math.cos(q2));

// ---- command each servo from its OWN zero/invert/limit --------------------
// hip world angle = q1; knee is measured vs the femur, so its deg maps q2.
const RAD = 180 / Math.PI;
const sh = mh.inverted ? -1 : 1;
const sk = mk.inverted ? -1 : 1;
const hipDeg  = fit(sh * (q1 * RAD - mh.zeroDegrees), mh.limitDegrees);
const kneeDeg = fit(sk * (q2 * RAD - mk.zeroDegrees), mk.limitDegrees);

// hip first — the knee's "Relative to" reference reads the updated femur
m.setMotor('J20',  hipDeg);
m.setMotor('Feet', kneeDeg);
`;

/**
 * Walking gait for the PARALLEL leg — physically driven by the two servos.
 * Reads the scene with m.getJoint / m.getMotor (no hardcoded coordinates):
 * pivots, link lengths, the rigid-body shapes, and each servo's zero/invert/
 * limit all come from the live mechanism, so the IK adapts if you move joints
 * or retune the motors. Only the gait shape is authored. The branch choice is
 * warm-started from the live pose so the closed chain never flips modes.
 */
const LEG_PARALLEL_GAIT = `// Parallel leg · walking gait — drives the TWO SERVOS (physical).
// Geometry is READ from the scene via m.getJoint / m.getMotor (no hardcoded
// coordinates); the IK adapts automatically if joints move or servos change.
// Only the gait shape below is authored.  +X forward, +Y up.

// ---- vector helpers -------------------------------------------------------
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const len = (a) => Math.hypot(a.x, a.y);
const ang = (a) => Math.atan2(a.y, a.x);
const rot = (v, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};
// circle-circle intersection; pick the solution nearest \`ref\` (locks branch)
function circleInt(c1, r1, c2, r2, ref) {
  const d = len(sub(c2, c1));
  if (d < 1e-9 || d > r1 + r2 || d < Math.abs(r1 - r2)) return null; // unreachable
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const ux = (c2.x - c1.x) / d, uy = (c2.y - c1.y) / d;
  const mx = c1.x + a * ux, my = c1.y + a * uy;
  const p1 = { x: mx - uy * h, y: my + ux * h };
  const p2 = { x: mx + uy * h, y: my - ux * h };
  return len(sub(p1, ref)) <= len(sub(p2, ref)) ? p1 : p2;
}

// fit an angle (deg) into a servo's real travel by picking the best 360°-wrap
const fit = (d, limit) => {
  let best = d, bestDist = Infinity;
  for (const c of [d - 360, d, d + 360]) {
    const cl = Math.max(0, Math.min(limit, c));
    const dist = Math.abs(c - cl);
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best;
};

// ---- capture the rest geometry ONCE (names come from the preset) ----------
// Reading the home pose a single time (not every frame) keeps the branch
// references and rigid lengths FIXED, so the solver's tiny per-frame motion
// can't feed back and rattle the foot. Motors stay live so you can retune them.
const S = m.state;
if (!S.ok) {
  const gj = (n) => { const j = m.getJoint(n); return j && { x: j.x, y: j.y }; };
  const SF = gj('Femur Servo'), ST = gj('Tibia Servo');
  const KN = gj('Knees'), FT = gj('Feet');
  const P12 = gj('J12'), P9 = gj('J9'), P8 = gj('J8'), P7 = gj('J7');
  if (SF && ST && KN && FT && P12 && P9 && P8 && P7) {
    S.SF = SF; S.ST = ST; S.KN = KN; S.FT = FT;
    S.P12 = P12; S.P9 = P9; S.P8 = P8; S.P7 = P7;
    S.R_FEMUR = len(sub(KN, SF));   // Knees <-> Femur Servo (femur leg)
    S.D_KF    = len(sub(FT, KN));   // Feet  <-> Knees (rigid body)
    S.L_TL2   = len(sub(P12, P9));  // J12   <-> J9 (tibia link 2)
    S.R_J9    = len(sub(P9, SF));   // J9    <-> Femur Servo (body B1)
    S.L_TL1   = len(sub(P8, P7));   // J8    <-> J7 (tibia link 1)
    S.R_HORN  = len(sub(P7, ST));   // J7    <-> Tibia Servo (horn)
    S.ok = true;
  }
}
const mf = m.getMotor('Knees');  // femur servo (read live)
const mt = m.getMotor('J7');     // tibia servo (read live)
if (!S.ok || !mf || !mt) return; // scene not ready

const SF = S.SF, ST = S.ST, KN = S.KN, FT = S.FT;
const P12 = S.P12, P9 = S.P9, P8 = S.P8, P7 = S.P7;
const R_FEMUR = S.R_FEMUR, D_KF = S.D_KF, L_TL2 = S.L_TL2;
const R_J9 = S.R_J9, L_TL1 = S.L_TL1, R_HORN = S.R_HORN;

// ---- foot path (D-shape, mirrored to walk forward) ------------------------
const BASE_X = 15, BASE_Y = -25;  // foot home = local 0,0
const FWD = 10, BACK = 10;        // reach forward / back from base (mm)
const LIFT = 10;                  // swing lift height (mm)
const PERIOD = 2.0;               // seconds per stride
const STANCE = 0.5;               // fraction of the cycle on the ground

const phase = (t % PERIOD) / PERIOD;
let lx, ly;
if (phase < STANCE) {              // STANCE: drag along ground, +FWD -> -BACK
  const u = phase / STANCE;
  lx = FWD - (FWD + BACK) * u;
  ly = 0;
} else {                           // SWING: lift & return, -BACK -> +FWD
  const v = (phase - STANCE) / (1 - STANCE);
  lx = -BACK + (FWD + BACK) * v;
  ly = LIFT * Math.sin(Math.PI * v);
}
lx = -lx; // face forward toward +X on screen
const target = { x: BASE_X + lx, y: BASE_Y + ly };

// ---- inverse kinematics (warm-started from the live pose) -----------------
// 1. Knees: D_KF from the foot target (rigid body) AND on the femur circle
const knees = circleInt(target, D_KF, SF, R_FEMUR, KN);
if (knees) {
  // 2. Tibia Leg body: rotate the live Knees->J12 offset by the change in the
  //    Knees->Feet direction
  const bodyA = ang(sub(target, knees)) - ang(sub(FT, KN));
  const j12 = add(knees, rot(sub(P12, KN), bodyA));
  // 3. J9: on Tibia Link 2 from J12 AND on body B1's circle about Femur Servo
  const j9 = circleInt(j12, L_TL2, SF, R_J9, P9);
  if (j9) {
    // 4. B1 rotation -> J8, then J7 on the tibia horn about Tibia Servo
    const phi = ang(sub(j9, SF)) - ang(sub(P9, SF));
    const j8 = add(SF, rot(sub(P8, SF), phi));
    const j7 = circleInt(j8, L_TL1, ST, R_HORN, P7);
    if (j7) {
      // 5. command each servo from its OWN zero/invert/limit (read, not hardcoded)
      const RAD = 180 / Math.PI;
      const servoDeg = (crank, pivot, mo) => {
        const world = ang(sub(crank, pivot)) * RAD;
        const s = mo.inverted ? -1 : 1;
        return fit(s * (world - mo.zeroDegrees), mo.limitDegrees);
      };
      m.setMotor('Knees', servoDeg(knees, SF, mf));  // Femur Servo
      m.setMotor('J7', servoDeg(j7, ST, mt));        // Tibia Servo
    }
  }
}
`;

/**
 * Walking gait for "Leg · parallel 2" (the horn-driven leg). Rather than
 * hardcoding coordinates, the script READS the scene with m.getJoint /
 * m.getMotor: the pivots, link lengths, rigid-body shape, and each servo's
 * zero/invert/limit all come from the live mechanism, so the IK adapts if you
 * move joints or retune the motors. Only the gait shape is authored.
 */
const LEG_PARALLEL2_GAIT = `// Leg · parallel 2 · walking gait — drives the TWO ACTUATORS (physical).
// Geometry is READ from the scene via m.getJoint / m.getMotor (no hardcoded
// coordinates); the IK adapts automatically if joints move or servos change.
// Only the gait shape below is authored.  +X forward, +Y up.

// ---- vector helpers -------------------------------------------------------
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const len = (a) => Math.hypot(a.x, a.y);
const ang = (a) => Math.atan2(a.y, a.x);
const rot = (v, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};
// circle-circle intersection; pick the solution nearest \`ref\` (locks branch)
function circleInt(c1, r1, c2, r2, ref) {
  const d = len(sub(c2, c1));
  if (d < 1e-9 || d > r1 + r2 || d < Math.abs(r1 - r2)) return null; // unreachable
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const ux = (c2.x - c1.x) / d, uy = (c2.y - c1.y) / d;
  const mx = c1.x + a * ux, my = c1.y + a * uy;
  const p1 = { x: mx - uy * h, y: my + ux * h };
  const p2 = { x: mx + uy * h, y: my - ux * h };
  return len(sub(p1, ref)) <= len(sub(p2, ref)) ? p1 : p2;
}

// fit an angle (deg) into a servo's real travel by picking the best 360°-wrap
const fit = (d, limit) => {
  let best = d, bestDist = Infinity;
  for (const c of [d - 360, d, d + 360]) {
    const cl = Math.max(0, Math.min(limit, c));
    const dist = Math.abs(c - cl);
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best;
};

// ---- capture the rest geometry ONCE (names come from the preset) ----------
// Reading the home pose a single time (not every frame) keeps the branch
// references and rigid lengths FIXED, so the solver's tiny per-frame motion
// can't feed back and rattle the foot. Motors stay live so you can retune them.
const S = m.state;
if (!S.ok) {
  const gj = (n) => { const j = m.getJoint(n); return j && { x: j.x, y: j.y }; };
  const F = gj('Femur Actuator'), T = gj('Tibia Actuator');
  const J21 = gj('J21'), J22 = gj('J22'), J17 = gj('J17'), FT = gj('Feet');
  if (F && T && J21 && J22 && J17 && FT) {
    S.F = F; S.T = T; S.J21 = J21; S.J22 = J22; S.J17 = J17; S.FT = FT;
    S.R_FEMUR  = len(sub(J21, F));   // femur length
    S.R_HORN   = len(sub(J22, T));   // horn length
    S.L_LINK   = len(sub(J17, J22)); // tibia linkage length
    S.D_FT_J21 = len(sub(FT, J21));  // Feet <-> J21 (rigid body)
    S.ok = true;
  }
}
const mf = m.getMotor('Femur Actuator'); // read live
const mt = m.getMotor('Tibia Actuator'); // read live
if (!S.ok || !mf || !mt) return; // scene not ready

const F = S.F, T = S.T, J21 = S.J21, J22 = S.J22, J17 = S.J17, FT = S.FT;
const R_FEMUR = S.R_FEMUR, R_HORN = S.R_HORN, L_LINK = S.L_LINK, D_FT_J21 = S.D_FT_J21;

// ---- foot path (D-shape, mirrored to walk forward) ------------------------
const BASE_X = -0.04, BASE_Y = -100.02;  // foot home = local 0,0
const FWD = 30, BACK = 40;         // reach forward / back from base (mm)
const LIFT = 40;                   // swing lift height (mm)
const PERIOD = 2.0;                // seconds per stride
const STANCE = 0.5;                // fraction of the cycle on the ground

const phase = (t % PERIOD) / PERIOD;
let lx, ly;
if (phase < STANCE) {              // STANCE: drag along ground, +FWD -> -BACK
  const u = phase / STANCE;
  lx = FWD - (FWD + BACK) * u;
  ly = 0;
} else {                           // SWING: lift & return, -BACK -> +FWD
  const v = (phase - STANCE) / (1 - STANCE);
  lx = -BACK + (FWD + BACK) * v;
  ly = LIFT * Math.sin(Math.PI * v);
}
lx = -lx; // face forward toward +X (delete this line if it walks backward)
const target = { x: BASE_X + lx, y: BASE_Y + ly };

// ---- inverse kinematics (warm-started from the live pose) -----------------
// 1. J21: D_FT_J21 from the foot target (rigid body) AND on the femur circle
const j21 = circleInt(target, D_FT_J21, F, R_FEMUR, J21);
if (j21) {
  // 2. Tibia body: rotate the live J21->J17 offset by the change in the
  //    J21->Feet direction (keeps the rigid body shape exactly)
  const bodyA = ang(sub(target, j21)) - ang(sub(FT, J21));
  const j17 = add(j21, rot(sub(J17, J21), bodyA));
  // 3. J22: on the tibia linkage from J17 AND on the horn circle about Tibia Act
  const j22 = circleInt(j17, L_LINK, T, R_HORN, J22);
  if (j22) {
    // 4. command each servo from its OWN zero/invert/limit (read, not hardcoded):
    //    world = ang(crank - pivot);  deg = (inverted ? -1 : 1) * (world - zero)
    const RAD = 180 / Math.PI;
    const servoDeg = (crank, pivot, mo) => {
      const world = ang(sub(crank, pivot)) * RAD;
      const s = mo.inverted ? -1 : 1;
      return fit(s * (world - mo.zeroDegrees), mo.limitDegrees);
    };
    m.setMotor('Femur Actuator', servoDeg(j21, F, mf));  // crank J21
    m.setMotor('Tibia Actuator', servoDeg(j22, T, mt));  // crank J22
  }
}
`;

/**
 * Builds ready-made example mechanisms. Each factory returns a fresh
 * Mechanism plus a `motors` array (0..n drivers) the app wires into the
 * simulator.
 *
 * Keeping construction here (not in the UI or App) means presets are reusable
 * and testable, and new presets are added in one place.
 */
export const MechanismFactory = {
  /** Empty workspace with a single grounded joint at the origin. */
  empty() {
    const m = new Mechanism();
    m.addJoint({ name: 'Ground', position: Vector2.ZERO, fixed: true });
    return { mechanism: m, motors: [] };
  },

  /**
   * Slider-crank: a rotating crank drives a block that slides along the X
   * axis. The slider is just a joint locked to a horizontal AxisConstraint.
   */
  sliderCrank() {
    const m = new Mechanism();
    const O = m.addJoint({ name: 'O (crank pivot)', position: Vector2.ZERO, fixed: true });
    const A = m.addJoint({ name: 'A (crank end)', position: new Vector2(0, 40) });
    const B = m.addJoint({ name: 'B (slider)', position: new Vector2(130, 0) });

    m.addLink(O, A, { name: 'Crank', length: 40 });
    m.addLink(A, B, { name: 'Connecting rod', length: 140 });

    // Lock the slider block to the horizontal axis through the origin.
    m.addConstraint(new AxisConstraint(B, Vector2.ZERO, new Vector2(1, 0)));

    const motor = new AngleDriver({ pivot: O, crank: A, speed: 120 });
    return { mechanism: m, motors: [motor] };
  },

  /**
   * Parallel multilinkage robot leg. Two grounded servo pivots (Femur Servo and
   * Tibia Servo) position the "Feet" end-effector together through a closed
   * chain. The upper assembly {Femur Servo, J8, J9} ("B1") and the lower
   * assembly {J12, Knees, Feet} ("Tibia Leg") are rigid bodies coupled by the
   * tibia links.
   *
   * Two grounded servos drive it: the Femur Servo rotates the Femur Leg
   * (crank = Knees), and the Tibia Servo turns the Tibia Horn (crank = J7),
   * which through the tibia links and body B1 orients the Tibia Leg. Both
   * motors are limited to a 180° servo range.
   *
   * (Imported from scene (10).mechsim.)
   */
  legMultilinkage() {
    const m = new Mechanism();

    const tibiaServo = m.addJoint({ name: 'Tibia Servo', position: Vector2.ZERO, fixed: true });
    const j7 = m.addJoint({ name: 'J7', position: new Vector2(-0.034, 10) });
    const j8 = m.addJoint({ name: 'J8', position: new Vector2(9.984, 14.962) });
    const j9 = m.addJoint({ name: 'J9', position: new Vector2(19.984, 14.985) });
    const femurServo = m.addJoint({ name: 'Femur Servo', position: new Vector2(15, 10), fixed: true });
    const knees = m.addJoint({ name: 'Knees', position: new Vector2(35, -10) });
    const j12 = m.addJoint({ name: 'J12', position: new Vector2(40.001, -4.999) });
    const feet = m.addJoint({ name: 'Feet', position: new Vector2(15.001, -24.999) });

    m.addLink(tibiaServo, j7, { name: 'Tibia Horn', length: 10, color: '#ff6b6b' });
    m.addLink(j7, j8, { name: 'Tibia Link 1', length: 11.18, color: '#ff6b6b' });
    m.addLink(j9, j12, { name: 'Tibia Link 2', length: 28.284, color: '#ff6b6b' });
    m.addLink(femurServo, knees, { name: 'Femur Leg', length: 28.284, color: '#4ec9a1' });

    m.addRigidBody([femurServo, j8, j9], { name: 'B1', color: '#ff6b6b' });
    m.addRigidBody([j12, knees, feet], { name: 'Tibia Leg', color: '#ffb454' });

    // The two servos ARE the actuators: the baked gait solves IK and commands
    // these motors, which drive the linkage so the foot follows (physical).
    const femur = new AngleDriver({ pivot: femurServo, crank: knees, speed: 60, inverted: false, zeroDegrees: 180, limitDegrees: 180 });
    const tibia = new AngleDriver({ pivot: tibiaServo, crank: j7, speed: 60, inverted: false, zeroDegrees: 0, limitDegrees: 180 });
    return { mechanism: m, motors: [femur, tibia], script: { source: LEG_PARALLEL_GAIT, enabled: true } };
  },

  /**
   * 2-DOF SERIAL leg: Ground --Femur--> J20 --Tibia--> Feet. The hip motor
   * swings the femur about the ground; the knee motor bends the tibia and is
   * measured RELATIVE TO the femur (reference = Ground), so it's a true serial
   * joint — the knee's zero rotates with the thigh.
   *
   * (Imported from leg-serial-2dof.mechsim.)
   */
  legSerial() {
    const m = new Mechanism();
    const ground = m.addJoint({ name: 'Ground', position: Vector2.ZERO, fixed: true });
    const j20 = m.addJoint({ name: 'J20', position: new Vector2(52.915, -60) });
    const feet = m.addJoint({ name: 'Feet', position: new Vector2(0, -120) });

    m.addLink(ground, j20, { name: 'Femur', length: 80 });
    m.addLink(j20, feet, { name: 'Tibia', length: 80 });

    const hip = new AngleDriver({ pivot: ground, crank: j20, speed: 60, inverted: true, zeroDegrees: 0, limitDegrees: 180 });
    const knee = new AngleDriver({ pivot: j20, crank: feet, speed: 60, zeroDegrees: 180, limitDegrees: 180, reference: ground });
    return { mechanism: m, motors: [hip, knee], script: { source: LEG_SERIAL_GAIT, enabled: true } };
  },

  /**
   * Parallel leg with a remotely-driven tibia: two grounded actuators (femur +
   * tibia) at the top. The tibia servo turns a short horn whose linkage pushes
   * the rigid Tibia body {J17, J21, Feet}, so the knee is actuated from the
   * base — a parallel layout.
   *
   * (Imported from the shared parallel-leg JSON.)
   */
  legParallelHorn() {
    const m = new Mechanism();
    const femurAct = m.addJoint({ name: 'Femur Actuator', position: Vector2.ZERO, fixed: true });
    const tibiaAct = m.addJoint({ name: 'Tibia Actuator', position: new Vector2(19.75, 20), fixed: true });
    const j17 = m.addJoint({ name: 'J17', position: new Vector2(94.731, -31.022) });
    const feet = m.addJoint({ name: 'Feet', position: new Vector2(-9.657, -99.783) });
    const j21 = m.addJoint({ name: 'J21', position: new Vector2(57.233, -55.896) });
    const j22 = m.addJoint({ name: 'J22', position: new Vector2(28.333, 43.481) });

    m.addLink(femurAct, j21, { name: 'Femur', length: 80 });
    m.addLink(tibiaAct, j22, { name: 'Tibia Servo Horn', length: 25 });
    m.addLink(j22, j17, { name: 'Tibia linkage', length: 99.787 });

    m.addRigidBody([j17, j21, feet], { name: 'Tibia' });

    const femurMotor = new AngleDriver({ pivot: femurAct, crank: j21, speed: 60, inverted: true, zeroDegrees: 0, limitDegrees: 180 });
    const tibiaMotor = new AngleDriver({ pivot: tibiaAct, crank: j22, speed: 60, inverted: false, zeroDegrees: 0, limitDegrees: 180 });
    return { mechanism: m, motors: [femurMotor, tibiaMotor], script: { source: LEG_PARALLEL2_GAIT, enabled: true } };
  }
};
