# DHT11 and virtual Arduino library support

## Architecture and delivered scope

The pre-existing engine consisted of a bounded lexer/parser/AST, resumable instruction machine, microsecond virtual clock and per-board execution adapter. It supported integer/bool code, conditionals and direct GPIO, but no objects, float values, strings, library methods or Serial. Circuit topology, GPIO drivers, loaded voltages, contact groups, breadboard insertion and project history were already implemented and are reused.

This extension adds a classic Aosong DHT11 SIP-4 component and a deliberately bounded `DHT.h` API adapter. No native C++ library is downloaded or executed. The scalar VM now supports `float`, decimal float literals, `NAN`, `isnan()` and void `return;` from setup/loop. Numeric object-like `#define` constants and constant aliases are supported; a general C++ preprocessor is not.

`firmware/libraries.ts` defines explicit class/method signatures. The AST represents constructor declarations and method calls; the compiler validates the header, receiver, method, arity and void-result use. `dhtRuntime.ts` owns library caching and physical sample timing, while the injected circuit port in `ports.ts` keeps React, Redux and the document outside the interpreter. Adding another library requires an explicit contract and runtime adapter; unknown APIs fail visibly.

## Component, physical profile and wiring

The modeled part is the **bare four-pin classic DHT11**, viewed from its blue grille/front, with a 12 × 15.5 mm body and 2.54 mm pin pitch. Leads are represented trimmed to 5 mm below the body. This is not a three-pin breakout module.

| Front-view pin | Stable terminal ID | UNO wiring |
| --- | --- | --- |
| 1 | `VCC` | `5V` |
| 2 | `DATA` | The GPIO used by the DHT constructor; the example uses `D2` |
| 3 | `NC` | Leave unconnected |
| 4 | `GND` | `GND` |

A 4.7 kΩ pull-up from DATA to 5 V is recommended in the example circuit. `dht.begin()` also enables the existing modeled GPIO input pull-up. DATA must resolve to an idle HIGH level; the model does not invent one for a floating line. Pin numbering is from the front, not the reversed rear view.

The component uses the authoritative physical registry and existing 4 world-units/mm scale. Its four leads can be inserted into four separate breadboard columns using the existing attachment workflow. Wire endpoints, rotation, selection, zoom and undo/redo use existing editor commands.

Default environment: 25 °C, 50 %RH. The selected classic profile accepts 0–50 °C and 20–90 %RH. Ambient properties can contain fractions; readings round to 1 °C and 1 %RH. No random noise or accuracy offset is added. This profile intentionally does not claim the wider range of newer DHT11 revisions or DHT22.

The selected profile follows the [Aosong classic datasheet](https://cdn-shop.adafruit.com/datasheets/DHT11-chinese.pdf). API caching follows the [Adafruit DHT library 1.4.6 implementation](https://github.com/adafruit/DHT-sensor-library/blob/1.4.6/DHT.cpp); only the API subset below is implemented.

## Electrical validity

`sim/dht11.ts` resolves the actual topology and consumes the existing DC solver results. A read needs exactly one sensor DATA terminal on the requested board GPIO net, an ideal common GND net, VCC−GND between 3 and 5.5 V, and an electrically resolved idle HIGH. DATA must stay within the sensor and target-board voltage bounds. Actively driven DATA, floating DATA, multiple sensors sharing a bus, NC wiring, missing power, reversed/out-of-range power and wrong GPIO return no observation. Breadboard contact groups and explicit lead attachments participate in the same checks.

The firmware adapter applies pending writes from the calling board before observing the circuit, so `begin()` and earlier GPIO instructions have their real electrical effects before the method read. It never selects a sensor by a friendly name or returns defaults because a function name was recognized. Sensor environment values are consumed only after electrical validation.

The electrical model adds an illustrative 50 kΩ VCC-to-GND standby load (100 µA at 5 V). This is not a calibrated operating-current or transient model. Existing resistor, LED and board models and the linear/DC solver algorithms are unchanged.

## Timing and failure behavior

- Time is injected from the existing integer-microsecond virtual clock, not wall time.
- A conservative one-second startup guard begins at `dht.begin()`. Repeated begin resets this guard and the instance's API cache.
- An API instance caches the paired temperature/humidity sample or failed attempt for two seconds. Calling both read methods returns one coherent sample rather than two independent measurements.
- Physical samples are shared between instances targeting the same sensor within that board execution and cannot refresh more often than once per second.
- Circuit validity is checked on every call. A disconnected/invalid circuit invalidates even a previously valid API cache; this is a deliberate safety refinement over blindly returning stale cached data.
- Invalid readings are transient IEEE `NaN`; `isnan()` can guard them and Serial prints `nan`. They are never saved in project JSON.
- Pause freezes execution. Stop/reset clears object/cache state, live environment overrides and Serial output. Each board retains independent VM state and Serial output.

The startup guard is an API approximation, not a continuous power-on/brownout detector. Reconnection within the same run does not emulate a physical reboot sequence. The minimum-sample cache is scoped to a board execution; simultaneous multi-controller bus arbitration is not implemented.

## Supported source and monitor

Use [the executable example](../examples/arduino/dht11.ino). The component can use other valid GPIO pins and environmental values; the example pin and values have no privileged runtime behavior.

Supported:

- `#include <DHT.h>` or `#include "DHT.h"`.
- Global `DHT object(pin, DHT11);`, including constant variables/simple defines as arguments.
- `object.begin()`, `object.readTemperature()`, `object.readHumidity()` with no optional arguments.
- `float`, normal arithmetic/comparisons, `NAN`, `isnan(value)` and `return;` in setup/loop.
- `Serial.begin(baud)`, `Serial.print(value)`, `Serial.println(value)` and empty `Serial.println()`.
- Literal strings with quote, backslash, newline, carriage-return and tab escapes.
- Decimal integer output; float output defaults to two decimal places. A second argument to print/println selects float decimal places (0–9). Integer-base formatting is rejected rather than approximated.

The existing Messages panel contains one labeled virtual serial log per initialized board. Output is escaped text, bounded to the latest 16,384 UTF-16 code units, with a truncation notice. Baud is configuration metadata; real UART baud timing, pins and transport are not emulated. No `Serial.available/read`, formatting bases, arbitrary strings/objects, `F()`, LCD, I²C, Fahrenheit/force arguments, heat index, other DHT models, user classes, arrays or general external libraries are implemented.

## Inspector and persistence

Stopped-mode temperature/humidity edits are normal validated project property commands and participate in history and saving. Running-mode controls in the electrical section change only `SimulationInputs.dht11`; these overrides are transient and reset on Stop/Reset. The API cache can retain the previous sample until the next eligible measurement.

The public `mesa-circuit` version remains 1: `dht11` is an additive component variant with validated, explicitly normalized numeric properties. Existing fields and terminal IDs are not renamed. Old v1 projects and legacy persistence migrations still load; older application versions cannot understand projects containing this new component and must not be used to roundtrip them. Runtime objects, NaN, logs, caches and sensor input overrides are excluded from document serialization and Redux Persist.

## Validation and file inventory

The starting checkout passed TypeScript, 367 tests in 45 files and production build. The physical-component milestone passed 370 tests; electrical observations and live-input integration passed 380 tests before the library extension. Final results are recorded below after the release checks finish.

Tests cover physical scale/pin order/pitch, real breadboard insertion, old-project compatibility and roundtrip, independently calculated standby current, supply/data/ground faults, floating/driven DATA, wrong GPIO, ambiguous buses, live environment changes, quantization, sample intervals, cache invalidation, executable DHT.h sketches, per-board Serial isolation, reset, bounded output and instruction-by-instruction suspension.

Implementation files:

- `src/model/{dht11.ts,types.ts,physical.ts,components.ts,breadboard.ts,project.ts}`: profile, component, terminals, placement, validation and serialization.
- `src/sim/{dht11.ts,models.ts,types.ts,inputs.ts}`: circuit observations, standby load and transient input validation.
- `src/firmware/{libraries.ts,ports.ts,dhtRuntime.ts,serial.ts,ast.ts,lexer.ts,parser.ts,compiler.ts,profile.ts,values.ts,machine.ts}`: API contracts, object execution, scalar/float/print support and caching.
- `src/features/simulation/{firmwareRuntime.ts,runtime.ts,useSimulation.ts,SimulationConsole.tsx}`: injected circuit port, environment events and serial logs.
- `src/features/components/{catalog.ts,ComponentArtwork.tsx,PropertyFields.tsx,SimulationProperties.tsx}` and `src/app/styles.css`: library card, physical artwork, saved/live controls and log styling.
- `src/locales/{es,en}/messages.ts`: typed scope notes and labels.
- `examples/arduino/dht11.ino`, DHT-specific model/sim/firmware/integration/browser tests and `src/test/dhtFixture.ts`: reproducible code and circuit evidence.
- Existing mock-controller tests gained the new controller method; former “Serial unsupported” cases now use an actually unsupported method to retain negative-contract coverage.

No dependencies were added. No LCD or I²C implementation is included.
