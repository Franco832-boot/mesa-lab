# Simulation scope and firmware feasibility

## Current status

Phase 3 milestones A–F are implemented: the framework-independent electrical domain, transient simulation UI and result-driven condition visuals have passed their milestone gates. Milestone G TypeScript, 123 Vitest tests and production build pass; browser and visual verification remain pending and are recorded separately. The engine solves a limited set of DC circuits and returns explicit diagnostics for unsupported or indeterminate outcomes.

There is no sketch compilation pipeline, running firmware, physical WiFi connection or HTTP server. Manual GPIO controls are a simulation testing interface, not execution of Arduino or ESP8266 code.

## Four distinct capabilities

| Capability | What it can provide | What it does not establish |
| --- | --- | --- |
| Virtual GPIO | Inputs, outputs, HIGH/LOW and voltage checks within an electrical model | Actual microcontroller instructions |
| Virtual WiFi/HTTP | Simulated association, virtual addresses, requests/responses and deterministic failures | Physical radio, real TCP/IP or complete SDK compatibility |
| Limited interpreter | An explicitly documented subset of instructions and their effects | General C++, Arduino or compiled-binary compatibility |
| Firmware emulation | CPU instructions with supported peripherals | Complete peripheral fidelity, real time or radio behavior |

The electrical engine resolves networks and loads. A future firmware runtime produces and consumes GPIO states. A future network simulator produces virtual protocol events and requests. None should import React or Redux; integration uses typed data/functions outside reducers.

## Arduino UNO

[AVR8js](https://github.com/wokwi/avr8js) implements AVR emulation in TypeScript and can run in the browser or Node. It is an initial candidate for evaluating ATmega328P instructions. The emulator is not a sketch compiler: a compatible binary/HEX and a separate compilation strategy are required.

Options for Phase 5:

1. Import a HEX compiled using a known external toolchain and run small examples, checking GPIO, timers and limitations.
2. Evaluate an AVR toolchain in WebAssembly, measuring size, licenses, performance and compatibility before integration. None has been selected or tested.
3. Build an explicit interpreter for a subset such as `pinMode`, `digitalWrite` and `delay`; unsupported constructs must be rejected. Do not use `eval` or describe it as compiled C++.

The [official UNO Rev3 specifications](https://docs.arduino.cc/hardware/uno-rev3/) identify the ATmega328P and its features; the [Arduino product page](https://store.arduino.cc/products/arduino-uno-rev3) specifies 5 V operation and 16 MHz. The initial electrical model is DC/logic, not a reproduction of whole-board consumption, regulation or noise.

The [official UNO Rev3 pinout](https://content.arduino.cc/assets/Pinout-UNOrev3_latest.pdf) specifies 20 mA per I/O and 50 mA from the 3.3 V pin. Use 20 mA as the GPIO operating limit for diagnostics; it must not be confused with an unrestricted output capability or a permanent-damage threshold. Logic voltage, GPIO current and board power-rail capability are separate quantities.

## ESP8266 NodeMCU

The [original NodeMCU DevKit v1.0 design](https://github.com/nodemcu/nodemcu-devkit-v1.0) is the hardware reference. The inspector's D0–D8 labels map to GPIO16, 5, 4, 0, 2, 14, 12, 13 and 15. D0 does not mean GPIO0; RX/TX correspond to GPIO3/GPIO1 and must not be confused with D labels.

Espressif documents [3.3 V supply and ESP8266 connections](https://docs.espressif.com/projects/esp-techpedia/en/latest/esp-friends/get-started/try-firmware/try-firmware-hardware/esp8266.html). GPIOs must not be treated as 5 V tolerant. VIN is a board power input, not a 5 V logic pin.

The [ESP8266EX datasheet v7.1, Table 5-1](https://espressif.com/sites/default/files/documentation/0a-esp8266ex_datasheet_en.pdf) specifies a 12 mA maximum I/O current, an input LOW threshold up to `0.25 × VIO`, an input HIGH threshold from `0.75 × VIO`, and a 3.6 V maximum working supply. These establish electrical diagnostic limits; the RF impedance elsewhere in the datasheet is not a DC GPIO output resistance. Any numerical GPIO drive resistance used by the simulator must be documented separately as an approximation.

For normal flash boot, the [ESP8266 Arduino project's boot-mode table](https://github.com/esp8266/Arduino/blob/master/doc/boards.rst) requires GPIO15 LOW, GPIO0 HIGH and GPIO2 HIGH; GPIO0 LOW with the other required levels selects the serial bootloader. Electrical diagnostics must distinguish these boot requirements from valid running states. No firmware or boot sequence execution is implemented.

The [Espressif QEMU integration documented for ESP32](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-guides/tools/qemu.html) establishes neither ESP8266 support nor browser integration. **Technical inference:** sharing the Xtensa family is insufficient to assume CPU, ROM, memory, SDK or network-peripheral compatibility.

The foundation research did not identify and validate a reliable ESP8266 firmware runtime for browser integration. This does not prove impossibility, but prevents promising firmware execution. The first implementation is visual/electrical, followed by virtual GPIO/protocol integration in Phase 4. Any future emulator must demonstrate compiled examples, peripheral limits, licensing and repeatable tests before execution is enabled.

## Electrical engine and data boundary

`evaluateCircuit(project, inputs = {})` in `src/sim/engine.ts` is a pure, stateless function. It accepts an already validated `CircuitProject` and optional `SimulationInputs`; it returns an `ElectricalSnapshot` with pin results, component results and structured diagnostics. It performs no clock access, document mutation, React/Redux work or DOM operations.

Inputs are transient records:

- `gpio`: `pinKey(componentId, pinId)` → `{ mode: 'input' | 'input-pullup' | 'output', level: 'HIGH' | 'LOW' | 'FLOATING' }`.
- `buttons`: component ID → physical pressed boolean.
- `potentiometers`: component ID → wiper ratio from 0 to 1, overriding the saved ratio only for that evaluation.

Use `pinKey` from `src/sim/topology.ts`; it encodes a JSON tuple to avoid collisions between imported identifiers containing punctuation. Unknown references, unknown transient IDs, invalid values and contradictory alias configurations produce diagnostics. Invalid references or inputs suppress all calculated readings for that evaluation rather than producing a seemingly valid partial circuit.

An absent numeric result means unresolved, not zero. Pin logic can be HIGH, LOW, FLOATING or UNDEFINED. Component results optionally include signed terminal voltage/current, dissipated power and LED brightness; diagnostics carry a code, severity, component IDs and pin IDs. Consumers localize these codes outside the electrical domain.

## Connectivity and reference nodes

Union-find joins explicit ideal-wire endpoints, validated lead-to-hole `attachments`, and the authoritative component registry's internal `contactGroups`. Coordinates, rotations, wire color, crossing paths and placement proximity alone never establish electrical connectivity. A successful editor insertion first records explicit, validated attachments; only those contacts enter the engine. Stable terminal references survive editing and serialization.

The represented BB830 has 830 holes: `a`–`e` in each numbered column form one five-hole group, and `f`–`j` form another. Neighboring columns and opposite sides of the center gap are isolated. Four independent 50-hole power rails are continuous across their full visible length. This SVG has no split-rail variant; splitting a rail absent from the physical model would be incorrect.

Source negative terminals and simulated board GND establish a local reference within their conductive island. The solver does not join disconnected grounds. Passive pin voltages, including board power-pin readings, use the reference selected from a voltage source's negative node in the solved conductive island. GPIO readings are instead explicitly relative to that GPIO's own board GND and are unresolved without a common conductive reference.

**Result limitation:** the public snapshot does not expose reference-island metadata. Never subtract or compare passive pin voltages from unrelated islands. Component voltage drops are computed only where the engine has established a common reference. GPIO voltage and logic must be taken from the GPIO result rather than inferred from another pin's absolute-looking numeric value.

## DC evaluation and supported topologies

`src/sim/dc.ts` partitions possible branch connectivity into independent islands, then solves each independently. A faulty island does not prevent an unrelated valid island from being evaluated. Modified nodal equations use Kirchhoff's laws and Ohm's law; dense Gaussian elimination uses pivoting and a residual check. There is no artificial ground leakage, convergence guess or invented voltage.

Supported networks include ideal configurable DC supplies, single/series/parallel resistors, resistive dividers, valid current-limited LED circuits, pushbutton contacts, three-terminal potentiometers, board power rails and finite-resistance digital GPIO drivers. Portable source configuration accepts 0–60 V; resistance must be finite and positive. A source is ideal within this DC model: supply current limiting, batteries, regulators and USB consumption are not modeled.

Topology allocation is bounded at **12,000 physical pins per evaluation**; larger documents remain editable and serializable but receive an unsupported-network result before runtime pin allocation. The bounded solver supports at most **96 matrix unknowns** in a conductive solve and **6 LEDs per potential island**. It enumerates up to 64 LED conducting/nonconducting combinations. Larger networks receive `unsupported-network` instead of silently reducing fidelity. Floating islands without a voltage source are diagnosed and have no fabricated absolute voltage. Pivot/rank/residual failures and ill-conditioned or indeterminate networks are rejected.

Directly shorting the terminals of a nonzero ideal source produces `short-circuit`; incompatible ideal-source constraints produce `contradictory-sources`. Identical parallel ideal sources have indeterminate current sharing and are unsupported. A 0 V source with both endpoints on the same node is also conservatively unsupported because its current is not determined.

LED active-set ambiguity is rejected conservatively, including equal parallel ideal LEDs sharing current and an LED connected directly across a matching ideal voltage source. An LED directly across a higher ideal source is unsupported rather than assigned unlimited current or a fabricated damage event. Reversed LEDs remain nonconducting; reverse breakdown is not modeled. A dangling/disconnected LED remains dark even if one terminal touches a powered node. Basic single-LED paths with a series resistor are supported. The conservative active-set validation may reject some multi-LED networks, including series-LED chains with indeterminate off-state internal-node voltages, even below the six-LED bound; the bound is a computational limit, not a guarantee that every topology up to six LEDs is supported.

Open-path diagnostics use branch connectivity with the component's branch removed; they do not label every zero-current solution as open. A closed path at 0 V is valid. This structural open-path check is limited and does not claim to locate every possible floating or reverse-biased interruption in an arbitrary network.

## Component models and conditions

| Component | Implemented DC behavior and assumptions |
| --- | --- |
| Resistor | Constant positive resistance, `I = V/R`, signed voltage/current and `P = abs(V × I)`. The catalog's ¼ W rating is fixed at 0.25 W. |
| LED | Ideal nonconducting reverse/off branch or constant forward drop: red 2.0 V, yellow 2.1 V, green 2.2 V, blue 3.1 V. No dynamic resistance, leakage, reverse breakdown or temperature correction. |
| LED illumination | Only solved positive anode-to-cathode current illuminates. Brightness is `clamp(I / 0.020 A, 0, 1)`; it is an illustrative current-to-display mapping, not a calibrated optical model. Current above 20 mA produces a warning. |
| Pushbutton | Pins 1/3 and 2/4 remain internally joined. A normally open button bridges these groups only while pressed; a normally closed button opens while pressed. Contact resistance and bounce are omitted. |
| Potentiometer | Three terminals: `R(1,wiper) = total × ratio` and `R(wiper,3) = total × (1 − ratio)`. Endpoints 0/1 create exact terminal continuity. Wiper loading participates in the circuit equations. |
| Potentiometer readings | Component voltage is terminal 1 minus terminal 3; power is the sum dissipated in both segments. No single component current is reported because a loaded wiper has distinct terminal currents; branch/terminal currents are not exposed in the public snapshot. Read wiper voltage from its pin result. No potentiometer power rating is specified. |

`normal`, `active`, `warning`, `overheated` and `damaged` are explicit condition types. Closed pushbuttons and forward-conducting LEDs can be active. Noninformational diagnostics promote an affected component to warning; a resistor dissipating more than 0.25 W is overheated. This is an instantaneous rating-based indicator, not a thermal temperature/time calculation. Returning within the rating removes the condition on reevaluation.

There is **no permanent-damage model**: `damaged` is reserved and not produced. Warnings do not latch or imply destruction. No smoke event, burn accumulation, thermal integration or animation-dependent electrical behavior is implemented. Reset does not repair saved damage because no such damage is saved or modeled.

## GPIO model and limitations

Boards are explicitly treated as powered by simulated USB, independent of external power wiring. UNO provides ideal 5 V and 3.3 V rails relative to its GND; ESP8266 provides an ideal 3.3 V rail. VIN is not an output source and its regulator/power-input path is unsupported. Connected reserved/control/otherwise unmodeled pins receive `unsupported-pin`; they do not acquire invented behavior.

Digital outputs use an illustrative Thevenin driver: nominal logic voltage for HIGH or 0 V for LOW, in series with **40 Ω for UNO** or **50 Ω for ESP8266**. These resistances are approximations, not datasheet transistor models or RF impedances. They produce load-dependent voltage and finite current; excessive current produces a diagnostic rather than an undocumented current clamp. They do not guarantee safe real hardware operation.

INPUT is high impedance regardless of any remembered HIGH/LOW input value. OUTPUT with FLOATING is high impedance. INPUT_PULLUP uses an illustrative 30 kΩ connection to the logic rail. As documented by the [ESP8266 Arduino digital-I/O reference](https://github.com/esp8266/Arduino/blob/master/doc/reference.rst), D0/GPIO16 has different pull-resistor modes from GPIO0–15; it does not support INPUT_PULLUP, and such an override is rejected. GPIO aliases refer to one physical GPIO and generate one driver; incompatible configurations through aliases are invalid inputs. UNO A0–A5 support digital GPIO14–19, with SDA/A4, SCL/A5 and relevant ICSP aliases sharing connectivity/configuration. No ADC, PWM, UART, I²C or SPI peripheral execution is implemented.

| Board | Nominal logic | LOW / HIGH threshold | Per-pin warning limit |
| --- | --- | --- | --- |
| Arduino UNO | 5 V | LOW ≤ 0.30 × logic supply; HIGH ≥ 0.60 × logic supply | 20 mA |
| ESP8266 NodeMCU | 3.3 V | LOW ≤ 0.25 × logic supply; HIGH ≥ 0.75 × logic supply | 12 mA |

Voltages between thresholds are UNDEFINED. Voltage above nominal + 0.3 V or below −0.3 V produces `gpio-overvoltage`; connecting 5 V to a referenced ESP8266 GPIO is detected. This check requires the source and board to share a valid reference; a solitary connection from an unrelated source cannot establish its voltage relative to board GND.

UNO additionally warns above 200 mA total absolute GPIO drive current and above 50 mA on its 3.3 V supply branch. The [ATmega328/328P datasheet, absolute maximum ratings](https://docs.arduino.cc/resources/datasheets/Atmel-42735-8-bit-AVR-Microcontroller-ATmega328-328P_Datasheet.pdf) lists 200 mA for VCC/GND pins. The simulator's sum of absolute GPIO drive currents is a simplified warning derived from that package limit, not a full supply-current measurement or safe operating budget; port-group limits, detailed board consumption, regulator heating and all rail limits are not modeled. ESP8266 has a per-pin check without a fabricated aggregate limit. Neither board has an unlimited-drive claim.

NodeMCU mapping is D0→16, D1→5, D2→4, D3→0, D4→2, D5→14, D6→12, D7→13 and D8→15; RX/TX map to GPIO3/GPIO1. D3/D4/D8 produce boot-sensitive information, elevated to a warning when a resolved logic level conflicts with the required HIGH/HIGH/LOW boot state. No actual boot sequence or firmware is executed.

## Lifecycle and persistence boundary

The electrical engine has no retained history to reset. Evaluating the same document and inputs returns deterministic results; evaluating with empty inputs releases button overrides, returns GPIO to INPUT/high impedance and restores saved potentiometer ratios.

The UI lifecycle adapter is separate from the persisted circuit. Start evaluates; Pause freezes the current snapshot and releases transient momentary-button state for the next resume; Stop and Reset clear transient controls and results. Structural editing must require stopping, including keyboard/history/import paths. UI integration and condition visuals have passed their implementation gates; final browser acceptance remains pending. Reset simulation clears only this transient state. The file menu's Reset reference desk is a separate confirmed project replacement, not an electrical reset.

Instantaneous voltages, currents, component conditions, lifecycle status and temporary controls are excluded from Redux Persist and portable project JSON. Stopping/resetting does not modify the circuit document or project history. SVG rendering consumes engine brightness and conditions; LED glow is absent when brightness is zero, and resistor-overpower conditions produce a subtle tint/indicator. Transitions honor reduced motion without changing electrical calculations. Static rendering tests cover these conditions; interactive visual regression is still pending.

## Explicit exclusions

Full SPICE compatibility, transients, capacitance/inductance, AC, RF, analogue semiconductor characteristics, analog ADC conversion, PWM waveforms, USB/regulator power paths, arbitrary sensors, firmware execution, realistic temperature and permanent damage are outside this model. Exceeding numerical bounds, ambiguous ideal networks and unsupported pins must remain visible diagnostics rather than apparently valid solutions.

## Phase 4 boundary

A future virtual WiFi/HTTP controller supplies `SimulationInputs` to `evaluateCircuit` using the same transient GPIO records as manual testing and consumes `ElectricalSnapshot` pin logic/voltages and diagnostics. `ElectricalEngine.evaluate` in `src/sim/types.ts` records this stateless boundary; a controller can adapt the pure function without changing electrical models. It must not rewrite the authoritative circuit document, duplicate electrical calculations, or couple protocol handling to React/SVG. Reset clears temporary overrides and derived states without changing the saved circuit. No virtual network or HTTP implementation is claimed in Phase 3.

The linked sources were consulted during foundation/editor development. Runtime and WebAssembly toolchain feasibility must be reassessed when Phase 5 begins.

See [the validation record](PHASE3_VALIDATION.md) and [browser/visual testing procedure](BROWSER_TESTING.md) for the final verification status.

## Virtual HTTP integration

Virtual ESP8266 routes produce GPIO proposals through the same transient runtime transition as manual controls. HTTP success does not bypass connectivity, polarity, driver resistance or solver limits. Sessions and history are not electrical project data. See [the deterministic networking contract and lifecycle](WORKSPACE_AND_IOT.md). Firmware execution, real WiFi/TCP/HTTP and executable HTML previews remain unsupported.
