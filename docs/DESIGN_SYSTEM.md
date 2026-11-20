# Los Profes Para Vos design system

This records the existing visual identity; Phase 3 extends it without redesigning the editor. `src/app/styles.css` remains authoritative.

## Colors and semantics

- Accent `--accent: #7659dc`; hover `--accent-dark: #6248c2`; selection wash `--purple-wash: #f1edfc`.
- Canvas/background `#f7f8fa`, white panels, text `#29333f`, secondary text `--muted: #8b929d`, separators `--border: #e6e8ed`.
- Green indicates saved/active states; amber indicates a warning; red indicates an electrical error. Always pair color with text or an indicator.
- Physical LED colors come from `ledColors` in the component registry. Wire colors are project data, default `#668c75`; color alone never determines connectivity, polarity, or voltage.

## Typography and spacing

Inter with system sans-serif fallback, base 13 px, weight 400. Small uppercase metadata and muted secondary text preserve the laboratory appearance. Numeric readings include units. Reuse existing compact controls and panel spacing, principally 4/8/12/16/24 px increments.

## Surfaces and layout

Fine one-pixel borders, modest rounded controls/cards, light shadows for panels and physical artwork. Reuse existing classes rather than introducing a UI framework. The header, editing toolbar, central SVG workbench, bottom diagnostics and footer retain the established styling. A right tool sidebar contains Components, Code and IoT tabs; the canvas stays mounted and visible. The sidebar collapses and resizes, with independent preferred widths for each tool. Component properties use a contextual floating inspector with an expandable body. At 760 px tools and inspector become mutually exclusive bottom sheets. New controls must wrap and fit a 320 px viewport.

## Selection and interactions

Purple outlines mark selected components and wires. Hover, focus-visible, pressed, selected, disabled and editing states must remain distinct. Keyboard focus uses a two-pixel accent outline with four-pixel offset. Disabled controls retain their labels. Pin targets derive from the same registry as SVG holes and wire endpoints. The shared scale remains four world units per millimeter.

## Electrical and simulation states

Editing/stopped, running and paused have explicit text labels. Structural changes require stopping. The engine supplies normal, active, warning and overheated conditions. The damaged condition is reserved; permanent damage is not produced. LED illumination and brightness use solved forward current only. Warnings use a small indicator and diagnostic text; calculated voltage/current/power appear with units. Unknown values are shown as unresolved, never zero by assumption.

## Animation and accessibility

Use short, subtle CSS transitions (existing controls use 150 ms). LED opacity changes may transition smoothly; resistor overheating may use subtle tint. No flashing, gratuitous smoke, or damage effect without an explicit electrical damage model. Electrical evaluation never depends on animation clocks. Under `prefers-reduced-motion: reduce`, remove transitions/animations. Provide text equivalents, semantic buttons, labels, pointer/touch access and keyboard activation for simulation controls.
