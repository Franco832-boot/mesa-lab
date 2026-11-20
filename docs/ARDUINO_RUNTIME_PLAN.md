# Arduino runtime audit and incremental implementation proposal

Audit date: 2026-11-06. Source baseline: `8c210ea`.

This document records inspected behavior and a proposed implementation sequence. It does not implement or claim support for additional language features or peripherals. Existing source, electrical models, UI, project formats and dependencies are unchanged by this proposal.

## Existing architecture to reuse

| Boundary | Current implementation | Reuse |
| --- | --- | --- |
| Project and source | `model/types.ts`, `model/programFiles.ts`, project commands/history, Redux Persist | Keep `ProjectState.document` authoritative. Programs and files are saved project data; execution is transient. |
| Source execution | `firmware/uno.ts` | Preserve the public compilation/execution entry points and existing sketch behavior while replacing internals in validated increments. Despite its filename, it supports both boards. |
| Runtime integration | `features/simulation/firmwareRuntime.ts`, `runtime.ts` | Preserve board targeting, error isolation, GPIO release, pause/resume/stop/reset and electrical document reconciliation. |
| Browser scheduling | `features/simulation/useSimulation.ts` | Replace only scheduling/transport as needed. Currently a timeout advances by the next requested delay, independently of actual browser elapsed time. |
| Circuit evaluation | `sim/engine.ts`, `topology.ts`, `models.ts`, `dc.ts`, `linear.ts` | Reuse pure `evaluateCircuit(project, inputs)`, physical contacts, connectivity, driver loading and conditions. |
| GPIO and readings | `sim/gpio.ts`, `inputs.ts`, `types.ts` | Reuse canonical pins, aliases, voltage references, logic thresholds and electrical diagnostics. |
| Interactive components | Button/potentiometer simulation inputs and existing controls | Read their electrically solved effects; do not add a parallel input model inside the interpreter. |
| Rendering | Existing SVG components and simulation console | Continue rendering calculated brightness, conditions and typed ES/EN errors. No electrical calculations in React. |

`App.tsx` starts saved programs on Start from the stopped state, matching by board ID and selecting `main.ino` by filename. Resume does not rerun setup. Other saved files are editable but are not compiled or linked. Preserve this behavior in the first increments.

`BoardProgram.execution: 'unavailable'` is still required by the saved v1 contract even though restricted execution exists. It must not be repurposed as transient runtime status. `FirmwareRuntime` in `sim/types.ts` is an unused future binary-runtime interface, not the existing source interpreter.

## Verified scope from source inspection

The current compiler uses a lexical tokenizer and a small hand-written grammar to produce three typed instruction variants. Regular expressions recognize lexical tokens; it is not just a search for function names. However, it has no general expression/statement AST, symbol scopes or call stack.

| Requested feature | Current status |
| --- | --- |
| `setup()` / `loop()` | Executed; both zero-argument `void` functions are required. |
| Line/block comments | Supported, including rejection of unterminated block comments. |
| Constants | Only predefined pin/mode/level symbols and unsigned decimal literal arguments; no declarations or expression evaluation. |
| `pinMode()` | `INPUT` / `OUTPUT`; no source-level `INPUT_PULLUP`, although the electrical engine models pull-ups with board restrictions. |
| `digitalWrite()` | Drives shared electrical inputs; currently requires a prior OUTPUT mode. |
| `delay()` | Suspends that board using integer virtual milliseconds. |
| Types, variables, operators and expressions | Missing, including compound assignment and increment/decrement. |
| Conditionals, switch and loops | Missing. Repetition exists only through the implicit Arduino `loop()` lifecycle. |
| User functions, arrays and structs | Missing. |
| `digitalRead()` / `analogRead()` / `analogWrite()` | Missing from execution. Digital solved readings already exist; ADC and PWM models do not. |
| `millis()` / `micros()` / `delayMicroseconds()` | Missing; an internal virtual millisecond counter already exists. |
| `map`, `constrain`, `min`, `max`, `abs`, random APIs | Missing. |
| Serial APIs and input/output buffers | Missing. The diagnostics console is not a serial monitor. |
| Worker isolation | Missing; the bounded interpreter currently runs on the UI thread. No `eval()` or `new Function()` in the inspected execution/electrical code. |

Current bounds are 32,768 source code units, 512 compiled calls, 4,096 steps per advance and a maximum individual delay of 86,400,000 ms. The editor separately permits up to 500,000 source code units across 40 files. Keep storage and execution limits distinct and explain execution errors clearly.

Existing interpreter tests cover exact Blink boundaries, independent UNO/ESP execution, chunk-invariant timing, pin mapping, output latches, comments, invalid syntax and bounds. Integration tests verify source-driven LED current, reversed/disconnected LEDs, interacting boards, pause/reset, and release of failed outputs without affecting other boards.

## Architectural changes required

### Parser and resumable interpreter

Build a lexer with source spans, a recursive-descent statement parser and a precedence-aware expression parser. Produce a discriminated-union AST. Limit source size, tokens, AST nodes, nesting, memory, array length, call depth and work per slice. Parser recursion must be bounded as well as execution.

Use explicit execution frames/continuations rather than recursive JavaScript execution of user loops/functions. Suspension must preserve lexical scopes, expression progress, function arguments/return values and loop state. A delay inside a user function or nested loop must resume at the correct instruction without replaying preceding side effects. Short-circuit logical operators and prefix/postfix mutations need explicit semantics and tests.

Define numeric conversions and arithmetic per board profile; do not silently use JavaScript number semantics for every C++ type. Include integer division, unsigned 32-bit wraparound, character representation, float/double precision and diagnosed invalid arithmetic. Signed overflow and other unsupported undefined behavior should produce a documented error rather than an invented hardware result. Introduce only the bounded C++ subset needed by each milestone; reject unsupported constructs with source locations.

Built-ins should use typed descriptors for signatures, board capabilities and effects. This creates an extension point for future functions/libraries without implementing arbitrary headers, templates, pointers, classes, heap allocation or native C++ execution now.

### Virtual time and cooperative scheduling

Use an injected monotonic virtual clock expressed in integer microseconds. Expose `micros()` and `millis()` as unsigned 32-bit values derived from it. Keep the internal clock monotonic across API counter rollover; reset starts each board's clock and PRNG state deterministically. A newly started board may have its own reset epoch on a shared circuit timeline.

Current execution advances time only through waits. Consequently `void loop(){}` and `delay(0)` hit `step-limit`, and a polling sketch cannot observe time progressing. Replace that assumption before enabling `millis()` examples. Document a deterministic execution-cost/time-quantum policy so busy code consumes virtual time even without delay; this is a simulation abstraction, not CPU cycle accuracy. Host timer latency must not determine program semantics.

Distinguish a normal cooperative yield from resource exhaustion. An ordinary fast `loop()` must remain runnable rather than fail for lacking a delay. Infinite `while`/`for` loops must also yield so Stop can be processed. Bound each slice, output volume and catch-up work; a watchdog may diagnose sustained excessive work using an explicit policy. `delay` and `delayMicroseconds` suspend the calling board, while circuit input events, other boards and PWM continue. Pause freezes virtual time; resume preserves state.

### Electrical input/output synchronization

The current adapter gathers timestamped output events, advances boards independently and solves only after applying the batch's final GPIO values. This works for the supported output-only sketches, but is insufficient for reads that depend on writes earlier in the same interval or on another board.

Introduce a deterministic coordinator for board execution, input events and PWM edges on a shared timeline. Commit pending writes and evaluate the electrical model before any dependent read. Define stable ordering for simultaneous events across boards; do not promise physical concurrency or instruction-cycle accuracy. Cache only between electrically unchanged states, and keep performance/event bounds visible.

`digitalRead` must use solved `PinResult.logic`, including load-induced voltage changes and board-specific thresholds, rather than the last output latch. FLOATING, UNDEFINED, overvoltage and unresolved circuits require an explicit diagnostic policy; do not invent a digital or ADC reading. ADC conversion must use voltage relative to the target board's GND, with a valid reference, channel mapping, reference voltage, quantization and range diagnostics.

PWM requires a transient peripheral state with duty, frequency and phase, not just the current `GpioState` logic level. Schedule HIGH/LOW driver states through the existing solver, retain peak current/voltage diagnostics and derive display brightness from time-integrated solved LED current. Do not replace PWM with a DC voltage equal to supply times duty: LED conduction and fault behavior are nonlinear. Optimize only after validating an equivalent result, including multiple PWM sources and input reads. Explicitly bound event rates and unsupported networks.

### Worker and state boundaries

Keep firmware and electrical domain code independent of React, Redux and browser globals. Put Worker construction, timers and message transport in a separate adapter. A coordinated simulation Worker can own a read-only project snapshot, transient VM/peripheral state and electrical evaluation; the snapshot is derived from the authoritative Redux document and is never independently editable.

Use typed messages with run IDs, project revisions and ordered input events. Ignore responses from stopped/replaced runs, bound message/output queues, and handle worker errors. Stop must terminate/reset execution and release only the intended outputs; circuit Stop/Reset clears all transient execution. Preserve unrelated boards, manual GPIO and virtual HTTP behavior according to explicit shared-GPIO arbitration rules. Establish deterministic ownership when manual controls, HTTP and firmware address the same pin, including cancellation of an active PWM peripheral on ownership changes.

### Board profiles

Reuse `model/components.ts` physical pins and `gpioPins`; do not create another SVG/contact registry. Add execution/peripheral capability metadata keyed by those canonical pins.

- UNO: preserve 5 V logic, A0–A5 digital aliases and existing driver/threshold limits. Default ADC support targets six 10-bit channels. PWM output targets pins 3, 5, 6, 9, 10 and 11 with the core's 8-bit duty range. Unsupported timer/peripheral features remain diagnosed.
- ESP8266: preserve NodeMCU D-label versus numeric GPIO mapping, 3.3 V logic, reserved flash pins and GPIO16 pull-mode restrictions. It has one external ADC channel; the bare chip ADC's 0–1.0 V range must not be confused with a development board's divided A0 input. The exact represented NodeMCU variant/divider needs a documented choice and electrical model before ADC is enabled.
- Pin the target ESP8266 Arduino Core compatibility version. Version 3.1.2 documents software PWM on GPIO0–16, a default 0–255 duty range and 1 kHz frequency; defaults before 3.0 used 0–1023. Limit support to usable exposed pins from the Los Profes Para Vos board registry, rather than enabling reserved flash pins because they fall in a numerical interval.

References: [UNO R3](https://docs.arduino.cc/hardware/uno-rev3/), [Arduino PWM pins and range](https://support.arduino.cc/hc/en-us/articles/9350537961500-Use-PWM-output-with-Arduino), [UNO ADC resolution and default reference](https://docs.arduino.cc/retired/boards/arduino-uno-rev3-with-long-pins/), [ESP8266 Core 3.1.2 I/O and timing](https://arduino-esp8266.readthedocs.io/en/3.1.2/reference.html).

## Sequential implementation milestones

Each milestone must pass its relevant unit/electrical/integration tests, TypeScript and production build before the next begins. Browser acceptance is required for changed execution controls, workers and interactive behavior. Reuse the engineering responsibilities in `AGENT_ROLES.md` as review checklists.

| Milestone | Deliverable | Acceptance gate |
| --- | --- | --- |
| 0. Baseline | Record existing failures; separately repair test prerequisites and confirmed regressions without changing intended editor behavior. | A trustworthy full-suite baseline and browser results. |
| 1. Foundation | Lexer, AST, profiles and resumable VM for the existing subset; source-span diagnostics; explicit resource limits. Keep current entry points or compatibility adapters. | Existing Blink and electrical integration tests retain behavior, including exact delay boundaries and board isolation. No expanded-language claim yet. |
| 2. Types, expressions and clock | `int`, `bool`, `unsigned long`, `const`, arithmetic/comparison/logical expressions, assignments, `++`, `--`, `+=`, `-=`, `if`/`else if`/`else`; microsecond clock and all four timing APIs. Worker transport and cooperative scheduler before exposing unbounded control flow. | Blink with delay and two independent tasks using `millis`; unsigned rollover; equivalent event traces for different host chunks; responsive Stop during busy execution; pause/reset and stale-worker-response checks. |
| 3. Connectivity and digital inputs | Coordinator read/write barriers, `digitalRead`, profile-validated `INPUT_PULLUP`; `for`, `while`, `do while`, `break`, `continue`. | Button-driven LED through actual resistor/contact wiring; sequential LEDs via for; nested-loop delays; one board reads another board's output during the same advance; infinite loops cannot block controls. |
| 4. Analog and PWM models | ADC channels/reference handling, transient PWM peripheral, sampled readings, integrated brightness; `float`, `double`, `char`, `map`, `constrain`, `min`, `max`, `abs`. | Potentiometer→ADC→PWM LED at endpoints and intermediate settings; loaded wiper, missing GND, overvoltage and invalid-pin checks; peak fault diagnostics preserved at low duty. |
| 5. Functions and Serial | Typed user functions, parameters, local scopes and return; strings needed for print; `Serial.begin/print/println/available/read`; `random/randomSeed`. | Delays inside functions resume correctly; call-depth guard; per-board bounded RX/TX buffers, empty read = -1, formatting and RX injection; deterministic seeded random/reset. Serial is explicitly a virtual monitor until UART electrical timing is modeled. |
| 6. Aggregate/control extensions | Bounded fixed-size arrays, indexing, simple structs/member access and `switch` with fallthrough/break; document the exact grammar and value-copy rules. | Bounds/type errors, initialization, scope, switch execution and memory limits; fixtures remain compatible. Pointers, dynamic allocation and general C++ libraries remain unsupported. |
| 7. UI, conditions and release QA | Finish source-located ES/EN diagnostics, serial controls, accessible execution state, reduced-motion behavior and documentation. Integrate messages alongside each earlier milestone as necessary. | Full regression suite/build, actual browser scenarios, unchanged project serialization/history, deterministic reset and documented limits. No milestone completion based solely on recognizing an API name. |

Recommended first implementation scope: milestones 0–2 as separately validated increments. This makes Blink without delay a real executable feature before adding peripheral breadth. Then implement the electrically connected button/for examples, followed by ADC/PWM. No full-C++ compiler or CPU emulator is required for this bounded subset.

## Independent validation matrix

Maintain five executable sketch fixtures as support arrives: Blink with delay, Blink with millis, button-controlled LED, potentiometer-controlled PWM LED, and LED sequence with for. Each needs parser/VM assertions and a connected-circuit integration assertion; UI playback alone is insufficient.

- Existing UNO LED fixture: red LED drop 2 V, resistor 330 ohms, driver 40 ohms. HIGH current is `(5 - 2) / (330 + 40) = 8.108108... mA`; LOW is off. An unwired or reversed LED must remain off regardless of firmware latch state.
- Existing ESP equivalent: `(3.3 - 2) / (330 + 50) = 3.421052... mA`. Test numeric GPIO and NodeMCU labels independently.
- PWM in this supported resistive LED circuit: HIGH-state current remains 8.108108... mA; mean current at 50% duty is 4.054054... mA. Retain instantaneous current warnings rather than comparing only mean current. Verify 0%/100%, partial periods and phase across pause/resume.
- ADC: compute expected voltages from divider resistances and loading before quantization. Test endpoints, interior bin boundaries and missing board reference. Do not derive the oracle by calling the same production conversion helper.
- Timing: compare ordered events at delay boundaries, nested calls, zero delay, busy loops, counter rollover and multiple chunk partitions. GPIO reads must observe preceding writes at the specified shared-timeline position.
- Safety/lifecycle: nesting and recursion limits, oversized arrays, invalid arithmetic, output floods, input queue bounds, cancellation, worker replacement, persisted data exclusion and unaffected neighboring boards.

## Baseline validation record

Executed with Node 22.23.4 on 2026-11-06, before implementation:

- `npm run typecheck`: passed.
- `npm run build`: passed (122 transformed modules).
- `npm test`: failed; 317 tests passed and one failed across 318 executed tests. Forty files passed, one file failed, and another file could not initialize. `ContextualInspector.test.ts:37` expects an initially rendered `code-editor-pane` that is absent. `Application.mount.test.ts` cannot initialize its declared jsdom environment because the package is not installed or declared in `package.json`. These are baseline findings, not changes introduced by this proposal.
- Browser command in the sandbox: failed to launch all three test files, zero passed. Approved execution outside the sandbox successfully launched Chromium: **34 passed, 5 failed, 1 skipped**, 40 cases in approximately 205 seconds. The skipped case is optional screenshot comparison; screenshots remain unreviewed. The existing saved-Blink browser case passed, including pause/resume/stop. This supersedes older claims that browser execution is entirely unavailable in this environment.

The browser command used was:

```bash
PATH=/home/franco/.nvm/versions/node/v22.23.4/bin:$PATH \
MESA_PLAYWRIGHT_MODULE=/home/franco/.cache/ms-playwright-go/1.57.0/package/index.mjs \
MESA_BROWSER_EXECUTABLE=/usr/bin/google-chrome \
npm run test:browser
```

Browser failures are recorded as observed symptoms, not established root causes:

| Existing case | Observed failure |
| --- | --- |
| Native touch knob rotation, `interactions.test.mjs:291` | Chromium rejected a touch event: `Must send a TouchStart first to start a new touch`, at line 308. |
| Manual GPIO lifecycle, `mesa.test.mjs:161` | The GPIO16/D0 INPUT_PULLUP option was not disabled as expected, at line 171. Earlier LED HIGH behavior passed before this assertion. |
| Board ID/main.ino selection, `workspace.test.mjs:125` | Timed out waiting for ESP LED HIGH at line 146, after advancing the fake clock through the multi-board Blink schedule. The initial output and no-error assertions passed; file targeting itself was not proven to be the failure. |
| Shared board context/source, `workspace.test.mjs:379` | Timed out finding `board-selector` within the code panel, at line 384. |
| Virtual HTTP lifecycle, `workspace.test.mjs:516` | Timed out finding `board-selector` within the code panel, at line 566. |

Existing README, architecture/simulation documents, some UI descriptions and the future binary-runtime comment still say firmware execution is unavailable. They conflict with the inspected restricted source interpreter. Update the relevant current-scope descriptions with each delivered milestone; retain historical reports as historical evidence. Do not use these stale descriptions as proof that no execution engine exists.
