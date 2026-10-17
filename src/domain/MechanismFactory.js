import { Mechanism } from './Mechanism.js';
import { Vector2 } from '../math/Vector2.js';
import { AxisConstraint } from '../constraints/AxisConstraint.js';
import { AngleDriver } from '../simulation/AngleDriver.js';

/**
 * Walking gait for the serial 2-DOF leg. Traces a "D-shape" foot path: the
 * foot drags flat along the ground during stance, then lifts in a smooth
 * half-ellipse during swing. Analytic 2-link IK maps the foot target to the
 * hip (crank J20) and knee (crank Feet) servos. +X is forward (the `x = -x`
 * line faces the leg toward +X on screen).
 */
const LEG_SERIAL_GAIT = `// Serial 2-DOF leg · walking gait (D-shape foot path)
// Base frame: Ground at (0,0). Femur = Tibia = 80mm. Foot home Y=-120.
// +X = forward (head), -X = back. +Y = up (robotics Z).

const L1 = 80, L2 = 80;      // femur, tibia (mm)
const Y0 = -120;             // ground line (foot home height)
const X_FWD = 20, X_BACK = -20;     // stride: 20mm fwd / 20mm back of base
const LIFT = 20;             // swing height (foot rises to Y=-100)
const PERIOD = 2.0;          // seconds per full stride
const STANCE = 0.5;          // fraction of cycle on the ground

const phase = (t % PERIOD) / PERIOD;      // 0..1
let x, y;
if (phase < STANCE) {
  // STANCE: flat ground drag (foot planted), forward -> back
  const u = phase / STANCE;
  x = X_FWD + (X_BACK - X_FWD) * u;
  y = Y0;
} else {
  // SWING: half-ellipse, back -> forward, lifting up and over
  const v = (phase - STANCE) / (1 - STANCE);
  x = X_BACK + (X_FWD - X_BACK) * v;
  y = Y0 + LIFT * Math.sin(Math.PI * v);
}

x = -x; // face forward toward +X on screen

// analytic 2-link inverse kinematics (elbow-down)
const D = (x*x + y*y - L1*L1 - L2*L2) / (2 * L1 * L2);
const Dc = Math.max(-1, Math.min(1, D));
const q2 = -Math.acos(Dc);
const q1 = Math.atan2(y, x) - Math.atan2(L2*Math.sin(q2), L1 + L2*Math.cos(q2));

const RAD = 180 / Math.PI;
const norm360 = a => ((a % 360) + 360) % 360;

const hipDeg  = norm360(-q1 * RAD);
const kneeDeg = norm360(q2 * RAD - 180);

// hip first — the knee's "Relative to: Ground" reference reads the updated femur
m.setMotor('J20',  hipDeg);
m.setMotor('Feet', kneeDeg);
`;

/**
 * Walking gait for the PARALLEL leg — physically driven by the two servos.
 * Each frame we solve the inverse kinematics for the desired foot target
 * (a clean chain of circle-circle intersections for this closed loop), then
 * command both motors to the resulting angles. The servos drive the linkage
 * and the foot follows, exactly as a real robot leg does.
 *
 * Branch choice is locked to the home configuration, and the stride is kept
 * within the leg's comfortable reach (±10mm) so the closed chain never flips
 * assembly modes. Base = foot home (15, -25) treated as local 0,0.
 */
const LEG_PARALLEL_GAIT = `// Parallel leg · walking gait — drives the TWO SERVOS (physical).
// Analytic IK finds the servo angles for each foot target, then commands the
// Femur Servo (crank 'Knees') and Tibia Servo (crank 'J7'); the servos drive
// the linkage and the foot follows — like a real robot.
// Base = foot home (15, -25) = local 0,0.  +X forward, +Y up.

// ---- fixed geometry (world mm) --------------------------------------------
const S_f = { x: 15, y: 10 };   // Femur Servo pivot
const S_t = { x: 0,  y: 0  };   // Tibia Servo pivot
// home positions of the moving joints (define the rigid-body shapes)
const KNEES0 = { x: 35,     y: -10 };
const FEET0  = { x: 15.001, y: -24.999 };
const J120   = { x: 40.001, y: -4.999 };
const J90    = { x: 19.984, y: 14.985 };
const J80    = { x: 9.984,  y: 14.962 };
const J70    = { x: -0.034, y: 10 };

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

// rigid lengths derived from the home shape (exact)
const R_FEMUR = len(sub(KNEES0, S_f));   // |Knees - FemurServo|
const D_KF    = len(sub(FEET0, KNEES0)); // |Feet  - Knees|
const L_TL2   = len(sub(J120, J90));     // |J12   - J9|
const R_J9    = len(sub(J90, S_f));      // |J9    - FemurServo|
const L_TL1   = len(sub(J80, J70));      // |J8    - J7|
const R_HORN  = len(sub(J70, S_t));      // |J7    - TibiaServo|

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

// ---- inverse kinematics -> servo angles -----------------------------------
// 1. Knees: 25mm from the foot target AND on the femur circle about Femur Servo
const knees = circleInt(target, D_KF, S_f, R_FEMUR, KNEES0);
if (knees) {
  // 2. Tibia Leg body orientation from Knees -> Feet, then place J12
  const bodyA = ang(sub(target, knees)) - ang(sub(FEET0, KNEES0));
  const j12 = add(knees, rot(sub(J120, KNEES0), bodyA));
  // 3. J9: on Tibia Link 2 from J12 AND on body B1's circle about Femur Servo
  const j9 = circleInt(j12, L_TL2, S_f, R_J9, J90);
  if (j9) {
    // 4. B1 rotation -> J8, then J7 on the tibia horn about Tibia Servo
    const phi = ang(sub(j9, S_f)) - ang(sub(J90, S_f));
    const j8 = add(S_f, rot(sub(J80, S_f), phi));
    const j7 = circleInt(j8, L_TL1, S_t, R_HORN, J70);
    if (j7) {
      // 5. servo commands (deg from each zero: femur zero = 180, tibia = 0).
      const RAD = 180 / Math.PI;
      // Pick the 360°-equivalent of the angle that best fits the servo's REAL
      // travel [0, limit] (read from the motor), instead of a hardcoded ±180.
      // The motor still clamps to [0, limit] as the final guard.
      const fit = (d, limit) => {
        let best = d, bestDist = Infinity;
        for (const c of [d - 360, d, d + 360]) {
          const cl = Math.max(0, Math.min(limit, c));
          const dist = Math.abs(c - cl);
          if (dist < bestDist) { bestDist = dist; best = c; }
        }
        return best;
      };
      const femurDeg = fit(ang(sub(knees, S_f)) * RAD - 180, m.motorLimit('Knees'));
      const tibiaDeg = fit(ang(sub(j7, S_t)) * RAD, m.motorLimit('J7'));
      m.setMotor('Knees', femurDeg);  // Femur Servo
      m.setMotor('J7', tibiaDeg);     // Tibia Servo
    }
  }
}
`;

/**
 * Walking gait for "Leg · parallel 2" (the horn-driven leg) — same physical
 * approach: solve the IK for the foot target, then command both actuators.
 * The Femur Actuator rotates J21 (the foot sits 80mm from J21 on the rigid
 * Tibia body); the Tibia Actuator turns a 25mm horn whose 99.787mm linkage
 * sets the body's orientation via J17. Base = foot home (-80, -80).
 */
const LEG_PARALLEL2_GAIT = `// Leg · parallel 2 · walking gait — drives the TWO ACTUATORS (physical).
// Analytic IK finds the actuator angles for each foot target, then commands
// the Femur Actuator (crank 'J21') and Tibia Actuator (crank 'J22'); the
// servos drive the linkage and the foot follows.
// Base = foot home (-9.657, -99.783) = local 0,0.  +X forward, +Y up.

// ---- fixed geometry (world mm) --------------------------------------------
const F = { x: 0,     y: 0  };     // Femur Actuator pivot
const T = { x: 19.75, y: 20 };     // Tibia Actuator pivot
// home positions of the moving joints
const J21_0  = { x: 57.233, y: -55.896 };
const J22_0  = { x: 28.333, y: 43.481 };
const J17_0  = { x: 94.731, y: -31.022 };
const FEET0  = { x: -9.657, y: -99.783 };

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

// rigid lengths derived from the home shape (exact)
const R_FEMUR  = len(sub(J21_0, F));     // |J21 - Femur Actuator|  = 80
const D_FT_J21 = len(sub(FEET0, J21_0)); // |Feet - J21| (body)     = 80
const L_LINK   = len(sub(J17_0, J22_0)); // |J17 - J22|             = 99.787
const R_HORN   = len(sub(J22_0, T));     // |J22 - Tibia Actuator|  = 25

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

// ---- inverse kinematics -> actuator angles --------------------------------
// 1. J21: 80mm from the foot target (rigid body) AND on the femur circle
const j21 = circleInt(target, D_FT_J21, F, R_FEMUR, J21_0);
if (j21) {
  // 2. Tibia body orientation from J21 -> Feet, then place J17
  const bodyA = ang(sub(target, j21)) - ang(sub(FEET0, J21_0));
  const j17 = add(j21, rot(sub(J17_0, J21_0), bodyA));
  // 3. J22: on the tibia linkage from J17 AND on the horn circle about Tibia Act
  const j22 = circleInt(j17, L_LINK, T, R_HORN, J22_0);
  if (j22) {
    // 4. actuator commands. Femur: inverted, zero 0 -> world = -deg.
    //    Tibia: zero 0 -> world = deg.
    const RAD = 180 / Math.PI;
    // Pick the 360°-equivalent of the angle that best fits the servo's REAL
    // travel [0, limit] (read from the motor), instead of a hardcoded ±180.
    // The motor still clamps to [0, limit] as the final guard.
    const fit = (d, limit) => {
      let best = d, bestDist = Infinity;
      for (const c of [d - 360, d, d + 360]) {
        const cl = Math.max(0, Math.min(limit, c));
        const dist = Math.abs(c - cl);
        if (dist < bestDist) { bestDist = dist; best = c; }
      }
      return best;
    };
    const femurDeg = fit(-ang(sub(j21, F)) * RAD, m.motorLimit('Femur Actuator'));
    const tibiaDeg = fit(ang(sub(j22, T)) * RAD, m.motorLimit('Tibia Actuator'));
    m.setMotor('Femur Actuator', femurDeg);  // crank J21
    m.setMotor('Tibia Actuator', tibiaDeg);  // crank J22
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
