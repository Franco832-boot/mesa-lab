# Multi-file editor

Choose Code in the tools panel. The editor is docked in the main workspace below the still-mounted circuit. Drag its divider, or focus the divider and use Up/Down/Home/End. On mobile the tools drawer closes when Code is chosen. The editor uses the existing React controls and native text editing; no packages, syntax service or compiler are added.

Board tabs follow the same board-instance context as canvas selection. File tabs and a compact explorer select source files. New/Rename validate names; Delete requires confirmation and supports the existing stopped-mode undo/redo. Source changes dispatch directly to the authoritative project and use existing autosave; the editor reports saving/saved/storage failure. Switching tabs has no separate source buffer to discard.

Supported extensions: `.ino`, `.h`, `.cpp`, `.html`, `.css`, `.js`. Flat names use ASCII letters, digits, underscores, hyphens and periods; maximum 80 characters. Projects allow 40 files and 500,000 total source characters per board, subject to the existing whole-project size limit. Web files remain text in the editor. The explicit ESP8266 HTML preview serves registered resources from running firmware; see [Phase 2B](ESP8266_PHASE2B.md).

## ESP8266 project sections (current UI)

ESP8266 boards have six mini-tabs: Main, WiFi, Functions, Web server, HTML and Web view. They navigate files in the same board-owned program, not independent source buffers or separate programs. Main uses `main.ino`; first opening an absent WiFi/Functions/Web server section creates an empty `.h`/`.cpp` pair (`wifi`, `functions`, `server`). HTML creates `index.html` and groups HTML/CSS/JS assets. Pair creation is one validated editor command and one undo step; exceeding a file limit or colliding names creates nothing. Existing matching files are selected without overwriting them or automatically adding a missing counterpart.

The section filenames are navigation conventions only. Existing custom files remain reachable in the full explorer; unclassified source files appear under Main. A renamed module remains an ordinary saved file. The existing New/Rename/Delete controls work within this project, and the explorer can select a file from any section. Existing legacy `wifi.ino`/other `.ino` files are retained under Main; they are not converted or overwritten. File tabs and mini-tabs support Left/Right/Home/End keyboard navigation. Sections wrap in narrow panels.

All contents and the active source file use the existing Redux project and persistence paths, including JSON export/import. No schema or format change is introduced. Serial output/errors appear only in the existing bottom console, without an editor mini-tab or shortcut panel. Stop/Reset clear its existing runtime data. The editor omits redundant interpreter/library notices, leaving more room for source files. Interpreter limitations remain documented here and in the Phase 2B contract.

ESP8266 Start resolves local `.h` includes and `.cpp` modules into the existing bounded interpreter. Named void/bool functions without parameters, `const char*` text, solver-based `digitalRead`, emulated `ESP8266WiFi`, simulated `ESP8266WebServer` and read-only `LittleFS` support the library web LED example. Control IoT is retired. HTML edits project resources; the separate Web view opens automatically once per execution when the firmware connects and starts/polls its server: sanitized HTML/CSS in an opaque sandbox frame, classic project JS in a separate Worker with a limited button/text/local-GET bridge. No full C++ compiler, full DOM, real WiFi or external backend is provided. See [Phase 2B contracts, limitations and validation](ESP8266_PHASE2B.md). Arduino UNO retains its existing main-source execution path.

See [Phase 2A implementation and validation](ESP8266_EDITOR_PHASE2A.md).

The optional v1 `program.files` and `program.activeFile` fields preserve files and active selection per board. Legacy single-source data is exposed as `main.ino` and materialized on the first file operation. The legacy `source` field is a validated projection of the first file. Old application versions cannot retain additional files when roundtripping these projects. New import/export and Redux Persist preserve all files. File operations preserve component, wire and viewport references.

Focused tests cover CRUD, per-board isolation, all extensions, legacy migration, validation, undo/redo, electrical-reference preservation, real Redux Persist save/reload and rendered tab/split structure. Current executed browser results and limitations are recorded in [Phase 2B](ESP8266_PHASE2B.md).

Manual acceptance: edit UNO `main.ino`, create/edit `config.h`; select ESP8266 and create/edit its own files. Switch boards and files, rename and delete with confirmation, resize the split, and reload. Verify both boards' contents and active files remain and the circuit is unchanged.

The library example now has ten files, including `wifi.h/.cpp`. Main coordinates the LED, WiFi and HTTP modules; the WiFi module owns fictional credentials, a cooperative connection wait and a timeout. The WiFi section also configures a separate transient fictional access point. Credentials must match that configuration; it survives Stop, but not page reload or project replacement. These changes do not involve real network access.

The final UI cleanup removed the Serial mini-tab and informational notices only. Tests were adapted to that intentional UI contract but were not executed again, as requested by the user. See the current validation status at the beginning of the Phase 2B document.
