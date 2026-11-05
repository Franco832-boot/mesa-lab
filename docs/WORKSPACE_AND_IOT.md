# Unified workspace and virtual ESP8266

## Workspace ownership

The circuit remains mounted in `App` independently of the selected tool. `ToolSidebar` retains Components, Code and IoT panels, using `hidden` for inactive content. The existing editing toolbar and bottom Messages panel belong to the circuit workspace. Selecting a component opens its contextual inspector without selecting a sidebar tab. The inspector is a stage sibling, so its pointer events cannot initiate canvas gestures; its enclosing overlay has no pointer hit area. Desktop placement uses rotated, zoomed component bounds and scores nearby obstacles. Mobile tools and inspector use mutually exclusive bottom sheets, with explicit close and Escape support.

`useWorkspaceTools` stores only presentation preferences at `mesa.workspace.preferences.v1`: open state, selected tab and separate widths. A missing or invalid preference opens Components by default. The captured divider supports pointer dragging and keyboard arrows/Home/End; Escape cancels a pending resize. The maximum width preserves the majority of the screen for the circuit. Panel expansion is available without adding another navigation bar. The mobile sheet does not introduce horizontal scrolling.

`useBoardContext` keeps transient IDs separately from ordinary selection. The latest canvas board selection or manual selector chooses the shared Code/IoT target. Non-board selection and deselection retain that target. Removed boards fall back to recent surviving boards, then the first available board. Imports/reset start a fresh context. Duplicate board types use an ordinal and component ID for identification. No board is inferred from an arbitrary request URL.

Source text is stored per board in the existing `project.programs`, through validated editor commands and history. The code panel edits Arduino C++ text only; firmware compilation/execution is unavailable. Code edits preserve the electrical document references and running simulation. The Redux document remains the only editable project.

## Electrical presentation

The actual SVG DOM order is background/breadboards, wires, component bodies, then selection, terminal and direct-control overlays. SVG group order determines painting; CSS z-index does not establish this layering. Wire endpoints still use the common physical pin registry. Warning glyphs are overlays and do not capture pointer events.

Diagnostics are grouped only when severity, code and affected IDs match. Errors precede warnings and informational messages. Each card presents engine evidence, a qualified explanation and suggested checks; technical code/pin IDs remain expandable. Location buttons select known affected components, center the existing viewport and highlight related wiring. This presentation does not infer physical causes or permanent damage beyond engine evidence.

## Virtual HTTP contract

[The local OpenAPI contract](virtual-http.openapi.json) describes the opt-in example and transport constraints. It is a simulator interface: no network sockets, external servers, internet requests, Arduino C++ execution or user JavaScript are involved. The HTML-control area is an extension placeholder, not an executable preview. Future previews require a sandboxed message boundary that delegates requests to this device-targeted interface.

See the validation section below for the executed scope. Server-rendered and pure tests cannot establish actual pointer, focus, mobile or visual behavior.

## Virtual networking and electrical execution

`model/virtualNetwork.ts` validates the optional ESP8266 `properties.virtualNetwork` extension: SSID and up to 20 exact method/path routes. Accepted methods are GET, POST, PUT, PATCH and DELETE. Routes return configured text/status (200–599), optionally setting one digital GPIO HIGH/LOW on a 2xx response. Paths are literal ASCII paths up to 200 characters; no wildcard, parameters, query or fragment interpretation exists. Bodies are at most 4096 characters and SSIDs at most 32. Existing v1 files without this extension still load. Configuration and source text participate in undo/redo and project import/export. Older application versions cannot retain the new configuration extension when saving it again.

`sim/network.ts` implements deterministic synchronous virtual sessions, allocating the lowest free address in `192.0.2.1`–`192.0.2.254`. No connection timers or real WiFi behavior are modeled. A configured SSID is an identifier, not credentials for a real access point. Device IDs, not board type or visual proximity, own sessions. Histories retain the last 50 exchanges per device with a monotonically increasing sequence, never wall-clock time. Devices with no configuration cannot connect; configured empty route lists support no endpoints.

A request supplies an expected component ID, method, absolute virtual URL and optional inert text body. URLs are bounded to 256 characters and accept only `http://192.0.2.N/path`. Ports, credentials, HTTPS, external addresses, queries, fragments and relative URLs are explicitly unsupported. Routing checks the expected device and its current address together; an old or another device's IP never silently changes the target. Failures return 400 (invalid request), 404 (missing device/route), 405 (wrong method), 409 (not running or target mismatch), or 503 (disconnected/address exhaustion). Configured application responses may use other 200–599 statuses.

`features/simulation/runtime.ts` owns the atomic transition:

```text
virtual HTTP → targeted connected ESP8266 → validated GPIO proposal
→ existing GPIO input transition → evaluateCircuit → snapshot → SVG
```

A successful response reports the configured action, not whether an LED is illuminated. A missing return, reversed LED or other invalid electrical path remains subject to the same solver and diagnostics as manual GPIO. The existing illustrative ESP GPIO driver has 50 Ω resistance; with a red LED (2 V) and 330 Ω resistor, expected current is `(3.3 − 2) / (330 + 50) = 3.421 mA`.

Connect/disconnect is available before Start and during pause. Requests require running simulation; paused/stopped attempts return a logged 409 without changing GPIO or the frozen snapshot. Disconnecting WiFi retains the last GPIO drive, since loss of network connectivity does not imply removing power. Changing a device's saved network configuration disconnects only that device and preserves its history, electrical readings and GPIO. Stop/Reset clears sessions, histories and all transient controls/results, retaining saved configuration/code. Connecting again may reuse a released address. Structural electrical changes and project import/reset epochs clear the runtime.

The React simulation adapter memoizes an electrical fingerprint from components, attachments and wire endpoints. Source text, network configuration, viewport, positions, rotation and visual wire metadata do not reset electrical results. Network configuration is reconciled independently. Runtime sessions, requests, response history, GPIO overrides and snapshots stay outside Redux Persist. No periodic dispatch or electrical animation clock is introduced.

## Local procedure and remaining verification

1. Import `examples/gpio-led.json`. Select the ESP8266 and open Code. Change the source, switch tools and verify the source and circuit stay present. Firmware remains unavailable.
2. In IoT, explicitly install the D1 LED example, then connect the virtual device. Confirm SSID/IP and choose configured `GET /led/on`. Start simulation and send. Expect HTTP 200, OUTPUT/HIGH on D1 and approximately 3.421 mA through the LED; `/led/off` should darken it.
3. Switch tabs, collapse/reopen and resize using pointer and keyboard. Confirm the viewport, wires, selection, history and simulation remain. Pause and send a request: expect 409 with unchanged electrical readings. Resume to continue.
4. Add a second ESP8266 while stopped. Select it and configure/connect it independently. A request addressed to the other board's IP must return target mismatch without changing either GPIO. Selecting a resistor must retain the active board. Remove the active board while stopped and check safe fallback.
5. Stop, reverse LED terminals and restart/reconnect. A successful HIGH request must leave the LED dark. Repeat with its return wire removed. Inspect the related electrical diagnostic and location action.
6. Save/reload: circuit, per-board code and virtual configuration should survive; simulation sessions/history should reset. Verify undo/redo while stopped, breadboard insertion and the direct potentiometer knob after using each tool.
7. At 1440, 390 and 320 CSS pixels in both locales, verify keyboard tabs, explicit close/Escape, bottom sheets, no horizontal overflow, and circuit controls above sheets. Review actual screen captures before approving any baseline.

The authored browser suite covers these workspace flows alongside the earlier drag/snapping and potentiometer regressions. Browser and screenshot acceptance remains a separate gate when sandbox execution is unavailable. Run instructions and screenshot review policy are in [BROWSER_TESTING.md](BROWSER_TESTING.md).

The OpenAPI syntax check passes with `postman spec lint docs/virtual-http.openapi.json --issueType=syntax`. Default governance lint requires a Postman login and was not available. Collection generation was inspected locally; standalone real-HTTP request artifacts were not retained because the simulator exposes no HTTP socket. The OpenAPI file is authoritative and its opt-in example/error behavior is checked against the pure dispatcher in Vitest. No cloud resources were created or published.

## Milestone and validation record

Milestones were gated in sequence; delegation stayed within the active milestone.

| Milestone | Implemented scope | Focused gate |
| --- | --- | --- |
| 1 | Always-mounted circuit, unified right tools, duplicate top navigation removed | TypeScript and 7 relevant tests passed |
| 2 | Persistent tabs/open/width preferences, pointer/keyboard resizing, mobile sheets | TypeScript and 14 relevant tests passed |
| 3 | Shared board context, MRU/removal lifecycle, independent saved source | TypeScript and 19 relevant tests passed |
| 4 | Actual SVG painting groups, localized diagnostic guidance and navigation | TypeScript and 14 relevant tests passed |
| 5 | Virtual WiFi/HTTP configuration, device targeting, GPIO/electrical integration and UI | TypeScript and combined 90-test focused suite passed |
| 6 | Full checks, contract validation, browser regressions and documentation | Automated non-browser checks passed; browser/visual acceptance remains blocked |

Final `npm run verify` under Node 22.23.4 passed TypeScript, **265 tests across 36 Vitest files**, and production build (114 modules; JavaScript 460.28 kB / 145.06 kB gzip). No dependencies were added. The full suite retains electrical, snapping, knob, recovery, persistence and history regressions. Runtime tests independently calculate LED current and prove that wrong-target requests cannot change another device; successful requests to an unwired or reversed LED leave it dark.

`npm run test:browser` exited 1 with **0 passed, 3 failed file launches, 0 skipped**. The sandbox prevented Node/browser test startup; a direct workspace run reached setup but failed all nine cases at Vite startup before entering a browser. Browser files pass syntax checking. No screenshot baseline was reviewed or approved. These failures do not establish a browser-level application failure or a browser-level pass. Actual resize/pointer/focus/touch behavior, responsive placement and visual correctness require the permissive-host procedure above.

Postman syntax lint passed; authenticated governance validation was unavailable. The installed CLI has no `status` command. No cloud operation or standalone HTTP transport was added. Separate commits could not be created because this checkout has no usable Git repository metadata.

## Changed file inventory

| Area | Created or changed files |
| --- | --- |
| Composition and appearance | `src/app/App.tsx`, `src/app/styles.css` |
| Tool surfaces | `src/features/tools/ToolSidebar.tsx`, `types.ts`, `preferences.ts`, `useWorkspaceTools.ts` and corresponding tests |
| Board/code context | `src/features/tools/boardContext.ts`, `useBoardContext.ts`, `BoardHeader.tsx`, `CodeWorkspace.tsx` and context/code tests; `src/features/project/boardPrograms.test.ts` |
| Virtual device UI | `src/features/tools/IotWorkspace.tsx`, `IotConfiguration.tsx`, `IotHttpClient.tsx`, `VirtualDeviceStatus.tsx`, `virtualNetworkMessages.ts`, `iotConfiguration.ts`, their tests and `virtualHttpContract.test.ts` |
| Project model and commands | `src/model/components.ts`, `types.ts`, `project.ts`, `editor.ts`, `virtualNetwork.ts`, `virtualNetwork.test.ts`; `src/features/project/useCircuitEditor.ts` |
| Runtime/domain | `src/sim/network.ts`, `network.test.ts`; `src/features/simulation/runtime.ts`, `useSimulation.ts`, `networkRuntime.test.ts` |
| SVG and diagnostics | `src/features/workspace/Workspace.tsx`, `Workspace.test.ts`; `src/features/simulation/DiagnosticsPanel.tsx`, `diagnostics.ts` and their tests |
| Existing component surfaces | `src/features/components/ComponentLibrary.tsx`, `Inspector.tsx`; contextual inspector presentation/placement and its tests; `WireInspector.tsx` header controls |
| Localization | `src/locales/es/messages.ts`, `src/locales/en/messages.ts` |
| Browser regression | `tests/browser/workspace.test.mjs`; warning-overlay selector in `tests/browser/mesa.test.mjs` |
| Documentation/contract | `README.md`, `docs/DESIGN_SYSTEM.md`, `architecture.md`, `simulation.md`, `BROWSER_TESTING.md`, `WORKSPACE_AND_IOT.md`, `virtual-http.openapi.json` |

Next steps are browser/manual acceptance and reviewed desktop/mobile screenshots. Firmware execution and isolated HTML previews remain separate future work; the pure request/controller boundary is ready for those adapters without replacing electrical models.
