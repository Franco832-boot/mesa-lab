# ESP8266 programming, virtual WiFi and web preview: Phase 1

> Historical design audit. The later Phase 2B request supersedes saved access-point/credential-matching proposals with arbitrary nonblank credentials and a unified bottom monitor. Current behavior, limits and validation: [ESP8266_PHASE2B.md](ESP8266_PHASE2B.md).

Audit date: 2026-11-07. Inspected HEAD: `2cf6871`, including the existing uncommitted workspace changes. This document records the Phase 1 audit. The user subsequently authorized Phase 2A only, clarified standard .h/.cpp organization and deferred linked-file execution to a separately authorized integration phase. See ESP8266_EDITOR_PHASE2A.md for the delivered editor scope.

## Technical diagnosis

The existing electrical engine should be retained. Most circuit, editor and lifecycle foundations already exist. The missing work is coherent source composition, additional bounded interpreter capabilities, firmware-driven network adapters and an isolated web application runtime.

Some repository documentation predates the current source: `architecture.md` and `WORKSPACE_AND_IOT.md` still describe unavailable firmware execution, and `ARDUINO_RUNTIME_PLAN.md` describes an older interpreter. `DHT11.md` describes a bare four-pin sensor; the current registry models a three-terminal module with a 10 kΩ internal DATA-to-VCC pull-up. Source and executed tests take precedence in this audit.

| Area | Inspected implementation | Finding |
| --- | --- | --- |
| Authoritative project | `model/types.ts`, `features/project/projectSlice.ts`, `model/editor.ts` | One Redux project document, validated editor commands, bounded history, board-specific programs. Preserve this boundary. |
| Files and editor | `model/programFiles.ts`, `features/tools/CodeWorkspace.tsx` | Per-board file CRUD and accessible file tabs already exist. Extensions include `.ino`, `.h`, `.cpp`, `.html`, `.css`, `.js`. All contents and the active file survive save/reload. HTML is currently inert text. |
| Source entry point | `app/App.tsx` | Start selects the exact filename `main.ino`. Additional files are saved but neither linked nor interpreted. The legacy `source` field mirrors the first file, which need not be `main.ino`. |
| Interpreter | `firmware/lexer.ts`, `parser.ts`, `compiler.ts`, `machine.ts`, `uno.ts` | A real bounded source parser, typed AST, instruction compiler and resumable VM, shared by UNO and ESP8266. It is not a native C++ compiler or ESP8266 CPU emulator. |
| Libraries | `firmware/libraries.ts`, `ports.ts` | Explicit method contracts and injected circuit capabilities already support bounded DHT, Serial and LCD adapters. There is no native header/library loading. |
| Runtime | `features/simulation/runtime.ts`, `firmwareRuntime.ts`, `useSimulation.ts` | Execution, GPIO, sensor overrides, serial output, network sessions and snapshots are transient, outside Redux Persist. Virtual time and cooperative scheduling already exist. |
| Electrical engine | `sim/engine.ts`, `topology.ts`, `dc.ts`, `gpio.ts` | Pure circuit evaluation, physical pin aliases, loaded GPIO drivers and result-driven LED brightness. No replacement is warranted. |
| Virtual networking | `model/virtualNetwork.ts`, `sim/network.ts`, `features/tools/IotWorkspace.tsx` | Saved SSID and declarative routes; manual immediate connect/disconnect; transient unique `192.0.2.1`–`192.0.2.254` addresses; validated device-targeted HTTP exchanges and GPIO proposals. No real network I/O. |
| HTTP execution | `features/simulation/runtime.ts` | A configured route returns a fixed body and optional GPIO action. That action enters the existing electrical transition. No sketch callback runs, no response headers/content type exist, and no server begin/handleClient lifecycle exists. |
| Serial UI | `features/simulation/SimulationConsole.tsx` | Existing per-board bounded virtual Serial output and located interpreter errors can be reused for the requested mini-tab. UART hardware and serial input are not implemented. |
| Persistence | `app/store.ts`, `app/persistence.ts`, `model/project.ts` | Only `document` is persisted. Portable project version and storage version are both 1, with separate responsibilities. Validation reconstructs known fields, so adding TypeScript fields alone cannot preserve new data. |

### Actual language and API compatibility

| Capability | Current support | Required increment |
| --- | --- | --- |
| `setup()` / `loop()` | Exactly one zero-argument void definition of each. | Preserve existing lifecycle. |
| Variables and expressions | Bounded `int`, `long`, `unsigned long`, `bool`, `float`; arithmetic, comparisons, short circuit logic and assignments. | Extend typed values carefully for network strings and IP values. |
| Control flow | Blocks, `if`/`else`, resumable `for`, void `return;`. | User functions/call frames; later bounded `while` for conventional connection polling. `switch`, `do`, `break`, `continue` remain unsupported unless separately implemented. |
| User functions and callbacks | Unsupported; parser only accepts setup/loop definitions. | Function symbols, parameters/returns, source locations and bounded resumable call frames. Start with named callbacks; reject lambdas explicitly. |
| `pinMode()` | INPUT and OUTPUT. Source-level INPUT_PULLUP is unavailable, although the electrical model and DHT adapter can use pull-ups. | Add only with board-specific validation if included. |
| `digitalWrite()` | Supported through ordinary electrical inputs; requires OUTPUT mode. | Reuse unchanged. |
| `digitalRead()` | Unsupported in the interpreter. Solved digital readings already exist. | Inject a circuit read capability and solve pending effects before reads; never return the output latch as a substitute. |
| `delay()` / `millis()` | Supported, also `delayMicroseconds()` / `micros()`. Virtual time, cooperative yields and unsigned rollover are tested. | Reuse the clock for network deadlines. Preserve pause/reset semantics. |
| `DHT.h` | Bounded constructor, `begin()`, no-argument `readTemperature()` / `readHumidity()`, NAN/isnan failure handling. Reads depend on actual wiring, power, DATA idle level, warmup and cache. | Reuse; add ESP8266 weather integration tests. No DHT22 or arbitrary DHT overloads. |
| Serial | `begin`, bounded `print` / `println` for supported numbers and string literals. | Reuse output; extend only for supported network value types. |
| `ESP8266WiFi.h` | Header and APIs rejected. | Explicit ESP-only adapter for begin/status/localIP and named status constants. |
| `ESP8266WebServer.h` | Header, class, handlers and send calls rejected. | Constructor and route registry; begin/handleClient/send adapters; request context; resumable callback dispatch. |
| C++ strings and preprocessing | String literals in selected print calls; limited object-like defines and allowlisted includes. No general `String`, pointers, arrays, char buffers, local includes, templates, or arbitrary preprocessing. | A documented bounded String subset for dynamic sensor responses; explicit virtual HTML asset binding. |

Current limits are distinct: the editor stores up to 40 files / 500,000 source code units per board; the compiler accepts 32,768 source code units, 512 statements, 4,096 AST nodes and nesting depth 32. An advance defaults to a 4,096-instruction budget. Multi-file execution must apply aggregate limits, retain original file/line/column mappings and explain storage versus execution limits.

Unknown constructs already fail visibly, but commonly as a generic unsupported-syntax error. Add typed ES/EN diagnostics for unsupported headers, APIs, callbacks, source files and values rather than pretending that accepting an include provides a complete library.

## Recommended architecture

Retain `src/sim` as a pure electrical/network domain with no React, Redux, DOM or browser APIs. Extend the VM and its typed capability ports; keep orchestration in `features/simulation`. No real HTTP server, sockets, backend service or replacement electrical solver is needed.

```text
Redux project: board files + virtual access-point configuration + physical circuit
                         |
             source resolver + file location map
                         |
              bounded Arduino AST/compiler/VM
                         |
          runtime coordinator / typed capability ports
            |                 |                  |
       virtual WiFi     virtual HTTP queue    DHT / GPIO
                              |                  |
                       sketch callbacks    existing solver
                              |                  |
                      typed HTTP response   SVG readings
                              |
                  controlled HTML preview bridge
```

### Mini-tabs and one logical program

Map the ESP8266 sections to actual project files, with localized labels: Principal → `main.ino`, WiFi → `wifi.h` / `wifi.cpp`, Functions → `functions.h` / `functions.cpp`, Web server → `server.h` / `server.cpp`, HTML → `index.html`. Serial monitor displays transient execution output, network events and diagnostics for the selected board; it is not a saved source file. Reuse the existing editor/file explorer and preserve arbitrary existing files, UNO layout and board context.

Create missing section files through the ordinary validated command/history path when needed. Do not replace imported files, seed templates over user code, or keep a second editable code buffer. Filename conflicts must be shown, not silently renamed. Mini-tab selection can remain a UI preference; source and asset contents are project data.

In the separately authorized integration phase, introduce a pure program resolver that respects ordinary Arduino/C++ file organization: main.ino as entry, local #includes, header declarations, .cpp translation units, function calls and cross-file symbol resolution. Keep include guards, file boundaries and original file/line/column diagnostics meaningful; detect missing includes, include cycles and duplicate/missing definitions. Do not blindly concatenate implementations and headers or invent a replacement include syntax. Define and test an explicit supported preprocessing/linking subset, with bounded resources and clear diagnostics for unsupported constructs. HTML/CSS/JS remain web resources, not Arduino compilation units. Until integration is implemented, the existing interpreter still executes only main.ino and rejects unsupported local includes. Preserve UNO behavior.

The Functions tab cannot be considered executable until bounded user-function calls actually work. Implement this prerequisite only in a separately authorized integration increment: scalar/void signatures, bounded argument/local storage, deterministic return semantics and resumable call frames. Initially reject recursion and function pointers except a validated named server-handler reference. Test delay inside nested helper calls, error unwinding, yields and file diagnostics before adding networking.

### Saved data and migrations

Phase 2 can reuse existing `files`, `activeFile` and the validated legacy `source` projection without changing the JSON shape. Existing single-source projects still appear as `main.ino`. No new saved execution/status field is needed; `BoardProgram.execution: 'unavailable'` is a legacy format literal, not authoritative execution status.

Phase 3 needs new explicit saved configuration for a virtual access point, including a fictional password, availability and connection latency. Keep it separate from source and HTML. Access-point credentials describe the simulated environment; the arguments passed to `WiFi.begin` describe the client request and can intentionally mismatch. UI controls must distinguish these meanings. Never connect to or ask the host operating system for real WiFi credentials. Treat sample passwords as ordinary fictional project data; avoid echoing them into diagnostic histories.

Recommend portable project v2 plus storage v2 when adding this network schema. Define ordered old→new migrations and old/current/corrupt/future fixture tests before enabling writes. Legacy declarative routes remain usable in an explicit legacy/manual mode; old projects must not suddenly require firmware. New firmware mode derives registered routes only from executed source. No automatic fallback from a missing sketch route to a saved declarative GPIO action, and no second persisted editable runtime route table. Existing applications that understand only v1 must reject v2 rather than silently discard new fields.

Persist files, configuration and physical circuit only. Do not persist WiFi status/IP, server-started state, handler registrations, request queues, serial output, preview sessions, GPIO overrides, DHT samples or execution frames. Editing source preserves the currently running compiled snapshot until explicit restart; restarting recompiles all supported files. Reset/Stop clears all transient state and cancels pending preview requests. Pause freezes virtual time and rejects requests that would execute code.

### Virtual WiFi and server semantics

Use a deterministic `disconnected → connecting → connected | error` state machine per device. `WiFi.begin` requests connection; the virtual clock advances a configured deadline and checks the saved virtual access point. Reuse address allocation and target validation. Define supported WL constants explicitly and map API status to UI state without equating all errors with disconnected. `WiFi.localIP()` needs a bounded IP value and documented conversion/Serial behavior, not a fabricated scalar.

First server contract: `ESP8266WebServer server(80)`, named zero-argument void handlers, `server.on(path, HTTP_GET/HTTP_POST, handler)`, `server.begin()`, `server.handleClient()`, and `server.send(status, contentType, body)`. These are compatibility adapters, not execution of upstream C++ headers. Lambdas, uploads, TLS, arbitrary headers, streaming and general filesystem access are initially unsupported. Add request body/query APIs only with explicit parsing, signatures and bounds.

Reuse virtual HTTP validation/history while separating transport lookup from application dispatch. Queue bounded requests against an exact board/session/server; run a handler only when that board executes `handleClient()`. A stopped/unstarted server cannot return a successful route response. A response is completed by send; reject duplicate sends, report missing responses and time out stalled handlers. Define queue length, virtual deadlines, status codes, body sizes and fair event ordering. A handler delay suspends that handler/board, not the UI. Disconnection, reset, firmware failure and board deletion cancel outstanding exchanges.

Both manual HTTP controls and the preview must call this same transport/dispatcher. For a board executing firmware, writes must pass through its VM so mode/latch state agrees with circuit inputs. Current manual HTTP actions and VM writes can otherwise overwrite the same pin without a shared ownership rule. Preserve existing manual-only behavior for legacy projects.

Extend HTTP responses to carry validated content type and appropriately bounded HTML bodies; today's 4,096-character body limit is too small to assume general web assets fit. Use typed strings and bounded concatenation/conversion for sensor JSON, rather than filling route bodies directly from UI state. Expose index.html through a documented subset of standard ESP8266 resource APIs (for example a supported filesystem open/streamFile path), selected in the integration design. Do not introduce MESA_HTML or another proprietary source syntax. Saving the resource in Phase 2A does not claim that a filesystem, streamFile, PROGMEM or C++ raw-string support exists.

### HTML isolation and compatible JavaScript

Opening the preview must request `/` through the running virtual server and render its actual successful HTML response. A saved HTML file alone does not start a server or enable an interactive session. Sensor fetches and LED commands pass through registered sketch handlers; preview code has no direct component, sensor, GPIO or Redux access.

Use an iframe with an opaque origin and a narrow, validated per-session message channel. Do not grant same-origin, parent DOM, forms, popups, downloads, top navigation, storage, or arbitrary remote resources. Add a restrictive CSP and a sanitized DOM/CSS/resource policy; validate message source/session, request identifiers, board binding, method/path/body sizes and rate. Never trust an origin of `null` alone to identify the iframe. Replace sessions on navigation, board switching, Stop and Reset; ignore stale replies.

An iframe sandbox alone is not a complete network or CPU sandbox. The recommendation is to render sanitized HTML/CSS with trusted bridge code and execute user JavaScript in a bounded isolated interpreter/VM in a Worker, exposing only a small DOM/event facade and virtual HTTP capability. Do not execute arbitrary user scripts with host eval or grant them the Worker's native fetch/import/WebSocket capabilities. Define an initial subset for element lookup, text updates, button listeners, virtual timers and relative virtual fetch/JSON responses. Unsupported JavaScript/DOM operations need located errors. Select and justify the interpreter dependency at the Phase 4 gate; an isolated embeddable VM may be preferable to writing another general language parser. Keep this web runtime separate from the Arduino VM.

If native iframe JavaScript is considered instead, first demonstrate equivalent confinement, cancellation and resource bounds in browser tests. Do not claim that CSP alone stops every navigation or that an iframe alone interrupts an infinite loop. Blocking external resource loads, navigation and parent access is an acceptance requirement, not a future enhancement. Test malicious HTML, SVG/CSS URLs, script URLs, iframes, forms, forged messages, URL schemes, floods and infinite execution. The browser tests are required before claiming preview isolation.

### Electrical weather-station example

Reuse the current three-terminal DHT11 module and its internal 10 kΩ pull-up. Proposed wiring: ESP 3V3 → VCC, shared GND, D2/GPIO4 → DATA; D1/GPIO5 → 330 Ω → red LED anode, LED cathode → GND. Use the physical registry and existing breadboard commands. These pins avoid the modeled boot-sensitive outputs. Do not power the module from 5 V with a direct 5 V pull-up onto an ESP input.

The sketch calls DHT begin, waits for warmup, samples through `observeDht11`, and exposes the resulting values from `/temperatura` (temperature and humidity JSON). Invalid reads produce an explicit unavailable/error response; no fixed fallback measurements. Polling respects the existing two-second DHT cache and uses virtual time. LED handlers call digitalWrite after setup configures OUTPUT.

With the current illustrative ESP 50 Ω output resistance and red LED 2 V forward-drop model, expected ON current is independently `(3.3 − 2.0) / (330 + 50) = 0.0034210526 A`; expected brightness is that current divided by 0.02 A. LOW gives zero forward current. These are simulation model expectations, not a transistor-accurate hardware promise. Reversed/missing LED wires must remain dark even if HTTP succeeds. Wrong DATA pin, missing ground/power, an actively driven DATA bus or unsafe voltage must never produce a valid invented sensor reading.

For digitalRead, add a separate host capability that flushes pending writes and evaluates solved `PinResult.logic` relative to board ground. FLOATING, UNDEFINED, CONFLICT and unsafe voltage need documented diagnostics; no invented HIGH/LOW. Multi-board reads need deterministic shared event ordering because the current runtime advances boards separately and commits timestamped GPIO batches afterward.

## Delivery gates

| Phase | Reviewable delivery | Acceptance before proceeding |
| --- | --- | --- |
| 1 — Analysis | This audit and design only. | User approves Phase 2A only. |
| 2A — Editor | Six ESP mini-tabs mapped to ordinary saved files and existing transient serial output; existing projects/files preserved. | CRUD, board switching, reload/export/import, undo/redo, ES/EN, keyboard navigation; no claimed WiFi/HTML execution. |
| Integration prerequisite — separate approval | Standard include/header/translation-unit resolution, location mapping and bounded helper-function call frames in separate changes. | Calls across files, nested waits/yields, duplicates/unsupported files, aggregate limits, UNO regressions. Deferred by the user's Phase 2A clarification. |
| 3A — WiFi | Explicit migrations, ESP-only signatures and virtual-time connection/error states. | Credential mismatch, unavailable AP, independent devices/IPs, pause/reset, no real networking. |
| 3B — Server | Typed strings/asset binding, handler registrations, queue, handleClient/send and unified dispatch. | Actual source controls route behavior, dynamic test bodies, lifecycle/errors/limits; no legacy fallback in firmware mode. |
| 4 — HTML | Editor and server-response preview, bounded JS capabilities and isolated bridge. | Browser interaction plus adversarial confinement tests; no direct application/circuit access or real external requests. |
| 5 — Electrical integration | Saved weather-station circuit/program/assets and integrated sensor/LED paths; digitalRead increment as specified. | Changed physical sensor inputs reach HTTP; button→handler→GPIO→calculated LED; negative wiring/load tests and independent current expectations. |
| 6 — QA/docs | End-to-end persistence, reset, multiple boards, UNO/DHT/LCD regressions and compatibility matrix. | All quality gates, browser flows and documented executed/unexecuted coverage. |

Run relevant tests in every increment, not only Phase 6. Preserve the engineering checklist order: foundation → connectivity → DC-model reuse/verification → interactive models → UI integration → conditions → QA/docs. Existing electrical milestones are reused; do not reopen unrelated editor or artwork work.

## Baseline validation executed during this audit

All commands used Node `v22.23.4`; the shell default is unsupported Node 18. No application code or tests were changed for this audit.

- `npm run typecheck`: passed.
- `npm test`: 507 passed, 1 failed out of 508 across 58 files. The failure was a 5,000 ms timeout in `ProjectLibrary.test.ts`, “uses the split-panel toolbar button for right tools only, preserves tabs and starts on Components”.
- Targeted rerun `npm test -- src/app/ProjectLibrary.test.ts`: all 18 passed. This suggests timing sensitivity; it does not turn the earlier full-suite run into a pass.
- `npm run build`: passed. Vite warned about a minified JavaScript chunk larger than 500 kB.
- Focused browser command: `node --test --test-concurrency=1 tests/browser/dht11.test.mjs`, using the cached Playwright module and installed Chrome. The restricted attempt failed at file launch. After running with approved elevated execution, the browser started and executed both cases: 1 passed, 1 failed.
- Browser failure: at `tests/browser/dht11.test.mjs:42`, the global `dht11-pcb` selector returned 3 elements instead of 1 after reload. That test stopped before its live sensor assertions. The independent wrong-DATA-pin case passed, showing an invalid reading rather than canned values. The selector failure was recorded, not fixed outside this phase's scope.
- Full browser suite, weather-station flow, multi-file execution, WiFi APIs, server callbacks and HTML isolation were not verified. The latter features do not yet exist.

The baseline is therefore not fully green. Do not report complete regression verification. Carry the timeout and browser selector failure into the next phase's QA gate without overwriting unrelated local work.

## Primary API/security references

Reviewed on 2026-11-07; upstream main/master and living-standard pages can evolve. Pin a reviewed upstream version when writing the final compatibility matrix.

- [ESP8266 WiFi station API source](https://github.com/esp8266/Arduino/blob/master/libraries/ESP8266WiFi/src/ESP8266WiFiSTA.h): begin, status and IPAddress-returning localIP contracts.
- [ESP8266WebServer source](https://github.com/esp8266/Arduino/blob/master/libraries/ESP8266WebServer/src/ESP8266WebServer.h): named handler compatibility, on, begin, handleClient and typed send overloads. This audit proposes a small subset, not the full header.
- [HTML iframe sandbox specification](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox): sandbox permissions/origin behavior. The bounded web VM and resource policy are the proposed design, not functionality supplied automatically by an iframe.

Only Phase 2A was subsequently authorized. No linked-file interpreter, WiFi/server adapter, resource loader or HTML preview is authorized by that editor approval. Their design and implementation require separate authorization.
