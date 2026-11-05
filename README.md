# Mesa · Circuit Lab

A browser circuit editor built with React, strict TypeScript, Vite, Redux Toolkit and Redux Persist. The central circuit stays visible while the right sidebar provides Components, per-board Code and virtual ESP8266 IoT tools. Electrical simulation and virtual HTTP run locally without a backend. Browser and screenshot acceptance remain pending; see [workspace implementation and validation](docs/WORKSPACE_AND_IOT.md).

## Start

Requires Node.js 22.12 or later. `.nvmrc` selects Node 22.

```bash
nvm use
npm ci
npm run dev
```

## Verify

```bash
npm run typecheck   # tsc --noEmit
npm test           # Vitest
npm run build      # production output in dist/
npm run verify     # all three checks
npm run test:browser # optional Playwright environment required
```

## Existing editor features

- Preserved Mesa appearance, Spanish/English interface, collapsible panels and saved language preference.
- Library containing Arduino UNO R3, NodeMCU ESP8266, BB830 breadboard, four LED colors, resistors, pushbuttons, potentiometers and a supply.
- Add components by clicking or dragging from the library; keyboard and mobile users can use the click action. Drag resistors, LEDs, pushbuttons or potentiometers onto BB830 to insert compatible leads into highlighted free holes.
- Single selection, Shift+click or the multiple-selection button; group dragging, 90° rotation, duplication and deletion.
- Original detailed SVGs, materials and silkscreen, with **one shared physical scale of 4 units/mm**.
- Wires reference component and terminal identifiers. Connection preview/cancellation, colors, orthogonal routes and editable waypoints.
- Wires stay attached when components move or rotate; nonexistent references are rejected during import and editing.
- Breadboard with 830 visible holes and 130 internal contact groups available to the electrical engine.
- Contextual inspector with configurable properties, GPIO information and an exact terminal picker for connections without tiny touch targets. Potentiometer knobs also respond directly to pointer/touch rotation, vertical center dragging and keyboard adjustment.
- History of 50 operations; a drag commits one operation when released. Previews and gestures are not persisted.
- Automatic saving, a Save button to flush pending writes, and JSON v1 import/export compatible with Phase 1.

## Use the editor

1. Add components from the library and move them in Select mode. Release a compatible passive part over green insertion highlights to store electrical lead-to-hole attachments. A red outline means the placement will be rejected; move away from the board to detach.
2. Enable Connect, then choose the origin and destination. Clicking the background adds a waypoint; Escape cancels.
3. For precise touch or keyboard connections, select a component and use **Choose exact terminal → Connect this terminal** in the inspector. Select another component while remaining in Connect mode to choose the destination.
4. Select a wire to change its color or add/remove waypoints. Drag its waypoints or edit their coordinates; double-clicking a wire adds another waypoint.
5. Save and reload. Selection and history start fresh; sidebar preferences are retained separately; the circuit document is recovered.

## Try electrical simulation

Use the file menu's Import action to load one of the portable example projects:

- [DC LED](examples/dc-led.json): a 5 V source, 330 Ω resistor and red LED with an explicit ground return. Press Start; expected LED current is `(5 − 2) / 330 = 9.09 mA`. Select the LED or resistor to inspect electrical values.
- [Pushbutton LED](examples/pushbutton-led.json): press Start, select the pushbutton and hold **Press button** with mouse, touch, Space or Enter. Releasing opens the contact and turns the LED off.
- [Manual GPIO LED](examples/gpio-led.json): press Start, select the ESP8266 board, choose D1/GPIO5 and set OUTPUT/HIGH. Expected LED current is `(3.3 − 2) / (330 + 50) = 3.421 mA`, including the illustrative 50 Ω GPIO drive resistance. LOW or high impedance turns it off.

Pause freezes results; Start resumes. Stop returns to editing and clears temporary controls/results. **Reset simulation** also clears temporary GPIO, button and wiper overrides without modifying the project. **Reset reference desk**, in the file menu, is a separate confirmed operation that replaces the project with the initial desk; export JSON first to retain a copy.

Stop simulation before structural edits, property changes, undo/redo or import. To test reverse polarity, stop, reconnect the LED terminals in the opposite direction and start again. To test an open circuit, stop, delete a wire and restart. Rotation alone changes geometry and does not swap anode/cathode terminal identities.

The example parser/electrical checks pass; these calculations and deterministic fixtures do not substitute for browser interaction or screenshot review.

## Code and virtual IoT

Select a board on the canvas to target it in Code and IoT. Non-board selection retains that target; a compact selector distinguishes multiple boards. In IoT, install the optional D1 LED routes explicitly, connect the virtual ESP8266, start simulation and send a configured request. HTTP changes GPIO through the electrical engine, so a successful request alone does not illuminate an invalid circuit. Network configuration and code save with the project; sessions and response histories reset on Stop/Reset or reload. See [the complete workspace/API contract, lifecycle and manual checklist](docs/WORKSPACE_AND_IOT.md).

## Keyboard and gestures

| Operation | Control |
| --- | --- |
| Select / pan / connect | V / H / C |
| Add/remove a selection | Shift+click; + button for touch |
| Select all components | Ctrl/Cmd+A outside text fields |
| Move selection | Arrow keys; Shift moves 10 units |
| Rotate / duplicate / delete | R / Ctrl/Cmd+D / Delete |
| Undo / redo | Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z |
| Cancel wire or drag | Escape |
| Zoom / fit workbench | Wheel, +/− / 0 with the workbench focused |
| Touch navigation | One finger pans the background or moves a component; two fingers pan and zoom |
| Keyboard pin selection | In Connect mode, Tab to a pin group, then use arrows and Enter |

A second pointer cancels a movement preview before starting a zoom gesture. Connections are committed by a click/tap, not by a panning gesture. Pan mode allows navigation over components.

## Scope and limitations

Phase 3 milestones A–F have passed their implementation gates: foundation, connectivity, DC solving, interactive models, UI integration and condition visuals. Automated checks and documentation are recorded separately from pending browser and visual acceptance. The initial audit is recorded in [the Phase 3 audit](docs/PHASE3_AUDIT.md). Implementation progress is not a claim that every acceptance criterion or browser check has passed.

**Firmware execution is unavailable.** The Code tool saves independent source text per board. Virtual WiFi/HTTP supports explicitly configured ESP8266 routes and GPIO actions inside the simulator; no real network requests or C++ execution occur. Manual GPIO remains a simulation testing interface. Supported electrical models and their assumptions are documented in [simulation scope](docs/simulation.md).

The represented breadboard has continuous, independent power rails. Successful drag insertion stores explicit lead-to-hole attachments; mere overlap in an imported or unmoved layout does not connect anything. Crossing wires do not form a node. Routes are simple orthogonal paths without automatic obstacle avoidance.

Component size is based on the physical body, not the viewBox margins. LEDs and resistors use shortened leads. Dimensions and transformations are documented in [physical scale](docs/physical-scale.md).

## Architecture

```text
src/
  app/                     Layout, styles, store, persistence and recovery tests
  model/                   Types, definitions/pins, physical scale, coordinates and pure operations
  sim/                     Framework-independent electrical domain
  features/components/     SVG artwork, library and inspectors
  features/workspace/      Navigation, interactions and temporary previews
  features/project/        Authoritative project slice, history and React adapters
  features/simulation/     Transient lifecycle, electrical inspector, GPIO and virtual HTTP integration
  features/tools/          Unified sidebar, shared board context, code and IoT tools
  locales/es/              Spanish
  locales/en/              English
  shared/                  Original icons and accessible dialog
  test/                    Current and Phase 1 fixtures
```

Redux holds the authoritative document. React holds selection, drags, filters and drafts. Redux Persist saves only `document`, including components, positions, orientation, properties, connections, routes and associated source code. Electrical evaluation and future engines remain independent of React and Redux; instantaneous simulation state is not persisted.

## Documentation

- [Engineering standards](AGENTS.md)
- [Engineering responsibilities](docs/AGENT_ROLES.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Architecture and persistence](docs/architecture.md)
- [Physical scale, dimensions and sources](docs/physical-scale.md)
- [Phases and acceptance criteria](docs/roadmap.md)
- [Simulation scope and firmware feasibility](docs/simulation.md)
- [Initial Phase 3 audit](docs/PHASE3_AUDIT.md)
- [Phase 3 validation record](docs/PHASE3_VALIDATION.md)
- [Phase 3 delivery report and file inventory](docs/PHASE3_REPORT.md)
- [Browser testing and visual-review procedure](docs/BROWSER_TESTING.md)
- [Breadboard and direct-knob interaction fixes](docs/INTERACTION_FIXES.md)

Storage quota and availability depend on the browser. Export JSON to keep a copy outside the browser. Clearing site data removes local projects.

## Environment validation

The Phase 3 baseline passed TypeScript checking, all 61 existing tests across 8 Vitest files, and the production build under Node 22.23.4. The 29 original Phase 1 tests are retained alongside editor, physical-scale and recovery tests. Milestone checks additionally cover the electrical engine, transient lifecycle, persistence exclusion, example projects and result-driven SVG rendering. The Phase 3 baseline delivery passed TypeScript, 123 tests in 16 files and the production build; see [the validation record](docs/PHASE3_VALIDATION.md). Previous attempts to serve Vite on `127.0.0.1:5173` failed with `listen EPERM`; interactive visual, touch and responsive validation must be recorded separately when execution is available. No unexecuted browser validation is reported as passed.

The focused interaction fix passes TypeScript, 149 tests in 20 files and the production build. Browser verification of actual drag/drop and knob gestures remains blocked; see [the focused report and local procedure](docs/INTERACTION_FIXES.md).

The unified-workspace and virtual ESP8266 update passes `npm run verify`: TypeScript, **265 tests in 36 files**, and production build. Browser execution remains blocked (0 passed checks); see [the current milestone/file inventory, limitations and local checklist](docs/WORKSPACE_AND_IOT.md).
