# ESP8266 execution, emulated WiFi and web GPIO — Phase 2B

## Current closeout status — 2026-11-08

Testing stopped at the user's request. Do not rerun tests without asking first. The final editor cleanup is UI-only: six sections (Main, WiFi, Functions, Web server, HTML, Web view), no Serial mini-tab/shortcut, and no redundant interpreter/library notice. The bottom Serial monitor and firmware/network/HTTP/electrical behavior were not changed by this cleanup. Existing UI assertions were updated without changing timeouts or suppressing failures; those edits have not been executed.

The implementation now includes a distinct Web view, once-per-run automatic reveal, virtual address/path controls, refresh/close/reopen, bounded HTML/CSS/JS resources, stricter CSP/message validation and a Worker watchdog. The example has ten files: Main coordinates `Funciones`, `wifi` and `Servidor`; `wifi.cpp` owns fictional credentials and timeout handling. Zero-argument bool functions and cooperative while waits run in the existing VM. The transient access-point configuration is independent of firmware credentials and requires an exact match; default fictional values are MiCasa/carlos with a 300 ms virtual connection delay. The connection has disconnected/connecting/connected/error states. Configuration survives Stop, not reload/project replacement, and has no new persisted schema.

Available evidence, without another test execution:

| Scope | Existing result | Qualification |
| --- | --- | --- |
| Original Phase 2B Chrome selection | 24/24 passed | Earlier baseline, before subsequent Web view/WiFi/UI changes. Detailed historical results below. |
| Strict TypeScript | Passed after the WiFi/configuration integration | Before the final UI-only cleanup. |
| Full Vitest with two workers | 548/548, 62 files, 21.91 s | Includes linked bool functions, virtual timing, credential mismatch, reconnect, HTTP gating and electrical tests; before final UI-only cleanup. |
| Focused later Chrome selection | 5/5, 45.08 s | Automatic Web view in ES/EN at 1440/390 px, actual page→LED, CSS, close/refresh/restart and dropped-response timeout. Before final UI-only cleanup. |
| Expanded web/security checks | Earlier 16/18 | Two test-design failures: sequential request flood did not deterministically exceed its rate; response-drop listener was installed after delivery. Flood was subsequently checked in isolation; corrected drop test passed in the five-case run. The entire expanded selection has no final completed result. |
| Latest expanded Chrome command | Interrupted; no completion report available | Not counted as passing or retried. New `esp-wifi` browser cases are authored, not verified. |
| Production build | Original baseline passed | No completed build recorded after later Web/WiFi changes. No new build or tests run for the final cleanup. |

The existing ProjectLibrary test has intermittently exceeded its unchanged five-second timeout under concurrent load. It passed in the recorded bounded-worker run. This remains a documented stability concern; no retry cycle or timeout increase is authorized.

Pending before claiming the latest state fully verified: one approved, finite validation of the new WiFi browser scenarios and complete hardened-security matrix, current TypeScript/build and final UI assertions. Do not treat the historical 24 cases as coverage of later changes. Security has no absolute guarantee: native JS allocations/browser rendering have no hard per-project heap quota. See [the current security model and residual risks](ESP8266_WEB_SECURITY.md).

The sections below retain the **original Phase 2B baseline** for traceability. Its immediate/any-nonblank credential model, eight-file layout and Serial/HTML navigation descriptions are historical and superseded by the current status above.

## Original Phase 2B baseline (historical)

## Try the complete example

Open **ESP8266 — LED control through a web server** in Projects. In Code → Main, change `ssid` and `password` to any invented nonblank strings. Start simulation. The firmware prints its own connection messages and fictitious IP in the **existing bottom Serial monitor**. Open Code → HTML: the preview opens automatically once the firmware has connected WiFi, started the server and executed `handleClient()`. Buttons send local HTTP requests through C++ handlers to D5/GPIO14 and the ordinary electrical solver. Close/reopen the preview with its own controls. Pause and Stop remove it; restart runs setup again with D5 LOW.

The eight real project files are in `examples/esp8266/web-led/`: `main.ino`, `Funciones.h/.cpp`, `Servidor.h/.cpp`, `index.html`, `style.css`, `app.js`. Main configures Serial and emulated WiFi and calls the modules. Functions controls the LED. Server registers named callbacks, serves the root with `streamFile(LittleFS.open(...))`, registers CSS/JS resources, and obtains LED state with `digitalRead`. HTML/JS displays returned state; it never maintains its own authoritative LED boolean.

## Audit and reused foundations

Reviewed the Phase 2A editor/documentation, simulation design, current editor and browser documentation, lexer/parser/compiler/VM, main entry selection in App, DHT/Serial adapters, Redux Toolkit/Persist/history, board context, six ESP sections, right-panel preferences, Inspector, example factories, physical pin registry, topology/DC/GPIO models and unit/browser tests. The responsibilities in `AGENT_ROLES.md` were used as architecture, electronics, UX and QA review checklists.

The earlier design document proposed access-point configuration, credential matching and a future schema migration. The user superseded that proposal with **any nonblank invented credentials**. This implementation therefore needs no saved access-point schema or migration. It also replaces the Phase 2A inline Serial view with a shortcut to the one existing bottom monitor. Historical documents are marked accordingly.

Milestones retain the existing foundations in order: file/function resolution; electrical contact connectivity; independently checked DC current; firmware-driven network/HTTP interaction; isolated preview and responsive UI; solver-derived conditions; QA/documentation. No alternate circuit or Arduino engine was introduced. A known architectural approximation is explicit: HTTP handlers dispatch synchronously between VM slices after `handleClient()` establishes readiness, rather than simulating TCP or exact subsequent polling deadlines. Callback delays are unsupported and fail visibly. A future queued/resumable transport can build on existing call frames and virtual time if delayed handlers are required.

## Runtime boundaries

```text
Redux project files per board
  → local header / .cpp resolution
  → existing bounded AST compiler and VM
  → code-driven WiFi state + server route registry
  → sandbox preview GET → same VM handler bytecode
  → ordinary GPIO events → existing DC solver → circuit LED
                              ↘ solved digitalRead → HTTP response → page
VM Serial output → existing bottom simulation console
```

`src/sim` remains independent of React, Redux and browser/DOM APIs. Firmware adapters are pure TypeScript. Runtime orchestration applies actual VM GPIO events to `SimulationInputs` and recalculates `evaluateCircuit`; SVG/React only render results. Redux is the sole editable project. Run-time copies of compiled source/resources are immutable execution snapshots, not another editable document. Editing code/assets takes effect after Stop/Start, and does not mutate a running server's resources.

Files, code, circuit and the active source selection use existing portable/storage v1 data, Redux Persist, JSON import/export and undo/redo. Password text remains ordinary user-owned project source; only temporary interpreter text values are needed during execution. Connection metadata stores status/SSID/IP, never a password. The simulator does not echo credentials or insert connection messages into firmware output. A user can explicitly print their own data in their own sketch; simulator diagnostics are separate from that output.

WiFi status/IP, server objects, routes/responses, call frames, text/scalar scopes, run snapshots, preview session tokens, pending browser requests, Serial output, manual GPIO and electrical results remain transient. Stop/Reset clears them. Project replacement/electrical changes use the existing reset policy. Board switching binds requests to that board's current firmware. Every successful run creates a fresh session identity; every opened preview gets a random token. A previous run's session or page token is rejected even if the same board starts again.

## Supported language subset

The existing arithmetic/scalars (`int`, `long`, `unsigned long`, `bool`, `float`), constants, operators, blocks, `if/else`, bounded resumable `for`, clocks, delays, GPIO, DHT, Serial and supported UNO LCD adapters remain available.

Phase 2B adds:

- Flat, case-sensitive project-local `#include "Name.h"`, including nested acyclic headers and custom filenames. Every `.cpp` from that board is linked, regardless of its filename. `main.ino` is the entry; other `.ino` files remain stored but are not entry points. Quoted built-in header names are reserved to known adapters. Angle includes are allowlisted.
- `#pragma once`; named zero-argument `void` prototypes, definitions, calls and early `return;`. Helpers share board globals and isolate caller locals. Calls use the existing bounded resumable machine, with a maximum of 32 frames.
- Literal-initialized `const char* name = "text";` declarations in global or block scope. These are immutable text bindings, not general pointer support. Text literals/bindings work with WiFi credentials, Serial print/println and HTTP response bodies. `WiFi.localIP()` has a supported text projection for printing/responses; full C++ `IPAddress` behavior is not implemented.
- `digitalRead(pin)` uses an injected circuit capability in the application: pending GPIO changes are applied to the ordinary solver before reading HIGH or LOW. Floating, conflicted or intermediate levels produce a located `indeterminate-read` error. There is no fabricated voltage or boolean fallback in the application. At most eight electrical read probes execute in one VM slice; long ordinary loops yield cooperatively. Isolated VM tests without a circuit host can only read configured output latches and make no electrical claim.

Local headers are included once across the linked subset. This is not a complete C++ preprocessor or separate native translation-unit compiler: cycles are rejected even where native include guards might handle them. `#ifndef` guards, parameterized macros, `extern`, namespaces, user classes, arrays, general pointers/references, mutable strings, raw strings, string concatenation, parameters/overloads/non-void user returns, lambdas, `while/do`, `break/continue`, ADC/PWM and arbitrary Arduino Core/native libraries remain unsupported. No proprietary source syntax or exact-text example recognition is used.

Storage and execution limits differ: editor limits remain 40 files / 500,000 source characters per board; linked C++ input has the existing 32,768-character, statement, AST and nesting limits. Missing files, circular includes, duplicate/unknown functions, unsupported syntax/APIs and invalid argument types produce typed ES/EN errors, with original file/line/column where available.

## Emulated WiFi API

ESP-only `#include <ESP8266WiFi.h>` exposes:

| API | Behavior |
| --- | --- |
| `WiFi.begin(ssid, password)` | Synchronous educational connection. Both supported text values must contain non-whitespace content. Any invented names/credentials meeting this condition succeed. No default network is imposed or consulted. |
| `WiFi.status()` | `WL_DISCONNECTED` (6) initially/after disconnect; `WL_CONNECT_FAILED` (4) after invalid credentials; `WL_CONNECTED` (3) after successful begin. |
| `WiFi.localIP()` | Supported text projection `192.0.2.10` only when connected. Otherwise errors visibly; it does not return a fabricated usable address. |
| `WiFi.disconnect()` | Clears the transient connection and IP; reconnect requires code to call begin again. |

No connection occurs merely from starting simulation or including a header. There is no radio, browser permission, real credential check, external service, DHCP/TCP, connection latency, or real network request. The stable documentation-range IP is scoped to each simulated board's capability/session; it is not routed and is not used for browser fetch. A disconnected board cannot serve the preview, even if its server object was previously begun.

## HTTP and resource API

ESP-only `#include <ESP8266WebServer.h>` supports one `ESP8266WebServer server(80)` per board. Port 80 is just a simulated argument; no socket is opened.

- `server.on(pathLiteral, handler)` and `server.on(pathLiteral, HTTP_GET, handler)` register exact local GET routes from executed code and named zero-argument void functions. Branches/variables/alternate handler names follow VM semantics. At most 64 distinct paths; repeated registration replaces the route without accumulating duplicate callbacks.
- `server.begin()` starts the server; `server.handleClient()` must execute before requests are accepted. Readiness is modeled between VM slices, not as CPU-cycle-accurate networking or a delayed handler queue.
- `server.send(statusExpression, mimeLiteral, textLiteralOrBinding)` returns the current callback's actual response. Supported localIP text can also be returned while connected. Multiple sends in one callback are rejected.
- With `#include <LittleFS.h>`, `LittleFS.begin()` enables read-only access to captured project resources. It is a statement-only adapter, not a native filesystem or a bool-returning API.
- `server.streamFile(LittleFS.open("/index.html", "r"), "text/html")` serves a project file inside a named handler. Only this bounded read/open context is supported; there are no arbitrary File objects, writes or host filesystem access.
- `server.serveStatic(routeLiteral, LittleFS, filePathLiteral)` registers an exact resource. CSS/JS require explicit routes. MIME derives from `.html/.css/.js` or falls back to text/plain.
- Valid paths are local absolute paths; query strings, encoded paths, traversal, hostnames, wildcard routes, request bodies, POST, cookies/headers, redirects, streaming, TLS and computed C++ strings are unsupported. Missing routes/resources return 404; invalid paths 400; disconnected/not-ready/paused/stopped servers 503.
- A callback runs the same bytecode/globals/peripherals/GPIO instructions with bounded work (4,096 instruction maximum, plus peripheral/read bounds). It must finish and send a response without waiting. Stalled/over-budget callbacks or positive delays fail with HTTP 500 and a localized diagnostic. Uncommitted peripheral/GPIO effects are discarded and the failed board releases its outputs using the existing failure policy; other boards continue.

## Circuit behavior and conditions

The library circuit is a normal v1 project: NodeMCU ESP8266, breadboard, red LED, 220 Ω resistor and wires. Shared physical contacts mount the resistor b29→b33 and LED c33→c34. D5 connects to a29; GND to a34. The physical registry already maps D5 to GPIO14, and no board dimensions, SVG scale or contacts were changed.

At HIGH, the existing illustrative model gives `(3.3 − 2) / (220 + 50) = 0.0048148148 A`, including 50 Ω GPIO drive resistance. That predicts brightness about 0.24074. Missing return, reversed LED or a grounded D5 never cause artificial illumination. A grounded D5 can retain a HIGH firmware latch while solved digitalRead returns LOW and the HTTP response is OFF; existing overcurrent warnings remain visible. Indeterminate reads error rather than reporting a made-up state.

Boot constraints remain tied to GPIO0/D3, GPIO2/D4 and GPIO15/D8. The solver now emits a boot-level warning only for a defined level contradicting the pin's requirement. It no longer emits generic informational boot diagnostics for an idle whole board. D5/GPIO14 has no boot selection warning. Other electrical diagnostics remain unchanged; warnings do not imply permanent damage.

## Unified Serial and simplified tools

The existing bottom console renders each board's actual Serial stream and configured baud rate. ESP's Serial mini-tab opens/focuses this monitor and explains its location; it creates no duplicate monitor. `Serial.begin`, print/println, bounded output and truncation remain the same adapters as UNO/DHT. Clear output preserves baud, firmware, connection, GPIO and errors. Auto-scroll follows new output when already near the bottom, preserving manual scroll-up. VM failures retain preceding emitted output while the located simulator diagnostic renders separately. Stop removes all streams; restart emits only what the sketch actually prints again.

Control IoT and its exclusive UI components/helpers/tests were removed. Shared virtual-network model, runtime and old saved network fields remain compatible. Old `iot` workspace preference selects Code; right-panel close/reopen, Escape, toolbar and editor close retain the selected remaining tab. The existing mobile Code-selection close behavior is retained.

ESP Inspector keeps Information and GPIO pins. It omits the advanced Connections/Simulation sections; GPIO controls/readings remain under GPIO pins. UNO and other components retain their existing Inspector behavior. Workspace wiring and component selection/rotation/duplication/removal are unchanged.

## Isolated HTML/CSS/JS preview

Opening the HTML section automatically requests `/` once the current running firmware has connected WiFi and started/polled its server. A saved `index.html` alone never enables it. Local classic scripts and CSS are loaded only through registered virtual GET routes. A failed or incorrectly typed resource produces an error rather than fabricated contents. Close removes the frame/Worker; reopening creates a fresh token. No external windows open.

Project HTML is parsed into an inert template, so resource-bearing nodes cannot fetch before sanitization. Sanitized passive HTML/CSS goes into an opaque-origin iframe with **only `sandbox="allow-scripts"`**. User JS executes in a dedicated Worker inside that frame, without real DOM/window/parent/Redux/application storage access. The frame contains only trusted renderer code. Worker source is supplied as structured data and a blob, never interpolated into executable application HTML. CSP blocks network connections, external script imports, images/media, embeds, object/base URLs and actual form navigation. Before any project script runs, native network constructors, importScripts, child/shared Workers, BroadcastChannel and storage capabilities are sealed on the global object and its accessible prototype chain. Native fetch entries are replaced with the same local-only virtual fetch, and navigator is reduced to a frozen language projection. Failure to seal a capability aborts bootstrap. CSP remains a second boundary; the implementation does not rely on CSP inheritance alone.

The supported facade exposes `document.documentElement.lang`, `querySelector/getElementById`, setting element `textContent`, and button `addEventListener('click', callback)` with a minimal event. It supplies local-only GET `fetch`, returning `status`, `ok`, asynchronous `text()` and `json()`. Reading DOM properties/textContent, full DOM APIs, modules, frameworks, dynamic script resources and privileged browser integrations are unsupported and fail visibly where called.

Simple GET forms with a fixed local action and local links are intercepted by trusted click/submit handlers **before native navigation**. Their actual virtual response is displayed as text in a frame-local output. No `allow-forms` permission is granted. Form-field encoding/query processing, POST, complex validation and scripted DOM form manipulation are not supported. External URLs/actions and active attributes are removed; forms/links cannot navigate to a real device. Project JavaScript should use the supported fetch facade for programmatic state updates.

Both sides validate the exact source window, expected origin (including opaque `null`), token and message shape. Parent requests accept only supported local paths, safe positive IDs, no replayed IDs and a bounded message count. The runtime separately validates the board's execution session and lifecycle. Board switching, Stop/Reset, disconnect, pause or leaving HTML invalidates/removes the old page; pending Worker fetches disappear with it. Old tokens or run identities cannot control a new execution. Diagnostics and errors have typed ES/EN application copy.

This is a limited web compatibility facade, not a complete browser DOM/JS platform or a browser-engine security audit. A project can exhaust its own Worker; closing/stopping disposes it without executing project code on the main thread. Exhaustive hostile-code resource-exhaustion testing, cross-browser/mobile-device coverage and reviewed screenshot baselines remain outside this validation.

## Changed files

- `src/firmware/{ast,lexer,parser,compiler,machine,errors,libraries,profile,ports}.ts`: existing interpreter, text/call/read capabilities. New `projectCompiler.ts`, `wifi.ts`, `http.ts`, `httpTypes.ts` and tests.
- `src/features/simulation/{firmwareRuntime,runtime,useSimulation,messages}.ts`, `BoardRuntimeMonitor.tsx`, `SimulationConsole.tsx`: run/resource snapshots, session checks, WiFi/HTTP/circuit orchestration and one clearable Serial monitor. New electrical/read/runtime integration tests.
- `src/features/tools/{CodeWorkspace,EspProjectEditor,EspWebPreview}.tsx`, `webPreviewDocument.ts`, `types.ts`, `preferences.ts`: preview and bridge, Serial shortcut, retired tab and preference compatibility. Exclusive IoT UI files removed: `IotWorkspace`, `IotConfiguration`, `IotHttpClient`, `VirtualDeviceStatus`, `virtualNetworkMessages`, `iotConfiguration`; their dedicated UI tests retired with that surface. Shared network domain tests remain.
- `src/features/components/{Inspector,SimulationProperties}.tsx`, `src/sim/gpio.ts`: ESP-only Inspector simplification and specific boot warnings.
- `src/model/{exampleProjects,espWebExample,espProjectFiles}.ts`, `examples/esp8266/web-led/*`: normal library project, eight real files, Spanish module navigation aliases. Typed ES/EN messages and `src/app/{App.tsx,styles.css}` provide integration and responsive frame styling.
- Existing tests updated only for changed controller contracts, deliberate scope/UI behavior and retired IoT navigation; assertions/timeouts were not weakened. Browser fixture seeding now excludes sandbox subframes instead of injecting application storage access into them. Existing unrelated uncommitted Phase 2A/interface work was retained.
- `tests/browser/{esp-web,esp-code,firmware-regressions,workspace,projects}.test.mjs` cover current behavior. Editor/design/browser documents link this current record.

## Validation and failed attempts

Node 22.23.4; installed/cached Chrome and Playwright, with approved execution outside the filesystem/socket sandbox. Final command results are recorded below after the remaining checks. No screenshot baseline is approved.

- Earlier linked-file-only increment: first parser run 52/53, fixed original-location unknown-function handling; then 53/53. Initial full run 527/530 due obsolete Phase 2A scope/category expectations; after deliberate expectation updates, 538/538 passed. Its later verify also completed before the user expanded the scope.
- Initial browser launch was blocked by sandboxing. The first five-case web run counted 0/5 as passing: the harness injected top-level sessionStorage setup into opaque subframes, and one assertion incorrectly counted trusted shell meta tags. Fixed fixture scope and sanitizer assertion scope without relaxing isolation or error capture; the next 11-case run passed.
- Expanded WiFi-focused run initially exposed four issues: resources omitted from a standalone VM test, a custom server fixture lacking the now-required WiFi begin, UNO accepting an ESP-only include, and an obsolete success expectation for an indeterminate reversed-LED read. Fixed resource input and UNO header gating; updated deliberate fixture requirements/physical-error expectations. The focused 51-case WiFi/firmware/UNO run passed.
- First expanded default-worker full run: 535/536, with a 5-second timeout in the existing ProjectLibrary panel test. No timeout changed. Final default and bounded-worker results are listed separately below.
- Expanded Chrome run: 15/16; the GET form failed because sandbox native submission was blocked before the submit listener. Fixed trusted submit-button interception without granting `allow-forms`; the focused form/Inspector run then passed 2/2.
- Selected regression run: 5/6; DHT, Serial failure output, desktop panel, UNO Blink and board context passed. Mobile panel test still assumed the retired IoT tab's behavior; adapted its setup to explicitly retain the existing mobile Code-selection close behavior. Final rerun is listed below.

- Final security probe before capability sealing: 23/24 browser cases passed. Native XMLHttpRequest produced request-attempt events even though no response was received. This was treated as an unacceptable exposed capability, not waved away as a CSP success. Native APIs/prototype entry points were then sealed before project code, with virtual fetch as the only network capability. The zero-external-request assertion was retained.
- An intermediate typecheck caught a test fixture assigning voltage to an unnarrowed component union. Added the correct discriminant guard; no assertion or compiler strictness was relaxed.

### Final validation scope

The final browser selection includes all six `esp-code` tests, all eleven `esp-web` tests, both dedicated firmware/Serial regressions, UNO saved Blink, code-board context, retired-IoT absence and both desktop/mobile split-panel cases. This is a 24-case focused Chrome selection, not the whole browser suite. The separate older DHT inspector/artwork-selector suite was not repaired or claimed passing; the actual DHT firmware path is exercised by the dedicated regression without changing its source or electrical expectations. No screenshot baselines were created or approved.

The final C++/DC integration checks include missing/cyclic/local includes and custom `.cpp` names; non-example route names/branches; globals and immutable previous state; route/resource failures; arbitrary/blank WiFi credentials, status/IP/disconnect/restart; independent boards; source/resource run snapshots; real Redux undo/redo and JSON recovery; clearable firmware Serial; stale run rejection; independently calculated LED current; disconnected/reversed/grounded circuit faults; external HIGH/LOW INPUT reads and refusal of floating reads. Existing Persist, UNO, DHT, LCD, physical pin and editor tests remain in the full unit suite.

Final code validation (after capability sealing and inert-template parsing):

| Check | Result |
| --- | --- |
| TypeScript | Passed with strict/noUncheckedIndexedAccess/exactOptionalPropertyTypes; production build includes another typecheck. |
| Full Vitest, final default `npm test` | **540/540 passed, 61 files**, 25.34 s, unchanged repository script and timeouts. |
| Full Vitest, `npm test -- --maxWorkers=2` | **540/540 passed, 61 files**, unchanged 5-second per-test limits. |
| Production, `npm run build` | **Passed**, 172 modules; final JS 585.18 kB / gzip 185.75 kB. Existing >500 kB chunk warning remains. No dependencies installed. |
| Focused Chrome/Playwright selection | **24/24 passed**, final source, 140.76 s. Includes ES/EN desktop/mobile, arbitrary credentials, blank/whitespace failures, actual CSS/JS and GPIO LED, forms, token replay, explicit native/prototype network blocking and inert external resource markup, unified Serial clear/failure output, DHT11, UNO Blink and remaining panel/board context. No real external request-attempt events were observed in the final isolation test. |
| `git diff --check` and browser-file syntax checks | Passed. |

Two preceding default-worker `npm run verify` runs passed all 540 tests and built. After the final inert-template change, the next verify passed TypeScript but stopped with **539/540**: the existing ProjectLibrary panel-retention test exceeded its unchanged 5-second timeout (5.177 s). The bounded-worker full run above passed that same test in 3.301 s, without changing its timeout/assertions or the repository test script. This remains a concurrency-sensitive validation concern, distinct from the passing browser functionality. A final idle default-worker rerun is recorded below.

To reproduce the final browser selection using the already-installed tools:

```bash
env MESA_PLAYWRIGHT_MODULE=/home/franco/.cache/ms-playwright-go/1.57.0/package/index.mjs \
  MESA_BROWSER_EXECUTABLE=/usr/bin/google-chrome \
  /home/franco/.nvm/versions/node/v22.23.4/bin/node --test --test-concurrency=1 \
  --test-name-pattern='ESP|empty emulated|preview sanitizes|actual DHT11|firmware-generated Serial|saved Blink runs|split-panel toggle|code retains automatic' \
  tests/browser/esp-web.test.mjs tests/browser/esp-code.test.mjs \
  tests/browser/firmware-regressions.test.mjs tests/browser/workspace.test.mjs tests/browser/projects.test.mjs
```

Final idle default-worker rerun: **`npm test` passed 540/540 across 61 files in 25.34 s** on the exact final source. The ProjectLibrary panel test passed in 4.269 s. This successful run does not erase the earlier intermittent default-worker timeouts; that stability concern remains recorded. TypeScript/build, the bounded-worker full suite and all 24 selected Chrome cases also passed. No source changes followed these checks.
