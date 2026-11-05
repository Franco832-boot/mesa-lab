# Development roadmap

The Phase 1 foundation is preserved. Phase 2 implements the physical editor and shared-scale correction; interactive browser validation remains pending because previous attempts were blocked by environment port restrictions. Phase 3 milestones A–F have passed their implementation gates, including UI integration and result-driven condition presentation. Milestone G automated checks and documentation are complete; browser/visual acceptance remains pending because execution is blocked in this environment.

| Phase | Scope | Status and verification |
| --- | --- | --- |
| 1 · Foundation | React, strict TypeScript, Vite, languages, appearance and persistence | Preserved; all 29 original tests remain present |
| 2 · Editor | SVGs, physical scale, library, placement, selection, movement, rotation, duplication, wires, properties and history | Implemented; domain, coordinate, terminal and recovery tests. Interactive UI review pending |
| 3 · Circuits | Nodes, sources, ground, GPIO, breadboard, LEDs, resistors, pushbuttons and potentiometers | Milestones A–F implemented; G TypeScript / 123 tests / build pass; browser/visual acceptance pending |
| 4 · Virtual IoT | WiFi, IP, GET/POST, GPIO over HTTP, logs and failures | Pending, after a verified electrical engine |
| 5 · Programming | Monaco, per-board code and a compatible runtime | Pending; distinguish source editing, interpretation and actual emulation |
| 6 · Expansion | Sensors, relays, virtual MQTT and instruments | Pending, subject to verifiable models |

## Phase 3 milestone order

1. **A — Foundation (implemented):** audit, root engineering standards, agent responsibilities, design-system documentation and baseline quality gates.
2. **B — Electrical connectivity (implemented):** stable terminals, node resolution, ideal wires, breadboard continuity, invalid references and open/short diagnostics, with unit tests.
3. **C — DC solver (implemented):** sources, reference nodes, resistors, series networks, dividers and LEDs, with independently calculated tests.
4. **D — Interactive models (implemented):** pushbuttons, three-terminal potentiometers, Arduino UNO and ESP8266 GPIO, with tests.
5. **E — UI integration (implemented):** transient lifecycle, live electrical results, GPIO controls, diagnostics and typed bilingual messages.
6. **F — Conditions (implemented):** justified overload/overheating states, result-driven visuals, deterministic reset and reduced motion.
7. **G — QA and documentation (automated checks complete; browser/visual pending):** full tests, type checking, production build, electrical assumptions and Phase 4 boundaries are documented; browser execution remains blocked in this environment.

Complete and validate each milestone before starting the next. Actual delegated roles are optional engineering responsibilities; no autonomous agent runtime is required. See [the audit](PHASE3_AUDIT.md), [engineering responsibilities](AGENT_ROLES.md) and [standards](../AGENTS.md).

## Existing model acceptance coverage

The editor acceptance test creates ESP8266, BB830, an LED and a resistor; connects four wires using pin identifiers; moves and rotates components; changes resistance; saves through Redux Persist; and opens another store that recovers exactly the same document. Recovery discards history.

Tests also cover additions/deletions, duplication with internal connections, invalid references, wire endpoints during movement/rotation, physical proportions, zoom, undo/redo and literal Phase 1 fixtures.

Electrical reference-circuit, transient lifecycle, example-project and static SVG tests also pass their milestone gates. Static rendering verifies that LED glow requires engine brightness, an opened circuit is dark and overload visuals receive the electrical condition. These tests do not establish interactive layout or screenshot correctness.

These state integration tests do not replace an end-to-end browser walkthrough. Earlier Vite startup attempts failed with `listen EPERM`; visual/touch validation was not performed.

## Browser review checklist

1. Open desktop, tablet and 320 px mobile layouts; check panel behavior and horizontal overflow.
2. Add components by click and drag/drop; inspect relative UNO/NodeMCU/BB830 and small-component scale.
3. Select, move, rotate, duplicate and delete groups; cancel movement with Escape and a second pointer.
4. Connect exact SVG terminals and inspector-selected pins; cancel connections and add waypoints.
5. Move/rotate wired components, edit wire routes/colors, undo/redo, then save and reload.
6. Change language; test keyboard access, focus, screen-reader labels, zoom and touch gestures.
7. Build source → resistor → LED → ground with actual wires; check illumination, reverse polarity and a removed wire.
8. Toggle a pushbutton, adjust a potentiometer and configure manual GPIO; verify solved values and diagnostics.
9. Check Start/Pause/Stop/Reset, structural-edit guards, justified warning visuals and reduced motion.
10. Review screenshot baselines before approval. Record browser execution limitations explicitly.

## Electrical acceptance boundary

Physical connections and topology alone do not establish a valid electrical solution. Phase 3 must resolve networks, validate sources/GPIO, model loads and return verifiable states. An LED cannot illuminate simply because a wire is drawn, its package color changes, or a GPIO is HIGH.

Unsupported circuits must produce explicit diagnostics. Warnings do not imply permanent damage, and firmware, WiFi and HTTP execution remain future capabilities.

Final outcomes and browser execution limitations are tracked in [the validation record](PHASE3_VALIDATION.md) and [browser testing procedure](BROWSER_TESTING.md).
