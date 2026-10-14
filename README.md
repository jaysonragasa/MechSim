# MechSim

A browser-based **2D parametric kinematics simulator** for designing,
synthesizing, and simulating planar mechanical linkages — four-bar linkages,
slider-cranks, and robotic legs/joints. Units are in **millimeters**.

![status](https://img.shields.io/badge/stack-Vite%20%2B%20Vanilla%20JS-blue)

## Features

- **Design in mm** — place joints by clicking, dragging, or typing exact X/Y.
- **Links & rigid bodies** — simple bars, or solid multi-pivot parts (ternary
  links) kept rigid by shape matching, including offset pivots.
- **Motors** — rotary drivers with speed, invert, zero-degree reference, and a
  travel limit that is enforced even while dragging (paused).
- **Tools** — Select, Joint, Link, Play/Pause, Info, plus grid snapping.
- **Inspectors** — floating (beside the object) or docked (side), remembered.
- **Info overlay** — live motor and link angles; optional on-canvas name labels.
- **Editing** — selection, context menus, colors, undo/redo, delete.
- **Persistence** — autosaves to local storage; import/export `.mechsim` files.
- **Presets** — four-bar, slider-crank, serial leg, parallel (five-bar) leg,
  and an offset-link remote-actuated knee.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in dist/
```

## Keyboard

| Key | Action |
|-----|--------|
| `V` / `J` / `L` | Select / Joint / Link tool |
| `Space` | Play / Pause |
| `G` | Toggle grid snapping |
| `Del` / `Backspace` | Delete selection |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Esc` | Clear selection / close popups |

Middle-drag to pan, scroll to zoom.

## Architecture

Layered and SOLID: domain, constraints, solver, simulation, rendering,
interaction, and UI are separate and depend only on abstractions, so new
constraint/driver/tool types slot in without touching the solver or mechanism.
See [`.kiro/specs/mechsim`](.kiro/specs/mechsim) for the requirements, design
(with flow diagrams), and task breakdown.

```
src/
  math/         Vector2, geometry2d
  domain/       Joint, Link, RigidBody, Mechanism, MechanismFactory, MechanismSerializer
  constraints/  Constraint, Distance, Axis, RigidBody (shape match), MotorLimit
  solver/       ConstraintSolver (position-based)
  simulation/   Driver, AngleDriver, Simulator
  rendering/    Camera, IRenderer, CanvasRenderer
  interaction/  InteractionController (tool dispatch)
  ui/           Toolbar, ControlPanel, Inspector, FloatingPanel, DockPanel, ContextMenu, InfoOverlay
  app/          App (composition root), Selection, History
```

## License

MIT
