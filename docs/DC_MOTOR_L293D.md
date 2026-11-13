# DC motor, L293D and independent battery

## Architecture audit and staged plan

Source audit (2026-11-13), before implementation:

- The actual lexer/parser/VM already supports `pinMode`, `digitalWrite`, `millis`, unsigned arithmetic, variables, comparisons and `if`/`else`. Busy polling advances on a deterministic virtual loop quantum and yields within bounded slices. No native C++, `eval`, external compilation or external connections are required. Older simulation documents describe an obsolete interpreter.
- `analogWrite` and PWM peripherals are absent. Stage 2 PWM must schedule actual electrical states and retain peak diagnostics; a mean voltage is not an implemented PWM peripheral.
- `sim` is independent of React/Redux/DOM. Topology resolves wires, registered contacts and explicit breadboard attachments. DC uses bounded modified nodal analysis and LED active sets, partitioned into conductive islands. It does not provide dynamics, inductors, mechanical loads or back EMF.
- Boards have simulated USB power. Existing bench sources are ideal. A separate battery needs a series resistance and an internal node, without changing existing source behavior.
- Project v1 uses a discriminated component union, validated reconstruction and project-only persistence. New kinds are additive; old kinds/defaults must retain their roundtrip. DIP insertion requires extending the four-lead validation bound to sixteen.

Sequential gates:

1. Foundation/connectivity: register motor, battery and real DIP-16 L293D terminals at the existing 4 units/mm scale; validate defaults, JSON, geometry and breadboard insertion.
2. Minimum DC circuit: independent battery, resistive motor and supply-gated L293D channel through ordinary branches. Independently calculate current, voltage drop and battery sag. Verify missing supply/common ground and reversed supply before UI work.
3. Interactive models/conditions: two independent channels, both braking combinations, high impedance, supply/input faults, output shorts and overload diagnostics. Revalidate controls against loaded supplies; reject unsettled feedback rather than invent a state.
4. UI integration: catalog, compact bilingual inspector and result-driven shaft animation; honor pause, stop/reset and reduced motion. Put the existing site isotype and “Los Profes Para Vos” on the battery.
5. Educational project: UNO + breadboard + DIP + motor + 9 V battery, 5 V logic, shared ground, complete wires, actual nonblocking 3 s / 1 s / 3 s sketch. Keep all current examples.
6. QA/documentation: meaningful electrical, firmware, fault, persistence and browser tests; record actual outcomes and baseline failures. PWM remains a separately identified second stage.

## Model contract

The implementation and validation record below must describe executed behavior, including limitations. Animation alone is never evidence of a physical motor simulation.

Hardware reference: [Texas Instruments L293/L293D datasheet, revision D](https://www.ti.com/lit/ds/symlink/l293.pdf), pinout, supply/input ranges and output characteristics. Numerical approximations chosen for this simulator must be identified separately from datasheet limits.
