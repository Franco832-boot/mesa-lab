# Breadboard insertion and direct potentiometer interaction fixes

## Root causes

**Breadboard insertion was missing.** The pointer pipeline converted stage client coordinates through pan/zoom and updated component positions, but never tested holes, normalized the footprint, recorded inserted leads or provided a placement transaction. The electrical engine understood wires and breadboard contact groups only. Several passive lead endpoints were also slightly off the 2.54 mm insertion grid, so a rigid exact fit would fail even after adding a nearest-hole helper.

**The potentiometer had a drawing, not a direct control.** Its indicator rendered the saved/transient ratio, but there was no knob hit target, pointer capture, screen-to-local conversion or keyboard handler. Pointer presses reached the ordinary component-drag/canvas pipeline. Only the inspector could change the ratio.

## Breadboard change

The actual Select-mode drag path now runs:

1. Stage pointer capture and client → stage → world conversion preserve the initial grip offset.
2. `planComponentMove` / `planInsertion` test every lead against real registry hole centers, including both component and breadboard rotations.
3. Valid free holes are highlighted; the component preview translates exactly onto those centers. Occupied or nonmatching footprints show rejection feedback.
4. Pointer release issues one `place` editor command, which commits position and all lead attachments atomically. Invalid release keeps the original document/history.
5. The parser validates the entire inserted footprint, references, alignment and hole occupancy. The electrical topology unions each inserted lead with its explicit hole reference.

Native library drag/drop uses the same placement planner, preview and validation through `add` with `snap: true`. Body geometry/scale are preserved. Resistor, LED, pushbutton and potentiometer insertion endpoints now use the modeled breadboard-compatible pitch; artwork lead paths consume those same endpoints. Boards render behind inserted parts.

Attachments are optional component data:

```ts
attachments: [
  { pinId: '1', breadboardId: 'bb', holeId: 'a8' },
  { pinId: '2', breadboardId: 'bb', holeId: 'a12' },
]
```

The additive v1 extension migrates a missing list as unmounted, without rewriting old documents. It survives JSON import/export and Redux Persist. Undo/redo includes it in existing component snapshots. Independent component movement reassigns contacts or detaches in free space; board movement/rotation carries mounted parts. Board deletion detaches remaining parts. Standalone copies detach; copied assemblies remap the board reference. Moving an assembly preserves its original parent even over an overlapping board, avoiding silent electrical reconnection. Existing manually drawn wires retain their endpoint identities.

## Potentiometer change

A local SVG slider overlays the existing knob and captures its own pointer. Its inverse screen CTM includes component rotation, canvas zoom and pan. Off-center grips use relative angular motion with seam handling; center grips support vertical dragging without an undefined-angle dead spot. The visible indicator remains limited to −135° through +135° (270° travel). It shows 0–100%, supports mouse/touch pointer events, and exposes slider semantics.

Arrows adjust 1%, Shift+arrows 10%, and Home/End set 0%/100%. Escape, pointer cancellation and lost capture discard an unfinished preview. Knob events stop before parent dragging or wiring; native wheel propagation is blocked before the canvas listener. Canvas navigation is suspended while a component control owns a gesture. Pan and Connect modes disable the knob hit target and retain their own behavior. Component shortcuts ignore the focused control.

In editing mode, previews update drawing and inspector immediately; release commits one property/history operation. During a running simulation, changes use the existing transient wiper override and immediately reevaluate the electrical engine. They do not overwrite the saved ratio. Pause disables manipulation; Stop/Reset return to the saved ratio.

One shared domain function provides both track segments: `R1 = total × ratio`, `R3 = total × (1 − ratio)`. The solver and inspector use it. Total resistance remains unchanged. The 5 V / 10 kΩ unloaded-divider tests verify wiper voltages 5, 3.75, 2.5, 1.25 and 0 V at 0%, 25%, 50%, 75% and 100%, respectively.

## Executed validation

- `npm run typecheck`: passed using Node 22.23.4.
- `npm test`: **149 passed in 20 files**, preserving the original 123 tests.
- `npm run build`: passed (94 modules).
- `npm run verify`: passed all three checks.
- New/updated browser-file Node syntax checks: passed.
- `npm run test:browser`: attempted; both test workers fail before usable browser setup, zero browser checks passed.
- Direct `node tests/browser/interactions.test.mjs`: all seven cases fail in the shared setup before any interaction; zero browser checks passed.
- Independent Vite retry: `listen EPERM` on `127.0.0.1:5173`.
- Independent cached Playwright + installed Chrome retry: browser exits during startup after crashpad reports a forbidden socket operation.

The 26 new Vitest tests cover insertion preview/commit equivalence, actual lead attachments, current through breadboard contacts without resistor wires, free-hole rejection, component/board rotations and movement, overlapping boards, duplicate/delete, undo/redo, JSON/migration/Redux Persist recovery, knob mechanics/rendering, constant track resistance and runtime electrical response. Server-rendered markup and pure/state tests do **not** establish real browser pointer-capture or visual behavior.

Seven authored Playwright flows cover actual component and library drag/drop, hole highlights, electrical attachments, rejection, save/reload, assembly movement, rotated/zoomed/panned insertion, direct knob rotation and center dragging, keyboard controls, unchanged body/canvas, immediate inspector/voltage response, and native Chromium touch events. These flows remain **unverified**, not passed. No screenshot baseline was approved.

## Local browser procedure

On a host that permits local servers and Chromium, with Node 22.12+:

```bash
npm ci
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node --test --test-concurrency=1 tests/browser/interactions.test.mjs
```

The harness starts Vite on `127.0.0.1:4173`. Alternatively run an existing server and set `MESA_BASE_URL`. The optional browser tooling does not change the tracked dependency contract. Run `npm run test:browser` for all browser regressions.

Manual acceptance procedure:

1. Add a breadboard and resistor in Select mode. Drag the resistor body onto five-hole strips; release when both endpoints have green highlights. Confirm exact centers, inspect/save the two attachments, and undo/redo.
2. Connect source positive to `e8` and negative to `e12`; insert resistor leads in `a8` and `a12`. Start simulation; a 5 V / 330 Ω circuit must read about 15.15 mA. Moving off the board must remove inserted contacts; occupied or 45° misaligned insertion must be rejected.
3. Stop and move/rotate the board. Mounted parts must follow without changing hole IDs. Repeat insertion after changing zoom/pan and with a 90° component/board orientation.
4. Add a potentiometer. Drag directly around its knob, or grip the center and drag vertically. Confirm 0–100%, visible rotation, immediate inspector position/segment values, unchanged total resistance and one undo step per completed mouse gesture. Test arrows, Home/End and cancellation.
5. Wire pot terminal 1 to source positive and terminal 3 to negative; choose `wiper` in the inspector and start. For 5 V, knob 0/50/100% must produce 5/2.5/0 V. Saved ratio must survive reload; runtime overrides must not.
6. Repeat knob manipulation after zoom/pan and on touch. The body/canvas must stay still while the knob owns the pointer. In Pan mode, dragging over the knob must pan without changing it.

## Files changed

Created:

- `src/model/breadboard.ts`, `src/model/breadboard.test.ts`.
- `src/model/potentiometer.ts`, `src/model/potentiometer.test.ts`.
- `src/features/components/PotentiometerControl.tsx`, `src/features/components/PotentiometerControl.test.ts`.
- `src/app/interactionRecovery.test.ts`.
- `tests/browser/interactions.test.mjs`.
- `docs/INTERACTION_FIXES.md`.

Modified:

- `src/model/types.ts`, `src/model/components.ts`, `src/model/coordinates.ts`, `src/model/project.ts`, `src/model/editor.ts`.
- `src/sim/topology.ts`, `src/sim/models.ts`.
- `src/features/workspace/Workspace.tsx`, `src/features/workspace/useCircuitInteraction.ts`, `src/features/workspace/useWorkspaceNavigation.ts`.
- `src/features/project/useCircuitEditor.ts`.
- `src/features/components/ComponentLibrary.tsx`, `src/features/components/ComponentArtwork.tsx`, `src/features/components/SimulationProperties.tsx`.
- `src/app/App.tsx`, `src/app/styles.css`.
- `src/locales/en/messages.ts`, `src/locales/es/messages.ts`.
- `tests/browser/harness.mjs` (await Vite shutdown between browser files).
- `README.md`, `docs/architecture.md`, `docs/simulation.md`, `docs/physical-scale.md`, `docs/physical-scale-reference.svg`, `docs/BROWSER_TESTING.md`.

## Remaining limits

Insertion supports the four modeled passive footprints and fitting orientations. It does not perform 3D collision/body-clearance simulation, bend arbitrary leads, or insert MCU boards/supplies. Legacy overlapping layouts are left unmounted until explicitly placed. Older application versions cannot safely roundtrip the new attachment extension. Real browser acceptance is pending because execution is blocked here; no Phase 4 work was started.
