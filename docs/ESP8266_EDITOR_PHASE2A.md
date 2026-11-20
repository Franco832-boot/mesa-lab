# ESP8266 project editor — Phase 2A

> Historical Phase 2A record. Linked-file execution and the server preview are now covered by [Phase 2B](ESP8266_PHASE2B.md); the limits below describe the earlier milestone.

Scope authorized on 2026-11-07: project file organization and persistence only. Linked-file execution, WiFi/server adapters, web resource delivery, preview and further electrical integration require separate authorization.

## Delivered behavior

| Mini-tab | Project files / existing state |
| --- | --- |
| Main | `main.ino`, plus unclassified/custom project source files |
| WiFi | `wifi.h`, `wifi.cpp` |
| Functions | `functions.h`, `functions.cpp` |
| Web server | `server.h`, `server.cpp` |
| HTML | `index.html`, additional `.html` / `.css` / `.js` resources |
| Serial monitor | Existing board-specific transient Serial output and located interpreter errors |

Sections are a view of the existing `BoardProgram.files`, with no second editable document. First opening an absent file section creates empty ordinary files via a validated atomic file action; existing module files and code are preserved. Files can be created, renamed and deleted using the existing controls. The full explorer retains all project files and selects the appropriate section. Mini-tabs and file tabs support keyboard navigation and fit narrow panels. Typed ES/EN copy identifies current execution/resource limitations.

`model/espProjectFiles.ts` owns pure section classification/navigation; it has no compiler semantics. `model/programFiles.ts` adds atomic multi-file creation to the existing command path. `CodeFilesEditor.tsx` extracts the existing reusable file editor; `EspProjectEditor.tsx` adds ESP-only navigation. `BoardRuntimeMonitor.tsx` shares the existing transient output/error presentation with the Messages console. UNO keeps its existing file editor.

The ESP section container keeps its intrinsic content height so the existing mobile panel scrolls rather than allowing the execution note to overlap file tabs. The Save button also retains a localized accessible name when its visible text is hidden by the existing mobile styles.

Persistence reuses the existing optional v1 files/activeFile fields and validated legacy source projection. Portable/storage schemas and migrations are unchanged. Source text, includes, declarations, function calls and resources survive existing save/reload and JSON roundtrips. Module-pair creation is undoable in one step. No runtime/log state is persisted. Components, wires, pin registry, electrical evaluation and firmware execution are unchanged.

## Explicit limits and integration requirement

Start still executes only `main.ino`. The editor preserves standard `.h`/`.cpp` organization but does not resolve local includes, link translation units, execute helper functions or support arbitrary C++. No simulator-specific symbol, DSL, generated route or HTML syntax is introduced. Resource loading must later use an explicitly supported standard API, rather than a proprietary source replacement.

The HTML editor stores a future web resource only. It renders no preview, runs no user script and inserts no fixed sensor data. Future preview must render the actual simulated ESP8266 server response; its actions must pass through sketch handlers and GPIO into the existing solver. Sensor responses must originate from the existing electrically validated DHT path.

Custom filenames are allowed but automatic section grouping is based on the conventional module names above. Renaming a module to a custom name moves it under Main/the explorer without changing its text or references. Includes are never rewritten automatically. `main.ino` is the current interpreter entry filename; renaming it does not change that interpreter behavior. The active source file is persisted; whether the serial mini-tab is open is a transient UI choice.

## Validation

Executed with Node `v22.23.4` and the installed/cached Chrome/Playwright pair. Browser execution used approved execution outside the restricted sandbox.

- Focused Vitest run: 29/29 passed for file organization, real Redux Persist recovery, editor markup and shared console rendering.
- Full Vitest run with `--maxWorkers=2`: 514/514 passed across 59 files, without changing test timeouts. An earlier default-worker run during concurrent validation produced five 5-second timeouts in existing application mounting/project-library tests; that failed run is not counted as a pass.
- Browser `tests/browser/esp-code.test.mjs`: 6/6 passed. Includes ES/EN at 1440 and 390 CSS pixels, real source editing, standard include/header/implementation text, inert HTML, board isolation, save/reload, unchanged physical circuit/viewport, active-file recovery, keyboard selection, explorer navigation, serial output isolation/Stop, and atomic undo/redo plus rename/delete preservation.
- Existing browser regression selected from `workspace.test.mjs`: “saved Blink runs from Start, advances the electrical LED, resumes without setup and stops” passed (1/1). This exercises the shared UNO editor and actual calculated LED through the existing firmware/runtime path.
- Type checking passed, including the final source state. A separate final `npm run build` passed after verify stopped at tests; Vite retained its warning for a minified JS chunk above 500 kB (564.42 kB). `git diff --check` passed.
- Initial browser attempts exposed test setup/CRLF expectations and then a real mobile file-tab overlap and missing accessible Save name. Test expectations were corrected; the overlap and button labeling were fixed. The final 6-case run above passed after those corrections.
- Full browser suite and screenshot baselines were not run/approved. The unrelated pre-existing DHT global-selector failure from the Phase 1 audit remains outside this change.

The final `npm run verify` attempt passed type checking, then stopped at Vitest: 512/514 passed, with two 5-second timeouts in `ProjectLibrary.test.ts` (right-tools toolbar/tabs and desktop Inspector toggles). No assertion or timeout configuration was weakened, and no unrelated test was edited. The earlier 514/514 two-worker run remains a separate successful result, not a passing default-worker gate. Standard `npm test`/`verify` are therefore not fully green in this environment.

No linked-file execution, WiFi/WebServer compatibility, HTML resource loading or preview isolation is claimed or verified by these checks.
