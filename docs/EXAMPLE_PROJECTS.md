# Educational project library

The subsequent [LCD milestone](LCD.md) extends this same catalog with four display templates. The three original examples, panel ownership and loading workflow below are retained.

## Controls and shared panel architecture

Before this change, `App.tsx`'s top-left `library-toggle` and `ToolSidebar.tsx`'s purple `sidebar-toggle` both called `toggleLibrary` and controlled the same right-hand tools panel.

The top-left button now controls only the left project library, with the accessible name and tooltip **Mostrar/Ocultar proyectos / Show/Hide projects**. The purple arrow still controls only the right panel. Components, Code and IoT remain on the right, with their existing tab IDs, preferences, searches and per-tool widths. Opening projects does not change their selected tab or open state.

`WorkspaceSidebar.tsx` extracts the existing panel shell: structure, heading, scrolling, pointer/keyboard resizing, Escape handling, mobile sheet measurements and optional expansion/arrow. `ToolSidebar.tsx` retains ownership of its tabs. `ProjectLibrary.tsx` supplies the left heading and cards using the same shell and CSS. No second copy of the sidebar implementation or editable circuit was added.

On a wide workspace the left panel occupies space beside the circuit; closing it releases that space. When the central container is at most 620 CSS pixels wide, it becomes a compact panel above the canvas, with a 32% height cap and internal scrolling. The right mobile sheet retains its behavior, bounded by the actual canvas height to leave a visible strip and avoid covering the project panel. Both open states remain independent. Panel toggles retain the existing SVG/canvas DOM nodes and viewport transform; only loading a different project remounts the workspace. Shared measurements reattach to that new canvas using its project/revision identity.

## Catalog and ordinary project documents

`src/model/exampleProjects.ts` defines three templates, typed translation keys for bilingual names/descriptions, component lists and categories. The category vocabulary includes basics, sensors, displays and communication; only populated categories are shown. The catalog is outside React. Factories use the existing component registry, breadboard insertion planner and v1 project parser. Dimensions are obtained from component kinds in the physical registry at the existing 4 world-units/mm scale, rather than duplicating dimensions in the project schema.

Each opening creates a fresh project ID and new arrays/objects. A user's edits never reach a shared template. Component IDs remain local to the newly created document. The ordinary document owns components, placements, attachments, wires, properties, viewport and the complete UNO program. No project or Redux Persist version change is needed; existing migrations remain in use.

| Template | Electrical path | Source |
| --- | --- | --- |
| DHT11 | KY-015 DATA/VCC/GND inserted in b25/b26/b27; UNO D2/5V/GND wired to a25/a26/a27 | `examples/arduino/dht11-project.ino` |
| LED with millis | D13 → column 29 → 330 Ω resistor b29–b33 → LED c33–c34 → column 34 → GND | Existing `examples/arduino/blink-without-delay.ino`, unchanged |
| LED with for | Same physical series circuit, fed by D8 | `examples/arduino/led-for.ino` |

The breadboard's real contact groups connect the two different rows in each column. No decorative wire or animation supplies continuity. The DHT11 starts at 25 °C / 50% RH and uses the already implemented three-terminal module with its internal pull-up. There is no external pull-up in this template.

The DHT sketch is the requested `DHT.h` program, including its `isnan`/return error guard and Spanish Serial text. Float output uses the existing two decimal places. Readings, caching and electrical validity are supplied by the existing DHT model. LEDs use GPIO and the DC solver; the independently expected on-current is `(5 - 2) / (330 + 40)` A, including the UNO's modeled output resistance.

## Replacement and preservation

The project hook's existing save status identifies pending/failed saves. These require the existing accessible Dialog before replacement. Cancel leaves the document and simulation untouched. If background saving finishes before a card is selected, those changes are already saved and do not require confirmation.

On acceptance, the example is constructed and validated first. `replacement.ts` then serializes the latest current document into a new immutable local backup key, `mesa.project.before-example.v1:<unique-id>`. Existing backups, legacy project keys and recovery data are never overwritten. Backup failure prevents replacement and leaves a running simulation intact. Backups contain project data only. They are not another Redux document or runtime store.

After preservation, the existing simulation reset clears all firmware, inputs, caches and Serial state. The ordinary project loader replaces the active document, clears history/selection and connection drafts, and requests the existing fit-to-view operation. The DHT template opens Messages for its serial log. Simulation remains stopped until Start. Right tool preferences remain unchanged.

Redux Persist subsequently saves the new active project in its normal active slot. It does not rewrite the immutable template or external project files. The preservation snapshots remain in browser storage; this milestone does not add a backup-management UI. Each snapshot is a normal importable v1 JSON document. Storage exhaustion is reported instead of silently deleting previous snapshots. Clearing site data removes browser-local copies.

## Minimal for support

The inspected interpreter supported expressions, if/else, GPIO, virtual clocks and the DHT/Serial API, but no explicit loops. The new `for` AST node accepts a scalar declaration or expression initializer, optional condition/update, and a statement/block body. Compilation emits the existing enter/leave, expression, branch and jump instructions. It adds no native evaluation or new VM instruction.

Initializer variables have loop-local scope; the body gets a fresh scope each iteration. Nested loops and return cleanup work. Delays suspend inside the loop and resume at the exact next instruction. Infinite loops remain bounded by the existing instruction budget and return to the browser scheduler so Stop can be processed. A busy loop without a delay does not model CPU cycles or advance virtual time by instruction count.

`while`, `do`, `break`, `continue`, comma declarations/expressions, arrays and user functions remain unsupported. This is not a full C++ extension. No LCD, I²C, ADC, PWM, new ESP8266 example or external dependency was added. The solver, GPIO logic, DHT protocol adapter and millis implementation were not changed.

## Validation and manual exercise

`npm run verify` under Node 22.23.4 passed type checking, **435 tests in 53 files**, and production build before the final browser pass. The build retains the existing warning about a JavaScript chunk exceeding 500 kB. No existing numerical or state regression was found by these checks. Native layout and input behavior require browser execution; their result is recorded separately below.

New automated coverage:

- `src/app/ProjectLibrary.test.ts`: independent buttons/panels, retained right tab and component search, ES/EN, all three loads, reset and backup, dirty confirmation/cancel, and storage failure with a running simulation. jsdom requires a dialog API shim; native focus/layout are not established by this test.
- `src/model/exampleProjects.test.ts`: real mounted circuits, valid source, save/load and old-project compatibility, fresh templates, exact virtual LED times, calculated current, pin mismatch/disconnection, DHT environment changes and power/data/ground failures.
- `src/firmware/for.test.ts`: pulse trace, instruction-by-instruction suspension, nested/empty clauses, local scopes, return, infinite-loop budgets and invalid syntax.
- `src/features/examples/replacement.test.ts`: immutable snapshots and preservation failure.
- `tests/browser/projects.test.mjs`: desktop/mobile ES/EN layout, independent controls, viewport/DOM retention, three loaded examples, native confirmation/cancel, saved reload and actual playback. Screenshots are candidates for inspection, not automatically approved baselines. Existing workspace browser helpers now use the purple arrow when they intend to reopen right tools; they no longer use the repurposed top-left button.

Manual checks:

1. Run `npm run dev` with Node 22.12+. Click the top-left folder button. Toggle the purple arrow independently, switch right tabs, search components and resize the window. Closing Projects must release canvas space without changing its zoom or pan.
2. Open DHT11, accept pending-change replacement if prompted, then Start. Messages should show `Humedad: 50.00 %  |  Temperatura: 25.00 °C` after two virtual seconds. Edit live environment in the sensor inspector and allow the next sample. Stop, disconnect DATA (or power), then Start: the sketch must print its read failure. Reopening the template restores its original values and wiring.
3. Open LED with millis and Start: it begins off, turns on at virtual 1000 ms and off at 2000 ms. Pause freezes it; Stop clears outputs. Change the interval to 500 ms and rerun. Change the code pin without moving its wire and verify the LED stays off.
4. Open LED with for and Start: three 300 ms flashes start at 0, 600 and 1200 ms; the next sequence starts at 3300 ms. Inspect the actual for source in Code, change its repetition count, and rerun. Removing the return wire must prevent illumination.
5. Save an edited example, reload and verify that its circuit/sketch/environment remain edited. Open a fresh copy and verify template independence. A canceled unsaved-replacement dialog must retain the current circuit and execution.

Browser result: pending execution. No browser assertion or screenshot is reported as passed until the runner completes and candidates are inspected.
