# Browser and visual verification

## Status in this implementation environment

2026-11-07 update: focused checks can execute with approved execution outside the restricted sandbox. The ESP8266 Phase 2A editor suite passed 6/6 Chrome cases, and the existing UNO Blink browser regression passed 1/1. See [the exact scope and failed/repeated validations](ESP8266_EDITOR_PHASE2A.md). The full browser suite and screenshot baselines have not been validated. The restrictions described below refer to the earlier sandbox attempts, not to these later approved focused runs.

Browser checks are authored but cannot execute here. Node child-process execution is also restricted (`spawnSync ... EPERM`), so the standard Node test worker may fail before running its setup hook. Vite cannot bind a loopback port (`listen EPERM`); independently launching installed Chrome through cached Playwright exits with `SIGTRAP` after crashpad reports `setsockopt: Operation not permitted`. These are failed environment validations, not passing browser tests. No screenshots have been reviewed or approved. Numerical, state integration and server-rendered SVG tests do not substitute for browser, touch or responsive verification.

## Runner

`npm run test:browser` uses Node's test runner and the Playwright browser API. It does not require `@playwright/test`. Use Node 22.12+ from the repository root. On a permissive host, install the optional browser tool without changing the tracked dependency contract:

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:browser
```

The harness starts the local Vite binary using the current Node executable on `127.0.0.1:4173`. A server startup error, missing Playwright module, browser launch error, missing application or test failure exits nonzero. Browser unavailability is never treated as a passing skip.

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `MESA_BASE_URL` | Existing application URL; skips starting a local Vite process. |
| `MESA_PLAYWRIGHT_MODULE` | Importable Playwright or playwright-core module, including an absolute `index.mjs` path. |
| `MESA_BROWSER_EXECUTABLE` | Explicit compatible Chromium/Chrome executable. |
| `MESA_SCREENSHOTS=1` | Enables comparisons against manually reviewed PNG baselines. |

This environment has a cached Playwright core module and Chrome. The current project command fails at Node worker startup before reaching a browser. A direct-file diagnostic also fails during Vite child-process startup:

```bash
PATH=/home/franco/.nvm/versions/node/v22.23.4/bin:$PATH \
MESA_PLAYWRIGHT_MODULE=/home/franco/.cache/ms-playwright-go/1.57.0/package/index.mjs \
MESA_BROWSER_EXECUTABLE=/usr/bin/google-chrome \
npm run test:browser
```

Latest full command attempt (Node 22, 2026-11-05): exit **1**, **0 passed**, **3 failed file launches**, **0 skipped**. The three files were `interactions.test.mjs`, `mesa.test.mjs` and `workspace.test.mjs`; Node reported `testCodeFailure`/`ERR_TEST_FAILURE` before executing browser cases. These are environment launch failures, not three executed application assertions.

Running `node tests/browser/workspace.test.mjs` directly reached setup and reported nine `hookFailed` cases, zero passes, with `Vite exited (1). No process output captured; check child-process execution and socket permissions.` Earlier independent probes established child-process `EPERM`, Vite `listen EPERM` and Chrome crashpad `setsockopt: Operation not permitted`/`SIGTRAP`. No browser interaction or screenshot baseline was validated.

To select a flow, invoke the runner directly; Node options precede filenames:

```bash
node --test --test-concurrency=1 --test-name-pattern='manual GPIO' tests/browser/mesa.test.mjs
```

## Functional coverage

The tests use stable simulation/library/terminal/GPIO selectors, SVG component references, semantic labels and literal public-format fixtures. Each browser context starts with isolated local storage. Fixtures seed a public v1 project; all subsequent edits and simulation changes use UI controls. Tests do not access Redux internals or inject calculated results.

- Add source, resistor and LED from the library; move by keyboard, rotate, edit resistance and connect exact physical terminals through the inspector.
- Zoom and pan by pointer; preserve component properties and real wire references through save/reload.
- Start/pause/resume/stop/reset, actual LED brightness, structural editing lock and calculated-condition rendering.
- Reversed LED, missing return wire and unsupported ideal LED/source circuit diagnostics.
- Pushbutton pointer hold/release, inspector keyboard hold/release, SVG keyboard interaction, and panning over a simulated button without pressing its contact.
- ESP8266 GPIO mode, HIGH/LOW/high impedance, paused controls, GPIO16 pull-up restriction, incompatible voltage and cleared runtime overrides after stop/reload.
- Resistor overload condition, warning indicator and reset.
- English/Spanish interfaces and language switching at 1440, 390 and 320 CSS pixels, positive workbench dimensions, horizontal overflow and reduced-motion LED transitions.
- Uncaught page errors fail each fixture's test.

These checks remain unexecuted in this sandbox. The focused interaction file also authors native library drag/drop and Chromium touch knob rotation. Pinch zoom, physical-device accessibility and broad cross-browser coverage still need additional automated or manual checks; every authored browser flow still requires execution on a permissive host.

## Screenshot review policy

Screenshot comparisons are optional and are not enabled by default. No approved baselines are supplied because a working browser environment is unavailable.

```bash
MESA_SCREENSHOTS=1 npm run test:browser
```

A missing baseline writes only a candidate to `test-results/browser/<name>.candidate.png` and fails. A mismatch also writes a candidate and fails. The runner never creates, updates or approves files under `tests/browser/baselines/`. Review each candidate visually in the target browser environment before a human explicitly copies an accepted image to the corresponding baseline path. Re-run the comparison after that review.

Comparisons use exact PNG bytes and require the same browser version, OS/fonts, viewport and rendering environment. Contexts use a fixed device pixel ratio, reduced motion and deterministic fixtures. Desktop/mobile baselines cover the powered circuit layout; exact matching intentionally rejects environmental rendering changes rather than approving them silently.

## Focused interaction regressions

`tests/browser/interactions.test.mjs` adds actual mouse/library drag/drop and knob mouse/keyboard/native Chromium touch flows. It checks stored lead attachments, electrical response through BB contacts, invalid release, undo/redo, reload, moving mounted assemblies, rotation, and changed canvas zoom/pan. It also tests direct knob center dragging and prevents component shortcuts from affecting the knob. These cases are authored and syntax-checked, but remain unexecuted here because setup is blocked. See [the local procedure and root causes](INTERACTION_FIXES.md).

```bash
node --test --test-concurrency=1 tests/browser/interactions.test.mjs
```

## Unified workspace and virtual HTTP regressions

`tests/browser/workspace.test.mjs` authors nine cases for the unified sidebar and shared board tools. Browser execution remains unavailable; these are test definitions, not passing browser evidence.

- Keyboard tab navigation, keyboard width limits, per-tool saved widths, collapse/reopen and focus restoration. The workbench, component and wire DOM nodes must retain identity; circuit zoom and wire routes must remain unchanged.
- Automatic Arduino/ESP8266 context from canvas selection, explicit shared Code/IoT board selection, and retained context when selecting a passive component. Each board keeps its own source through switching and reload; editor keys cannot rotate the selected circuit part.
- Running and paused electrical results persist across tool switches and program storage changes. Stored code remains explicitly unavailable for firmware execution.
- SVG DOM order is background/breadboards, wires, physical components, then overlays. Electrical diagnostic cards expose guidance and navigate to the related circuit selection without replacing the desk.
- Four desktop/mobile language cases cover English and Spanish at 1440 and 390 CSS pixels: tab roles, labels, selected states, control relationships, focus restoration, mobile expansion and horizontal overflow. Element hit tests require the Messages toggle to remain unobscured before and after mobile expansion and retain a visible circuit strip above the sheet.
- One end-to-end virtual HTTP flow starts with two independent ESP8266 D1→resistor→LED circuits. Only explicit example installation adds the routes. Requests use the connected board's assigned virtual IP; a mismatched expected board produces HTTP 409 and lights neither LED. A valid HTTP 200 changes GPIO through the electrical engine, with independently expected brightness from `(3.3 - 2) / (330 + 50) / 0.02`. Device sessions and histories remain separate, code editing retains the session, a paused request does not change GPIO, and stop/reload clears runtime state while preserving network configuration. The browser must make no real request to the virtual address range.

```bash
node --test --test-concurrency=1 tests/browser/workspace.test.mjs
```

No workspace screenshots or approved baselines were created. Native panel sizing, responsive layout, focus behavior and visual layering remain pending real-browser validation despite the authored assertions.

## ESP8266 Phase 2B (current behavior)

The earlier IoT-panel scenarios above are historical: Control IoT and its exclusive UI are retired. Current requests originate in firmware-backed HTML, and old UI preferences for `iot` select Code. Shared network-domain tests and saved network metadata remain compatible.

`esp-web.test.mjs` covers the complete ordinary library project: arbitrary SSID/password edits, real emulated connection and actual firmware Serial, named C++ routes, served CSS/JS, solver-calculated D5 LED brightness, OFF, pause/stop/restart, save/reload, ES/EN at 1440/390 pixels, close/reopen, stale page-token rejection, missing credentials, server-not-started gating, local GET forms/links and the simplified ESP Inspector. Its isolation probe attempts external fetch via the Worker prototype, native XMLHttpRequest and resource-bearing markup, while requiring zero external request-attempt events. Native capabilities are sealed before project code; CSP is an additional boundary.

`esp-code.test.mjs` retains file CRUD, board isolation, keyboard navigation, persistence and undo/redo coverage. Its Serial mini-tab now opens the one bottom monitor; it checks per-board clear and Stop instead of expecting an inline duplicate. Fixture storage initialization runs only in the top-level application window so the harness does not access sessionStorage inside sandbox frames.

`firmware-regressions.test.mjs` reads the actual wired DHT11 sketch and verifies bottom-monitor output, clear/continued readings and Stop. It also verifies that preceding firmware Serial survives an invalid disconnected localIP call while the simulator diagnostic remains separate. Selected workspace/project regressions cover source-driven UNO Blink, board context and desktop/mobile panel tab retention without IoT.

See [Phase 2B architecture and executed results](ESP8266_PHASE2B.md) for final counts, failures and limitations. Full cross-browser coverage, physical-device interaction and screenshot-baseline approval are not implied by these focused Chrome checks.
