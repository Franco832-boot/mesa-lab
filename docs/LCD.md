# HD44780 LCD and PCF8574 milestone

## Architecture and phased delivery

The inspected application already had a typed lexer/parser/AST/compiler, resumable per-board VM, virtual time, registered DHT/Serial adapters and an injected circuit observation port. Its object execution was still specific to DHT. The electrical engine separated topology, device branches and a bounded DC solver. React rendered snapshots; Redux Persist stored only the authoritative v1 project. The existing project catalog provided immutable templates and the existing Inspector handled property commands and transient results.

The implementation followed the requested order:

1. **A:** one 80-byte HD44780 controller and a 16×2 component; tests for nibbles, DDRAM, power, contrast and 32 rendered cells, then type/build checks.
2. **B:** a physically validated 4-bit parallel transport and typed LiquidCrystal calls; connected-circuit tests plus existing DHT/clock regression tests, then build.
3. **C:** the 20×4 geometry and DDRAM mapping using the same controller, renderer and transport; tests for 80 rendered cells and four real rows, then build.
4. **D:** a PCF8574 backpack, addressed UNO I²C routing and byte-to-nibble translation; address, bus, header, power, collision and backlight tests, then build.
5. **E:** four complete executable templates in the existing Displays category, Inspector integration and full regression gates.

No sidebar, editable circuit store or native C++ execution was added. The existing DC algorithms, topology resolution, GPIO implementation and millis/micros clock algorithms remain unchanged. Only device branch definitions and result projection were extended.

## Physical profiles and wiring

The generic positive LCD profiles use approximate standard module outlines: **80×36 mm** for 16×2 and **98×60 mm** for 20×4. Both use a 16-contact, 2.54 mm header and the existing 4 world-units/mm scale. The same physical registry supplies wire anchors, thumbnails, selection, rotation and Inspector dimensions. Mechanical references are the [Newhaven 16×2 specification](https://newhavendisplay.com/content/specs/NHD-0216K1Z-FL-YBW.pdf) and [Newhaven 20×4 specification](https://newhavendisplay.com/content/specs/NHD-0420DZ-FSW-FBW.pdf). These are outline/interface references, not claims that every electrical or optical characteristic of those exact products is emulated.

| Pin | Stable terminal | Role |
| --- | --- | --- |
| 1 | VSS | Logic ground |
| 2 | VDD | 5 V logic supply |
| 3 | VO | Contrast input |
| 4 | RS | Instruction/data selection |
| 5 | RW | Write-only operation requires LOW |
| 6 | E | Enable |
| 7–14 | D0–D7 | Only D4–D7 are used by the initial 4-bit adapter |
| 15–16 | A, K | Backlight anode/cathode |

The accepted logic supply is 4.5–5.5 V. The interface and supply envelope follow standard 5 V compatible modules, such as the [Vishay interface specification](https://www.vishay.com/docs/37490/lcd016n002byyhet.pdf). A module's backlight remains a separate electrical load and can be lit independently of its logic supply.

The backpack is an illustrative approximately **42×19 mm** PCF8574/YWROBOT module. Its bus header is labeled GND, VCC, SDA, SCL. It exposes the 16 LCD-side solder contacts as `LCD_<terminal>` pins. They are wired to the display using the ordinary editor; there is no hidden selected-display ID or second I²C display component. This also makes missing or swapped adapter-to-LCD contacts meaningful. Other backpack layouts are not assumed equivalent.

The UNO uses A4/SDA and A5/SCL, including the registry's SDA/SCL aliases. Selectable seven-bit addresses cover 0x20–0x27 and 0x38–0x3F, representing the PCF8574/PCF8574A family ranges documented by [TI](https://www.ti.com/tw/lit/pdf/scyb031). This does not add LCD firmware support for ESP8266.

## Shared controller and display

`sim/hd44780.ts` owns the instruction/data registers, two-nibble byte assembly and 80-byte DDRAM. Visible row offsets are 0x00/0x40 for 16×2 and 0x00/0x40/0x14/0x54 for 20×4. Writes advance through the controller's two 40-byte banks; printing past a visible row does not invent an automatic newline. Clear resets DDRAM/address; home resets the address without erasing data; display off preserves memory. Cursor, blink and display flags are shared by both transports. The [HD44780U controller reference](https://www.waveshare.com/datasheet/LCD_en_PDF/HD44780.pdf) describes the underlying memory and 4-bit interface.

`LcdArtwork.tsx` is one parameterized native SVG renderer. It renders exactly 32 or 80 character positions from `ComponentResult.lcd`, including solved backlight intensity, contrast and cursor flags. It has no editable or persisted display-text property. The glyph presentation is a monospace approximation: printable ASCII and the common 0xDF degree symbol are shown; other ROM/custom codes use a placeholder. This is not a complete A00/A02 font ROM or a pixel-perfect optical simulation. Unicode strings are not decoded as an LCD UTF-8 protocol.

Cursor blink is a presentation animation controlled by the controller flag, paused with simulation and disabled by reduced-motion preference. Its one-second CSS cycle is not HD44780 oscillator timing. It is not an independent text/LED demonstration animation.

## Electrical and transport validity

The parallel API resolves the six declared GPIOs to the actual RS/E/D4–D7 nets. It requires exactly one matching, powered LCD, a common UNO ground, RW tied to VSS, six distinct signal nets, configured output modes and no competing GPIO output. It probes whether those nets can reach both LOW and HIGH through the ordinary DC engine. Missing/swapped wires, code-to-wire mismatches and shorts cannot produce accepted text. This is a conservative transaction model: invalid wiring suppresses writes rather than synthesizing plausible garbled characters. The DATA nets do not require an LED-style conducting series return path.

The I²C adapter validates supply/common ground, a released idle HIGH SDA/SCL bus, the actual UNO nets and one matching address. Duplicate same-address devices are rejected. It also validates RW and each LCD-side control/data contact and their ability to reach the required logic levels. The selected mapping is **P0=RS, P1=RW, P2=E, P3=backlight, P4–P7=D4–D7**. Encoded expander bytes create enable pulses; falling E samples two nibbles into the same HD44780 controller. The expander latch remains separate from LCD DDRAM. Backlight commands alter an electrical branch rather than a display-only flag.

This is an addressed transaction model, not an I²C waveform emulator. It does not implement start/stop bit timing, ACK waveforms, rise times, arbitration, clock stretching, a generic `Wire.beginTransmission/write/endTransmission` API, or multi-controller scheduling. Parallel GPIO enable/data pulse waveforms are not cycle-emulated either; the library adapter validates and transfers the logical 4-bit transaction. Ordinary GPIO bit-banging does not directly drive the controller in this milestone.

Documented DC approximations:

- LCD logic: a 5 kΩ load, approximately 1 mA at 5 V; not a calibrated operating/transient-current model.
- LCD component voltage/current/power fields refer to this VDD logic port and are labeled accordingly. Backlight illumination is reported separately; a multi-port module has no single terminal current.
- Backlight: the engine's ideal diode approximation at 3 V. Parallel examples add 220 Ω externally. The backpack profile models a switched 220 Ω limiting path. These are explicit teaching-profile assumptions, not universal module resistor/Vf specifications. At 5 V, the tested on-current is `(5−3)/220` A.
- Backpack: 50 kΩ standby load, 4.7 kΩ SDA/SCL pull-ups, illustrative 10 kΩ weak-high / 100 Ω low output paths, and a 10 kΩ contrast divider. End stops keep a finite 1 Ω contact.
- Contrast: a bounded visual response to solved VO relative to VSS and VDD. It is zero for an unresolved/out-of-range input or at the supply end, and rises as VO approaches ground. It is not a calibrated electro-optic/temperature curve. Changing a live external potentiometer alters visibility while retaining DDRAM.

No voltage is invented for an unresolved circuit. Brightness comes from solved current. Reverse or invalid logic supply hides the display; the model does not claim permanent damage, protection-diode behavior, brownout timing or a physical power-on reset sequence. Project electrical edits already reset simulation through the existing lifecycle. Stop/Reset clears all LCD/expander state; stopping only one board's firmware can leave a powered display's last DDRAM contents intact.

## Supported Arduino APIs and execution bounds

The parallel API follows the [Arduino LiquidCrystal library](https://github.com/arduino-libraries/LiquidCrystal/blob/master/src/LiquidCrystal.cpp), using the requested six-argument constructor and explicit `begin(cols, rows)`.

- `#include <LiquidCrystal.h>`
- `LiquidCrystal name(rs, enable, d4, d5, d6, d7)`
- `begin`, `clear`, `home`, `setCursor`, `print`, `write`, `cursor/noCursor`, `blink/noBlink`, `display/noDisplay`

The concrete I²C compatibility target is the [johnrickman/YWROBOT LiquidCrystal_I2C API](https://github.com/johnrickman/LiquidCrystal_I2C/blob/master/LiquidCrystal_I2C.h) and its [implementation](https://github.com/johnrickman/LiquidCrystal_I2C/blob/master/LiquidCrystal_I2C.cpp):

- `#include <Wire.h>`, `Wire.begin()` with no arguments, on UNO
- `#include <LiquidCrystal_I2C.h>`
- `LiquidCrystal_I2C name(address, cols, rows)`
- `init`, `backlight/noBacklight`, `setCursor`, `print`, `clear`, and the shared LCD commands above
- As in this variant, `init()` also releases/initializes the UNO I²C pins, so an explicit Wire.begin is optional.

Initialize the LCD before print/control calls and call backlight controls after init. Only the supported 16×2 and 20×4 geometries are accepted; out-of-range visible cursor coordinates produce typed errors. Initialization must match the connected geometry. Supported print arguments are literal strings and scalar numbers. Float precision can be supplied as a second argument (0–9); integer-base formatting is rejected. `write` accepts a byte (including ASCII character literals such as `'A'`); `write(0xDF)` shows the supported degree glyph. Hexadecimal numeric constants are parsed, including addresses in simple defines. Existing unsupported octal behavior remains explicit.

These are void-call API subsets: Print/write return counts, optional constructor/RW/8-bit variants, string variables, arrays, CGRAM/createChar, scrolling, display reads and busy-flag polling are not implemented. Command execution and initialization delays are transaction-level approximations, not controller-cycle/busy timing. No original C++ library is fetched or executed.

The library registry, AST, compiler and typed firmware object union route calls to `lcdRuntime.ts` and the injected circuit port. Literal prints compile into at most 32-character chunks. Every VM slice retains the existing scalar-instruction limit and adds a maximum of eight LCD transfers; it returns to the cooperative scheduler even inside a long print or loop. Tests compare whole/single-instruction traces. The host caches validated routing only within its slice and electrical-input signature. Actual native-browser Stop responsiveness remains a separate validation requirement.

## Inspector, persistence and examples

The existing Inspector shows controller type, physical and character dimensions, solved supply validity, backlight, contrast and connection type. The backpack uses normal validated project property commands for its address and contrast adjustment. Its address is displayed in hexadecimal and saved as a JSON number. A parallel external potentiometer retains its existing live-input control. No display-text editor or extra panel was added.

New component properties are `controller: "HD44780"` for either LCD kind and `{address, contrast}` for the backpack. The existing v1 parser explicitly validates/normalizes them; older fixtures still roundtrip. DDRAM, cursor flags, expander latches, electrical results and VM objects live only in transient execution/SimulationInputs. Redux Persist's document whitelist and migration versions are unchanged.

The existing project library now includes four **Displays / Pantallas** templates:

| Catalog ID | Display | Transport | Source |
| --- | --- | --- | --- |
| lcd16-parallel | 16×2 | RS D12, E D11, D4–D7 on D5/D4/D3/D2 | `examples/arduino/lcd16-parallel.ino` |
| lcd20-parallel | 20×4 | Same six-pin mapping | `examples/arduino/lcd20-parallel.ino` |
| lcd16-i2c | 16×2 + backpack | A4/SDA, A5/SCL, address 0x27 | `examples/arduino/lcd16-i2c.ino` |
| lcd20-i2c | 20×4 + backpack | Same bus and address | `examples/arduino/lcd20-i2c.ino` |

All use the real breadboard power contacts. Parallel examples include a mounted 10 kΩ potentiometer and 220 Ω backlight resistor. I²C examples wire all 16 adapter/display contacts and use the adapter's modeled divider/limiter. They are ordinary v1 templates loaded through the existing confirmation, preservation, reset and fit workflow. The three earlier DHT/millis/for examples remain available.

## Files and validation

Added:

- `src/model/{lcd.ts,lcdExamples.ts,examplePlacement.ts}`: shared profiles/contracts, four ordinary templates and extracted shared placement helper.
- `src/sim/{hd44780.ts,lcdView.ts,lcdTransport.ts,lcdI2c.ts,pcf8574.ts}`: one controller, display projection, parallel validation, addressed routing and latch translation.
- `src/firmware/lcdRuntime.ts`: typed LCD construction/commands.
- `src/features/components/LcdArtwork.tsx`: shared native SVG renderer.
- `examples/arduino/{lcd16-parallel,lcd20-parallel,lcd16-i2c,lcd20-i2c}.ino`.
- `src/test/lcdFixture.ts`, `src/sim/lcd.test.ts`, `src/model/lcdExamples.test.ts`, `src/firmware/lcdRuntime.test.ts`, `src/features/simulation/{lcdRuntime,lcdI2c}.test.ts`, `tests/browser/lcd.test.mjs`.

Updated:

- `src/model/{types.ts,components.ts,physical.ts,project.ts,exampleProjects.ts}` for the component kinds, physical terminals, format normalization and catalog entries.
- `src/sim/{types.ts,inputs.ts,models.ts,engine.ts}` for transient typed state, branch definitions and derived results; solver algorithms are unchanged.
- `src/firmware/{libraries.ts,compiler.ts,lexer.ts,values.ts,machine.ts,ports.ts}` for registered calls, bounded string transfers, byte/hex literals, tagged library objects and the circuit port.
- `src/features/simulation/firmwareRuntime.ts` to commit peripheral results from the host alongside normal GPIO effects.
- `src/features/components/{catalog.ts,ComponentArtwork.tsx,PropertyFields.tsx,SimulationProperties.tsx}`, `src/app/{App.tsx,styles.css}`, `src/locales/{es,en}/messages.ts` for existing component/Inspector surfaces and motion/labels.
- `src/app/ProjectLibrary.test.ts`, `src/model/exampleProjects.test.ts` and `tests/browser/projects.test.mjs` to validate the expanded catalog and Inspector. Their earlier electrical, persistence and control assertions are retained; the catalog expectations account for four added displays.
- `README.md`, `docs/EXAMPLE_PROJECTS.md` and this document.

Full release gates are recorded after the final run below. New tests cover both geometries, exact row maps, nibble/expander byte assembly, power faults, missing/swapped/shorted data, GPIO mode conflicts, missing RW/contrast, numeric/text/byte writes, clear/home/display/cursor flags, backlight continuity, live contrast with retained memory, addresses/aliases/collisions, board isolation, template execution, save/load and old-project compatibility. The existing DHT, GPIO, electrical, millis, for and project-history tests remain in the full suite.

The five native-browser LCD cases are authored and syntax-checked, but not executed here. Previous browser attempts in this environment failed at restricted process launch, and permission requests to run outside the sandbox were interrupted. No LCD screenshot was captured, inspected or approved. jsdom/SSR checks establish DOM/state behavior, not native layout or pixel accuracy.

## Manual verification

1. Open **Projects → Displays**, choose any of the four templates, and Start. The 20×4 templates show `Los Profes Para Vos` on the first line and also use the fourth line. The 16×2 templates split the name into `Los Profes` and `Para Vos` across their two rows. Open Code to inspect the loaded source and the LCD Inspector to see resolved status.
2. In a parallel example, change the external potentiometer while running. At the supply end, text vanishes; moving it toward ground reveals the same DDRAM again. Backlight is independent: with simulation stopped, disconnect A or K and restart; illumination must disappear.
3. Stop, change a declared GPIO without changing the wire, or remove/swap D4/D5. Restart: valid text must not appear. Restore the exact mapping, including RW to ground.
4. In an I²C example, stop and change the Inspector address to 0x3F while keeping source at 0x27. Restart: blank display. Match the source address and restart to restore communication. Swap SDA/SCL or remove a required LCD-side signal to verify rejection.
5. Add `clear`, `home`, cursor/display controls or `write(0xDF)` to the sketch. Check that display off preserves memory and clear erases it. Pause/Resume and reduced motion should control the cursor animation.
6. Save/reload an edited example: component properties, wires and sketch should survive, while execution and previous screen memory reset. Reopening the template must leave its original catalog definition intact.

Final validation (Node 22.23.4): `npm run verify` exited **0**. Type checking, **501 tests in 58 files**, and production build passed. The final build emitted the existing >500 kB chunk warning (557.24 kB JavaScript before gzip); it did not fail. `git diff --check` and syntax checking of `tests/browser/lcd.test.mjs` also passed.

An intermediate full run found two existing console assertions failing because the generic GPIO error wording had changed. The original message prefix was restored and library guidance appended without editing those tests; both passed in the final full run. A template test also initially observed only the first bounded VM slice of the 20×4 I²C initialization; its runner now drains resumable work through the normal firmware-advance API before asserting the complete screen. No final numerical, firmware, persistence or DOM test failures remain. Native-browser execution and screenshot review remain unverified, as described above.
