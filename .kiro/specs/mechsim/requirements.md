# MechSim — Requirements

## Introduction

MechSim is a browser-based 2D parametric kinematics simulator for designing,
synthesizing, and simulating planar mechanical linkages (four-bar linkages,
slider-cranks, robotic legs/joints). It runs on Node.js tooling (Vite) and is
launched with `npm run dev`. All distances are in **millimeters**. The code
follows SOLID principles so new joint types, constraints, drivers, and tools
can be added without rewiring existing modules.

## Glossary

- **Joint** — a point in 2D space (mm). May be *grounded* (anchored), free, or
  *driven* (positioned by a motor this frame).
- **Link** — a rigid bar enforcing a fixed distance between two joints.
- **Rigid body** — a solid part carrying 3+ joints at fixed offsets (ternary
  link), kept rigid by shape matching.
- **Motor (AngleDriver)** — spins a crank joint around a pivot, with speed,
  invert, zero reference, and travel limit.
- **Constraint** — a rule the solver relaxes each pass (distance, slider axis,
  rigid body, motor limit).

## Requirements

### R1 — Joints in millimeters
**User story:** As a designer, I want to place and position joints by exact mm
coordinates or by dragging, so I can lay out a mechanism precisely.
- WHEN the user selects the Joint tool and clicks empty canvas, THE SYSTEM SHALL
  create a joint at that world position (snapped to the grid if snapping is on).
- WHEN the user edits a joint's X or Y field, THE SYSTEM SHALL move the joint to
  the typed millimeter coordinate.
- WHEN the user drags a joint, THE SYSTEM SHALL move it and re-solve so
  connected links follow.

### R2 — Links and rigid bodies
- WHEN two joints are connected, THE SYSTEM SHALL create a Link enforcing their
  current distance.
- WHEN 2+ joints are frozen into a rigid body, THE SYSTEM SHALL keep their
  relative positions fixed (including collinear layouts) via shape matching.
- THE SYSTEM SHALL allow welding an offset pivot onto a rigid body so the pivot
  sweeps an arc rigidly with the body.

### R3 — Simulation
- THE SYSTEM SHALL resolve all constraints each frame using an iterative
  position-based solver, with a configurable iteration count.
- WHEN a motor is present and Play is active, THE SYSTEM SHALL rotate its crank
  around its pivot and drag the rest of the linkage to follow.

### R4 — Motors
- THE SYSTEM SHALL let a joint with a connected link become a rotary motor.
- THE SYSTEM SHALL support motor **speed**, **invert direction**, **zero-degree
  reference** (3/12/9/6 o'clock), and **travel limit** (90/180/270/360).
- THE SYSTEM SHALL enforce the travel limit at all times, including while
  dragging with the simulation paused.

### R5 — Tools & editing UX
- THE SYSTEM SHALL provide Select, Joint, and Link tools, plus Play/Pause and
  Info, selectable from a toolbar (and keyboard: V/J/L/Space/G).
- Select SHALL pick joints/links/bodies (Shift adds), highlight them, and show
  an inspector; right-click SHALL show a context menu of relevant actions.
- Link SHALL connect joints into chains and multi-select connected links;
  right-click SHALL offer converting a connected selection to a rigid body.

### R6 — Inspector placement
- THE SYSTEM SHALL offer an inspector placement toggle (Beside the object vs
  Side/docked) and SHALL remember the choice across sessions.

### R7 — Info & labels
- THE SYSTEM SHALL show a floating Info window with live motor angles (respecting
  zero/invert/limit) and link angles/lengths.
- THE SYSTEM SHALL offer a non-destructive "Names on canvas" toggle and SHALL
  remember it across sessions.

### R8 — History & persistence
- THE SYSTEM SHALL support Undo (Ctrl+Z) and Redo (Ctrl+Y / Ctrl+Shift+Z) and
  Delete (Del/Backspace) of the selection.
- THE SYSTEM SHALL autosave the scene to local storage and restore it on launch.
- THE SYSTEM SHALL import and export the scene as a `.mechsim` JSON file
  including joints, links, rigid bodies, sliders, colors, and motor settings.

### R9 — Snapping, colors, view
- THE SYSTEM SHALL offer grid snapping (toggle + configurable step in mm) applied
  when adding and dragging joints, remembered across sessions.
- THE SYSTEM SHALL allow per-item colors for joints, links, and bodies.
- THE SYSTEM SHALL support pan (middle-drag), zoom (wheel), reset view, and a
  collapsible control panel.

### R10 — Architecture
- THE SYSTEM SHALL keep domain, constraints, solver, simulation, rendering,
  interaction, and UI in separate layers depending only on abstractions, so new
  constraint/driver/tool types are added without modifying the solver or
  mechanism (Open/Closed, Dependency Inversion).
