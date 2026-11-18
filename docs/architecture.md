# Architecture and state

## Responsibilities

Phase 2 extends the existing foundation. React composes the UI; TypeScript retains `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Vite develops and bundles the application; Vitest checks critical logic. No dependencies were introduced for the editor, gestures, history or SVG artwork. Phase 3 milestones A–F, including the electrical domain, UI integration and condition visuals, are implemented. The current validation record is in [workspace and virtual IoT](WORKSPACE_AND_IOT.md); browser/visual verification remains pending, following the milestone gates in [the engineering standards](../AGENTS.md).

`model` imports neither React nor Redux:

- `types.ts`: document, components, pins, wires, GPIO and electrical state contracts.
- `components.ts`: reusable definitions, internal contacts, stable identifiers and normalized terminals.
- `physical.ts`: nominal dimensions, artwork calibration and the single global physical scale.
- `coordinates.ts`: world/screen coordinates and rotations.
- `editor.ts`: pure commands and wire route calculation.
- `project.ts`: project creation, validation and versioned JSON.

SVGs consume terminals from the registry without maintaining a second position map. Normalization converts artwork to the same local coordinate system used by wires. See [physical scale](physical-scale.md).

## State

There is **one `project` slice**. `ProjectState.document` is the authoritative project; `useProject` adapts selectors and actions without copying the document. An explicit `persistReducer<ProjectState>` preserves strict inference for the store and hooks.

`history.past` and `history.future` retain up to 50 editor operations. Their snapshots contain components, wires and programs; undo preserves the current name and viewport. Editing after undo discards the future. Import and reset clear history.

Reducers are pure: they perform no I/O, generate no identifiers and run no simulation. Commands are validated before replacing the document. Operations that change no data create no history entry. Deleting a component also deletes its wires and associated code; duplicating a selection copies its internal connections and code with new identifiers.

`useCircuitEditor` keeps selection and the active tool in React. `useCircuitInteraction` holds only the connection draft and preview positions or waypoints. It does not copy the whole project. Dragging does not dispatch a document update every frame: releasing the pointer commits one command. Escape, pointer cancellation or the start of a two-finger gesture discards the preview.

## Wires and breadboard

Endpoints are `{ componentId, pinId }`; rendering derives their coordinates from the current physical definition, position and rotation. Waypoints stay in world units. Invalid endpoints are rejected at the data boundary; the renderer also skips a wire if either endpoint cannot be resolved.

Routing is orthogonal and deterministic, without automatic obstacle avoidance. A crossing creates no implicit node. The inspector supports exact terminal selection and waypoint editing without depending on touch precision.

BB830 has 830 terminals and 130 groups: two isolated groups of five per column, plus four independent continuous rails of 50. The electrical engine uses these registry groups as authoritative internal continuity. This represented SVG does not depict split rails. The drag-placement pipeline resolves compatible lead footprints against actual free hole centers and commits explicit per-component `attachments`. A component moved away detaches; moving or rotating a breadboard carries its mounted parts. Raw overlap without a successful placement does not connect anything. `model/breadboard.ts` is shared by drag previews, editor commits and import validation.

## Persistence

Redux Persist wraps only the project reducer with `whitelist: ['document']`. It saves the document and internal `_persist` metadata; history, selection, gestures, drafts, hover and save metadata are excluded. The language preference is stored separately.

The document includes components, positions, rotations, configurable properties, optional lead attachments, wires/routes, board configuration, associated code and viewport. It contains no SVGs, derived dimensions, calculated networks or execution state.

Automatic writes are grouped using a 150 ms interval. Save requests a checkpoint and calls `persistor.flush()`. Notifications are deferred to a microtask to avoid dispatching inside Redux Persist's internal reducers. Redux Toolkit serialization checks remain enabled, except for the documented internal Redux Persist actions.

`PersistGate` waits for reading, migration and validation before displaying the editor. Storage failures are reported and can be retried; JSON export remains available.

## Accounts and cloud copies

The same application store now includes transient `auth` and RTK Query `api` reducers. The existing persisted `project.document` remains the authoritative editable circuit. Authentication and API responses are not persisted; the JWT resides only in a per-store memory runtime. Guest simulation and local Save remain available. Cloud saves and opening downloaded copies require explicit user actions, and opening reuses the existing validation and immutable-backup flow. See [the real contracts, privacy behavior and verification limits](API_INTEGRATION.md).

## Versions and compatibility

| Format | Version | Responsibility |
| --- | --- | --- |
| `mesa-circuit` | 1 | Portable JSON |
| Redux Persist | 1 | Stored container |

Adding history or physical scale did not increment versions: neither is persisted and the document structure did not change. Phase 1 already included wires and programs. Terminal validation was extended and old UNO labels such as `13` are normalized to `D13`.

`migratePersistedProject` preserves the v0→v1 path (`project` to `document`), and the old manual `mesa.project.v1` key is loaded when no newer Redux entry exists. That key is retained as a backup; new writes use `persist:mesa.project`.

Corrupt or future-version data is copied to `mesa.project.recovery` before allowing the recovery workbench to write. If backup fails, writes are blocked to preserve the original. This is not a backup history: it retains the most recently rejected entry.

```text
localStorage.getItem('mesa.project.recovery')
```

For future container changes, increment `PERSIST_VERSION`, add ordered migrations and test old, current, invalid and future fixtures. Changing the portable format requires its own migration. Unknown versions are not accepted as compatible. The additive v1 `component.attachments` extension accepts legacy absence as an unmounted component without rewriting the old document. Present lists are normalized and validated for references, full footprints, exact alignment and exclusive hole occupancy; migration and recovery tests cover both forms. Older application versions do not understand this extension and must not be used to roundtrip mounted projects.

## Validation

`parseProject` limits JSON to 2 MB, 500 components and 2000 wires. It reconstructs only known fields and rejects non-finite numbers, invalid types/properties, duplicate IDs, nonexistent components/terminals, self-connections and code associated with non-board components. Boards retain their fixed nominal logic voltage.

This validation is structural and physical; it does not establish electrical compatibility. For example, a wire from 5 V to an ESP8266 GPIO is structurally valid but must receive an electrical diagnostic. Accepting a wire never proves electrical correctness.

## Electrical and future engines

`sim` implements framework-independent electrical evaluation. `topology.ts` resolves registry contacts/wires; `models.ts` builds component branches; `linear.ts` and `dc.ts` solve bounded DC networks; `gpio.ts` models and evaluates digital pins; `inputs.ts` validates overrides; `engine.ts` assembles readings, conditions and diagnostics. Validated circuit data and transient inputs enter the pure `evaluateCircuit` function; typed electrical results and diagnostics leave it. See [electrical assumptions and limitations](simulation.md). React renders results and the UI integration owns lifecycle controls outside reducers. `features/simulation/runtime.ts` defines deterministic Start/Pause/Stop/Reset transitions; its React adapter holds only transient controls/results. The inspector presents solved readings and manual GPIO; SVG artwork consumes engine brightness/conditions without running electrical calculations. CSS transitions respect reduced motion. `damaged` remains a reserved condition, and no permanent-damage or smoke model is implemented. Simulation status, button presses, temporary GPIO overrides, instantaneous readings and derived component conditions must not enter the persisted document.

Virtual WiFi/HTTP now uses `sim/network.ts` and atomic runtime transitions through these existing GPIO boundaries. Saved device configuration is an optional validated v1 extension; sessions and history remain transient. A memoized electrical fingerprint separates source/network metadata from topology/model changes. Future firmware and isolated HTML controllers must use the same device-targeted request/GPIO contracts without importing React or Redux or rewriting electrical models. Backend services, microservices and generic event buses are outside the current scope. Firmware execution remains unavailable.

See [the validation record](PHASE3_VALIDATION.md) and [browser testing procedure](BROWSER_TESTING.md) for executed checks and remaining environment limitations.

Direct knob gestures use a captured SVG control with inverse screen CTM coordinates. The control blocks parent drag, wire and navigation handlers; canvas navigation is suspended while a control owns a gesture. Stopped-mode previews stay in React and commit one property command on release. Running-mode changes use transient simulation inputs and immediately reevaluate the existing engine. See [the focused interaction report](INTERACTION_FIXES.md).

The unified workspace, shared board context, contextual inspector, sidebar preferences, virtual networking contract and runtime reconciliation are detailed in [WORKSPACE_AND_IOT.md](WORKSPACE_AND_IOT.md).
