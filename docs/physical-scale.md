# Shared physical scale

The workbench uses **4 world units per millimeter** at 100% zoom. `WORLD_UNITS_PER_MM` in `src/model/physical.ts` is the sole physical representation scale. Zoom then scales everything together without changing relative component proportions.

## Earlier scale discrepancy

Artwork was originally created on independent canvases: UNO 350×272, NodeMCU 166×318, breadboard 450×150, LED 75×100 and resistor 130×45 SVG units. The catalog used these as world sizes, making a long breadboard almost as wide as UNO and small components disproportionately large.

The `viewBox` includes leads, margins and shadow space; it is not a physical body measurement. Per-component CSS widths would have hidden the discrepancy without fixing terminals.

## Models and dimensions

| Component | Physical reference | Nominal body | Body size at 100% |
| --- | --- | --- | --- |
| Arduino UNO R3 | UNO R3 PCB | 68.6 × 53.4 mm | 274.4 × 213.6 units |
| NodeMCU ESP8266 | DevKit v1.0, ESP-12E | 25.4 × 48.26 mm | 101.6 × 193.04 units |
| Breadboard | BB830 format, 830 contacts | 165.1 × 54.6 mm | 660.4 × 218.4 units |
| LED | T-1¾, Ø5 mm lens | 5.9 mm base × 8.6 mm height | 23.6 × 34.4 units; Ø20 lens |
| Resistor | Axial CFR-25, ¼ W | 6.3 × Ø2.4 mm | 25.2 × 9.6 units |

The selected breadboard has 63 columns of ten contacts and four rails of 50: 630 + 200 = 830. It does not represent a mini or 400-contact breadboard. The graphic design remains original Mesa artwork.

The [vector scale comparison](physical-scale-reference.svg) is generated with the editor's component SVGs and allows proportion review without a server. It is a static reference, not a browser interaction test.

Nominal sizes are also recorded for generic components: a 6×6 mm pushbutton, Ø10 mm round trimmer and 90×60 mm virtual supply enclosure. These are the application's catalog variants; the supply does not reproduce a particular commercial instrument.

LEDs and resistors use shortened leads for assembly. Body dimensions exclude those leads; the full drawing length is not confused with package size. All four LED colors share the same visual package. Their electrical behavior belongs to the independent simulation model rather than geometry.

## Conversion and alignment

Each definition records:

- Nominal physical dimensions and model name.
- `sourceBody`: body outline in the original artwork.
- `sourceViewBox`: complete visual extent, including leads and margins.
- Original terminals (`sourcePins`) and normalized local positions (`pins`), calculated once.

The conversion is:

```text
s = 4 × physical_width_mm / artwork_body_width
p_local = (p_artwork − artwork_body_origin) × s
p_world = position + rotation(p_local)
p_screen = offset + zoom × p_world
```

**The same factor `s` applies to X and Y.** Converting artwork into physical units does not introduce a second world scale. Body outlines were calibrated using their nominal dimensions; details are not distorted through `scaleX`, `scaleY` or per-component CSS widths.

UNO, NodeMCU, breadboard and LED leads use a nominal 2.54 mm pitch where applicable. NodeMCU geometry incorporates rows at ±11.43 mm from center and the original footprint coordinates. SMD details, decorative traces and materials remain illustrative; this is not manufacturing CAD.

Selection and Fit to screen use normalized visual bounds so leads are not clipped. Rotation uses the physical body center. Wires and connection targets use the same local positions produced by the SVG transformation.

Library thumbnails fit their cards and are catalog previews. All workbench components use the same global physical scale. CSS units do not calibrate a monitor's physical millimeters: the model guarantees proportions, not a 1:1 print size on every display.

## Earlier projects

Portable `mesa-circuit` JSON v1 and Redux Persist container v1 are retained because persisted structure did not change. Dimensions are derived from definitions rather than stored per instance. Loading an older file preserves identifiers, positions, rotations, properties, routes and code. Recovery does not multiply or transform the document.

Endpoints are recalculated using their identifiers and current physical geometry. Artwork changes size but wires stay attached to terminals. Intermediate waypoints retain world coordinates; an older assembly may need component rearrangement after the size correction. Routing does not automatically avoid obstacles.

## Sources

- [Arduino UNO Rev3 official specifications](https://store-usa.arduino.cc/products/arduino-uno-rev3).
- [Original NodeMCU DevKit v1.0 footprint](https://raw.githubusercontent.com/nodemcu/nodemcu-devkit-v1.0/master/ESP12E_DEVKIT.lbr): outline at ±12.7 and ±24.13 mm; terminals at 2.54 mm pitch.
- [BusBoard BB830 manufacturer datasheet](https://www.busboard.com/documents/datasheets/BPS-DAT-%28BB830%29-Datasheet.pdf).
- [Kingbright WP7113ID T-1¾ 5 mm package](https://www.kingbrightusa.com/images/catalog/SPEC/WP7113ID.pdf).
- [Yageo CFR ¼ W axial body](https://yageogroup.com/content/datasheet/asset/file/YAGEO-CFR_DATASHEET).

## Verification

Vitest checks dimensions, uniform scale, relative proportions, terminal pitch, SVG→world conversion, pan, zoom 0.3–5, rotations, wires, history and older document recovery. Maximum zoom was expanded to 500% to inspect small parts and silkscreen while retaining the global scale. The editor acceptance test creates and recovers a complete assembly with ESP8266, breadboard, LED and resistor.

Interactive browser review remains pending: previous attempts to start Vite failed with `listen EPERM`. Numerical tests are not presented as visual or touch validation.

## Insertion footprint correction

The interaction fix preserves every physical body size and the shared scale. Generic passive insertion endpoints now match BB830 pitch exactly: the axial resistor spans four 2.54 mm intervals, the trimmed LED leads terminate on a common plane at one interval, the trimmer's three leads use one interval each, and the tactile switch uses a three-by-two-interval footprint. Artwork metal leads derive their endpoints from the registry. These are the modeled insertion footprints, not a claim that every commercial part of the same nominal body fits this breadboard.

Rigid placements must align all leads, use distinct free holes and fit a supported orientation. The center channel and missing rail holes are respected by actual hole lookup; there is no invented continuous rectangular grid. A 90-degree switch orientation can bridge the three-interval center gap. Body clearance and mechanical collisions beyond hole occupancy are not modeled.
