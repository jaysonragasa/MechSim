import { Mechanism } from './Mechanism.js';
import { Vector2 } from '../math/Vector2.js';
import { AxisConstraint } from '../constraints/AxisConstraint.js';
import { AngleDriver } from '../simulation/AngleDriver.js';

/**
 * Builds ready-made example mechanisms. Each factory returns a fresh
 * Mechanism plus a `motors` array (0..n drivers) the app wires into the
 * simulator. Returning an array keeps multi-actuator mechanisms (like the
 * 2-DOF legs) first-class without special-casing the single-motor presets.
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
   * Classic crank-rocker four-bar linkage. Lengths satisfy Grashof's law so
   * the crank (A–B) can fully rotate:  s + l <= p + q  (40 + 150 <= 140 + 80).
   */
  fourBar() {
    const m = new Mechanism();
    const A = m.addJoint({ name: 'A (crank pivot)', position: new Vector2(-70, 0), fixed: true });
    const D = m.addJoint({ name: 'D (rocker pivot)', position: new Vector2(70, 0), fixed: true });
    const B = m.addJoint({ name: 'B (crank)', position: new Vector2(-70, 40) });
    const C = m.addJoint({ name: 'C (coupler)', position: new Vector2(70, 80) });

    m.addLink(A, B, { name: 'Crank', length: 40 });
    m.addLink(B, C, { name: 'Coupler', length: 150 });
    m.addLink(C, D, { name: 'Rocker', length: 80 });

    const motor = new AngleDriver({ pivot: A, crank: B, speed: 90 });
    return { mechanism: m, motors: [motor] };
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
   * 2-DOF SERIAL robot leg (open kinematic chain).
   *
   *   Hip (ground) --thigh--> Knee --shank--> Foot
   *
   * Two independent rotary actuators placed in series: the hip motor swings
   * the thigh about the grounded hip, and the knee motor swings the shank
   * about the (moving) knee. Because the knee pivot is itself carried by the
   * hip joint, the hip driver is listed first so the knee driver reads the
   * updated knee position each frame. The foot's reachable region is an
   * annulus — the hallmark of a serial chain.
   */
  legSerial() {
    const m = new Mechanism();
    const hip = m.addJoint({ name: 'Hip (ground)', position: Vector2.ZERO, fixed: true });
    // Thigh angled down-left, shank angled down-right -> foot near centerline.
    const knee = m.addJoint({ name: 'Knee', position: new Vector2(-30.8, -84.6) });
    const foot = m.addJoint({ name: 'Foot', position: new Vector2(0, -169.2) });

    m.addLink(hip, knee, { name: 'Thigh', length: 90 });
    m.addLink(knee, foot, { name: 'Shank', length: 90 });

    // Order matters: hip actuator updates the knee before the knee actuator
    // uses it to place the foot (serial dependency).
    const hipMotor = new AngleDriver({ pivot: hip, crank: knee, speed: 50 });
    const kneeMotor = new AngleDriver({ pivot: knee, crank: foot, speed: -75 });
    return { mechanism: m, motors: [hipMotor, kneeMotor] };
  },

  /**
   * 2-DOF PARALLEL robot leg (five-bar closed chain) — the layout used in many
   * quadrupeds (e.g. MIT Cheetah-style legs).
   *
   *        P1   P2        <- two grounded hip pivots (both actuated)
   *        |     |
   *        A     B        <- upper links (driven)
   *         \   /
   *          \ /
   *           F           <- foot, where the two lower links meet
   *
   * Both actuators are mounted on the fixed base and independently rotate the
   * two upper links; the foot position is the intersection of the two lower
   * links (solved as two distance constraints). Mobility = 3(5-1) - 2*5 = 2.
   * Keeping both motors on the ground is exactly what makes it "parallel":
   * low moving mass, but a reachable region bounded by the links' geometry.
   */
  legParallel() {
    const m = new Mechanism();
    const p1 = m.addJoint({ name: 'P1 (hip L, ground)', position: new Vector2(-30, 0), fixed: true });
    const p2 = m.addJoint({ name: 'P2 (hip R, ground)', position: new Vector2(30, 0), fixed: true });

    // Upper links splay outward/down; lower links meet at the foot on the
    // centerline (circle-circle intersection of the two 110 mm lower links).
    const a = m.addJoint({ name: 'A (upper L)', position: new Vector2(-65, -60.6) });
    const b = m.addJoint({ name: 'B (upper R)', position: new Vector2(65, -60.6) });
    const foot = m.addJoint({ name: 'Foot', position: new Vector2(0, -149.3) });

    m.addLink(p1, a, { name: 'Upper L', length: 70 });
    m.addLink(p2, b, { name: 'Upper R', length: 70 });
    m.addLink(a, foot, { name: 'Lower L', length: 110 });
    m.addLink(b, foot, { name: 'Lower R', length: 110 });

    // Opposite equal speeds keep the symmetric geometry, pumping the foot
    // along the centerline (extend/retract) when running.
    const motorL = new AngleDriver({ pivot: p1, crank: a, speed: 30 });
    const motorR = new AngleDriver({ pivot: p2, crank: b, speed: -30 });
    return { mechanism: m, motors: [motorL, motorR] };
  },

  /**
   * Remotely-actuated knee with an OFFSET link — the layout from the user's
   * diagram (femur + tibia + servo horn + link). Demonstrates a rigid body
   * (the tibia) carrying a pivot offset from the knee.
   *
   *   H  = hip / femur servo axis (ground)
   *   S  = tibia servo axis (ground), offset from the hip
   *   K  = knee: femur pins to the tibia here
   *   P  = link-attach pivot on the tibia, OFFSET 55 mm from the knee
   *   E  = servo-horn tip
   *   Ft = foot (tibia tip)
   *
   * The tibia {Ft, K, P} is one rigid body. The horn (crank) drives the link
   * (coupler), the link pushes the offset pivot P, and because P is offset
   * from the knee the tibia rotates about K — a four-bar S-E-P-K that flexes
   * the knee. The femur motor holds/sweeps the whole leg about the hip.
   */
  legOffset() {
    const m = new Mechanism();
    const H = m.addJoint({ name: 'H (hip, ground)', position: new Vector2(0, 140), fixed: true });
    const S = m.addJoint({ name: 'S (tibia servo, ground)', position: new Vector2(25, 150), fixed: true });

    const K = m.addJoint({ name: 'K (knee)', position: new Vector2(0, 0) });
    const P = m.addJoint({ name: 'P (link attach, offset)', position: new Vector2(55, 0) });
    const Ft = m.addJoint({ name: 'Foot', position: new Vector2(-80, 0) });
    const E = m.addJoint({ name: 'E (horn tip)', position: new Vector2(55, 150) });

    // Femur: simple bar from hip to knee.
    m.addLink(H, K, { name: 'Femur', length: 140 });
    // Servo horn (short crank) and the coupler link down to the offset pivot.
    m.addLink(S, E, { name: 'Tibia servo horn', length: 30 });
    m.addLink(E, P, { name: 'Link', length: 150 });

    // The tibia is ONE rigid body carrying knee, offset link-attach, and foot.
    m.addRigidBody([Ft, K, P], { name: 'Tibia' });

    // Femur motor holds the leg (speed 0 by default; raise it to sweep the
    // hip). Tibia-servo motor spins the horn to flex the knee via the link.
    const femurMotor = new AngleDriver({ pivot: H, crank: K, speed: 0 });
    const tibiaMotor = new AngleDriver({ pivot: S, crank: E, speed: 40 });
    return { mechanism: m, motors: [femurMotor, tibiaMotor] };
  }
};
