# MechSim — Implementation Plan

Status of the build against the requirements. Checked items are implemented.

- [x] 1. Project scaffold (Vite, `npm run dev`), dark UI shell _(R10)_
- [x] 2. Math + domain: `Vector2`, `Joint`, `Link`, `Mechanism` _(R1, R2)_
- [x] 3. Constraints + solver: `Constraint`, `DistanceConstraint`,
  `AxisConstraint`, `ConstraintSolver` _(R3, R10)_
- [x] 4. Simulation: `Simulator` loop + `AngleDriver` motor _(R3, R4)_
- [x] 5. Rendering: `Camera` (mm↔px), `CanvasRenderer` grid/axes _(R1, R9)_
- [x] 6. Interaction: drag/hover/zoom/pan _(R1)_
- [x] 7. Control panel: mm editing, add joint/link, presets, motor controls _(R1, R2)_
- [x] 8. Presets: four-bar, slider-crank, serial leg, parallel leg,
  offset-link leg _(R2, R3)_
- [x] 9. Rigid bodies: multi-select freeze, offset weld, shape-matching
  rigidity _(R2)_
- [x] 10. Cross-highlight (canvas ↔ panel) + rename joints/links/bodies _(R5)_
- [x] 11. Rename to **MechSim**; collapsible panel; toolbar
  (Select/Joint/Link/Play/Info) + tool modes _(R5, R9)_
- [x] 12. Selection model + renderer selection/hover/colors _(R5, R9)_
- [x] 13. Floating + docked inspectors; context menus _(R5, R6)_
- [x] 14. Motor params: invert, zero reference, limit; measured angle _(R4)_
- [x] 15. Info overlay (motor/link angles) + "Names on canvas" toggle _(R7)_
- [x] 16. Keyboard: Del, Ctrl+Z/Y; snapping toggle (G) + step _(R8, R9)_
- [x] 17. Serialization + history (undo/redo) + localStorage autosave/restore
  + `.mechsim` import/export _(R8)_
- [x] 18. Inspector placement toggle (Beside/Side), persisted _(R6)_
- [x] 19. `MotorLimitConstraint` — enforce travel limit while paused/dragging _(R4)_

## Backlog / future

- [ ] Marquee (box) multi-select in the Select tool
- [ ] Move all selected joints together when dragging one
- [ ] Linear/prismatic actuator driver (not just rotary)
- [ ] Trace/trajectory plotting of a chosen point
- [ ] Grashof / mobility (degrees-of-freedom) analysis readout
- [ ] Measurement tool (distance/angle between picks)
- [ ] Per-scene settings persisted in the `.mechsim` file (grid, snap)
