# MechSim — Design

## Overview

MechSim is a layered, SOLID-structured Vite app. A single composition root
(`App`) wires independent layers together and runs a `requestAnimationFrame`
loop. Each layer below `App` is unaware of the others and depends only on
abstractions (`Constraint`, `Driver`, `IRenderer`), so new joint types,
constraints, drivers, and tools slot in without touching the solver or domain.

## Module layers

```mermaid
graph TD
  main[main.js] --> App

  subgraph UI
    Toolbar
    ControlPanel
    FloatingPanel
    DockPanel
    ContextMenu
    Inspector
    InfoOverlay
  end

  subgraph Interaction
    IC[InteractionController]
  end

  subgraph Rendering
    Camera
    CanvasRenderer
  end

  subgraph Simulation
    Simulator
    AngleDriver
  end

  subgraph Solver
    ConstraintSolver
  end

  subgraph Domain
    Mechanism
    Joint
    Link
    RigidBody
    MechanismFactory
    Serializer[MechanismSerializer]
  end

  subgraph Constraints
    DistanceConstraint
    AxisConstraint
    RigidBodyConstraint
    MotorLimitConstraint
  end

  App --> UI
  App --> IC
  App --> CanvasRenderer --> Camera
  App --> Simulator --> ConstraintSolver --> Mechanism
  Simulator --> AngleDriver
  App --> Mechanism
  Mechanism --> Joint & Link & RigidBody
  Mechanism --> Constraints
  App --> Serializer
  App --> Selection & History
```

## Edit flow (pointer → scene → render)

```mermaid
flowchart TD
  P[Pointer / key event] --> IC[InteractionController]
  IC -->|getTool| T{Active tool}
  T -->|Select| S[select / drag joint]
  T -->|Joint| J[add joint / drag]
  T -->|Link| L[connect joints / multi-select links]
  S & J & L --> ACT[App actions facade]
  IC -->|right-click| CTX[Context menu]
  CTX --> ACT
  ACT --> MUT[Mutate Mechanism / Simulator]
  MUT --> SMC[Sync MotorLimitConstraints]
  SMC --> HIST[History.push snapshot]
  HIST --> SAVE[localStorage autosave]
  MUT --> DIRTY[mark dirty]
  DIRTY --> RAF[rAF loop]
```

## Simulation loop

```mermaid
flowchart LR
  RAF[rAF tick] --> NEED{running or dirty or dragging?}
  NEED -- no --> IDLE[skip]
  NEED -- yes --> CLR[clear driven flags]
  CLR --> RUN{running?}
  RUN -- yes --> DRV[drivers.update dt]
  RUN -- no --> SKIP[ ]
  DRV & SKIP --> SOLVE[ConstraintSolver.solve: N passes over all constraints]
  SOLVE --> REN[CanvasRenderer.render]
  REN --> INFO[InfoOverlay.update]
```

## Constraint model (Open/Closed seam)

Every rule implements `Constraint.apply()`; the solver relaxes them in Gauss–
Seidel fashion for N iterations and knows nothing about concrete types.

```mermaid
classDiagram
  class Constraint {
    <<abstract>>
    +apply()
    +involves(joint) bool
  }
  Constraint <|-- DistanceConstraint
  Constraint <|-- AxisConstraint
  Constraint <|-- RigidBodyConstraint
  Constraint <|-- MotorLimitConstraint
  DistanceConstraint : rigid bar (PBD, invMass-weighted)
  AxisConstraint : slider on a line
  RigidBodyConstraint : shape matching (solid part)
  MotorLimitConstraint : clamp crank angle to travel limit
```

- **invMass** abstraction: a joint is immovable (invMass 0) when `fixed`,
  `driven`, or `dragging`. The solver only sees invMass, not *why*.
- **Shape matching** (RigidBody): best-fit rigid transform of the frozen rest
  shape onto current pivots each pass, snapping free pivots back — stiff and
  stable, works for collinear parts.
- **Motor limit** is a constraint (not driver-only), so the travel range holds
  even while dragging with the sim paused.

## Motor (AngleDriver)

- Parameters: `speed` (deg/s), `inverted`, `zeroDegrees` (world-angle of 0°:
  3→0, 12→90, 9→180, 6→270), `limitDegrees` (<360 ping-pongs within the arc).
- `measuredAngleDegrees()` reports the angle from zero (honoring invert) from
  live positions, so Info is correct while paused.

## Persistence & history

- `MechanismSerializer` is the single source of truth for scene <-> plain
  object: it powers **undo/redo snapshots**, **localStorage autosave**, and
  **.mechsim import/export**. On load it assigns fresh ids and rewires by a
  local id map to avoid collisions. Derived constraints (rigid-body shape match,
  motor limits) are rebuilt from bodies/motors, not serialized.
- `History` stores whole-scene snapshots; `present` mirrors the live scene.

## Rendering & coordinates

- `Camera` converts world mm <-> screen px (Y-up world, Y-down screen) and owns
  pan/zoom. The rest of the app reasons purely in millimeters.
- `CanvasRenderer` draws grid, slider tracks, motor arcs, rigid bodies (filled
  hull / collinear capsule + struts), links (with length/name labels), joints
  (grounded square / free ring), selection (green), hover (orange), link-start
  ring, and optional subtle name labels.

## Interaction tools (Strategy via `getTool`)

| Tool   | Click empty | Click joint | Click link | Drag joint | Right-click |
|--------|-------------|-------------|------------|------------|-------------|
| Select | clear sel   | select+edit | select     | move       | context menu |
| Joint  | add joint   | select+move | —          | move       | context menu |
| Link   | clear start | chain links | toggle sel | —          | convert/color |

Shared: middle-drag pan, wheel zoom, hover highlight (cross-linked to panel).
