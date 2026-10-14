/**
 * Iterative constraint solver (Gauss–Seidel / Position-Based Dynamics style).
 *
 * It repeatedly asks every constraint to `apply()` itself. Because each pass
 * only partially satisfies a network of coupled constraints, running several
 * iterations lets the whole linkage converge to a consistent pose. More
 * iterations = stiffer, more accurate linkages at the cost of CPU.
 *
 * Dependency Inversion: the solver depends only on the abstract Constraint
 * contract, never on concrete bar/slider types. Any object with `apply()`
 * participates automatically.
 */
export class ConstraintSolver {
  /** @param {number} [iterations] */
  constructor(iterations = 24) {
    this.iterations = iterations;
  }

  /**
   * Relax all constraints in the mechanism toward a consistent configuration.
   * @param {import('../domain/Mechanism.js').Mechanism} mechanism
   */
  solve(mechanism) {
    const constraints = mechanism.constraints;
    for (let i = 0; i < this.iterations; i++) {
      for (let c = 0; c < constraints.length; c++) {
        constraints[c].apply();
      }
    }
  }
}
