# Phase 3 validation record

## Milestone A — Foundation

Audited the existing editor, pin/SVG definitions, Redux document/history, validation, storage and migrations. Added root standards, role responsibilities, existing design-system documentation and the initial audit. Baseline: TypeScript passed; 61 tests in 8 files passed; production build passed using Node 22.23.4.

## Milestone B — Connectivity

Reviewed `resolveTopology`, collision-safe pin keys, stable node roots, exact physical contact groups and invalid-reference diagnostics. Targeted topology suite: 9 tests passed; TypeScript passed. Source-dependent open/short diagnostics belong to the DC evaluation gate in C. BB830 rails are continuous according to this SVG; split rails are not a represented variant.

## Browser environment audit

Vite fails to listen on `127.0.0.1:5173` with `EPERM`. A cached Playwright 1.57.0 core package and `/usr/bin/google-chrome` exist, but a direct headless launch also fails (`setsockopt: Operation not permitted`, `SIGTRAP`). Therefore browser, touch, responsive and screenshot validation are not established by the unit tests. No screenshot baselines have been approved.

## Milestone C — DC solver

Reviewed framework-independent per-island modified nodal analysis, pivoted Gaussian elimination and a residual check. Targeted simulation suite: 26 tests passed (16 DC + 10 topology); TypeScript passed. Independent expectations include `(5 - 2)/330 A`, `5/1000 A`, `5/(1000+2000) A`, divider `10/3 V`, and `5²/10 = 2.5 W`. Added explicit ambiguity rejection for parallel ideal LEDs rather than arbitrarily assigning current. Invalid references, source shorts/conflicts, floating/open circuits, redundant ideal sources and unsupported direct-source LEDs produce diagnostics. Limits: 96 matrix unknowns and six LEDs per possible conductive island.

The independent B review found inherited dictionary properties could press a button whose imported ID was `__proto__`. Own-property lookup and a regression test corrected it. Lexical ordering avoids locale-dependent node ordering.

Post-gate independent C review identified two additional edge cases to resolve before the D gate: an ideal source exactly at LED forward voltage has indeterminate direct-LED current, and zero current alone is insufficient evidence of an open circuit. Regression tests must cover both; the original C gate does not establish their correctness.

## Milestone D — Interactive components

TypeScript and 42 simulation tests passed. Added NO/NC button continuity, three-terminal and loaded potentiometers (including exact 0/1 endpoints), board USB supply assumptions, finite GPIO drive, HIGH/LOW/high impedance/pull-ups, alias handling, input validation, common-reference logic readings, ESP voltage/boot warnings and current-rating warnings. GPIO16 pull-up is explicitly rejected. Both post-C review issues now have passing regressions: direct LED at exact forward voltage is unsupported, and valid zero-current closed paths are not open circuits.

## Milestone E — UI integration

TypeScript passed and all 110 tests across 13 files passed, including five lifecycle tests and two editor/engine/persistence integration tests. Added transient discrete runtime, Start/Pause/Resume/Stop/Reset, edit guards through commands/history/canvas/inspectors/import, manual GPIO, momentary buttons, live wiper, calculated readings and typed ES/EN diagnostics. Pause freezes readings and releases momentary contacts for resume; Stop/Reset clear all overrides/results without editing the document. Added mobile control layout and stable test selectors. These checks establish state/domain and type behavior; interactive browser behavior remains unverified due to the environment.

## Milestone F — Conditions and presentation

TypeScript and three server-rendered artwork tests passed, alongside lifecycle tests. LED emission opacity is exclusively the engine's brightness; missing results remain dark, including a visually present but electrically dangling LED. Resistor tint and warning indicators render engine conditions; overload is reversible and no permanent damage or smoke is claimed. CSS disables animations/transitions under reduced motion. Production build passed. This establishes output wiring and markup, not actual browser pixels.

Cross-domain UI review caught a Pan-mode conflict over simulated buttons. Runtime pointer presses now leave Pan navigation in control; pointer release is consumed only when the SVG button owns capture. Structural edit guards, lifecycle, and data-reference semantics were reviewed separately. The represented split-rail test is not applicable because the physical SVG uses continuous rails.

## Milestone G — Final verification

Final command: `npm run verify` under Node 22.23.4. TypeScript passed; all **123 tests in 16 Vitest files passed**; Vite production build passed (91 modules; JavaScript approximately 385 kB / 123 kB gzip). The original 61 tests are retained. Browser harness files also pass Node syntax checking. No application dependencies were added.

Additional review tests enforce deterministic stacked-source references independent of document order, the 96-unknown / six-LED limits, and collision-safe imported IDs. A 12,000-pin evaluation budget prevents excessive topology allocation while preserving the ability to edit/serialize larger projects. Three importable example projects pass structural validation and independent electrical expectations.

`npm run test:browser` was attempted using the cached Playwright module and installed Chrome: exited nonzero before a usable test worker/browser. Direct `node tests/browser/mesa.test.mjs` confirmed setup failure while starting Vite: **0 browser tests passed**, 14 functional cases failed at setup, and one optional screenshot test was skipped. A direct Vite retry confirmed `listen EPERM` on loopback; the independent Chrome launch audit also failed. This is an environment block, not evidence of functional browser failures or passing browser coverage. No screenshot baseline was created or approved.

Milestones A–F are implemented and have passed their available code/domain/state gates. G's unit/type/build/documentation work is complete; browser, touch, responsive and visual acceptance remain pending. Full Phase 3 end-user acceptance is not claimed until those checks execute in a permissive browser environment. See `BROWSER_TESTING.md` and `PHASE3_REPORT.md`.
