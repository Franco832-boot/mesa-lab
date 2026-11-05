# Mesa Lab engineering standards

These rules apply throughout this repository.

- Keep TypeScript strict, including unchecked index access and exact optional properties. Use `.ts` for domain logic and `.tsx` for JSX.
- Avoid `any`, unsafe assertions, duplicated logic, and unnecessary dependencies.
- Keep `src/sim` independent of React, Redux, browser globals, and DOM APIs.
- The Redux project document is the authoritative circuit. Do not keep a second editable document.
- Persist project data only. Simulation results, status, events, GPIO overrides, button presses, and derived conditions are transient.
- Preserve JSON serialization, Redux Persist migrations, undo/redo, and old project fixtures. Change formats only with explicit migrations and tests.
- Maintain typed Spanish and English messages for every user-facing addition. Write internal documentation and instructions in English.
- Preserve the existing visual identity, SVG scale, physical pin registry, and working editor behavior. Fix Phase 2 only where it blocks Phase 3.
- Prefer small, modular, reusable solutions. Electrical calculations belong in the engine; SVG and React render results.
- Validate functionality with meaningful, independently calculated electrical tests, type checking, and a production build. Use browser tests when execution is available.
- Complete and validate milestones in sequence: foundation, connectivity, DC solver, interactive models, UI integration, conditions, QA/documentation.
- Never report incomplete, mocked, unsupported, or unexecuted functionality as implemented or verified. Record limitations and failed validations.
- Warnings do not imply permanent damage. Never invent voltage/current for indeterminate circuits. Document model assumptions and bounds.
- Respect reduced motion, accessible controls, and deterministic reset behavior.

Use the responsibilities in `docs/AGENT_ROLES.md` as review checklists. Actual delegation is optional when supported and useful; an autonomous agent framework is outside scope.

Quality gates: `npm run typecheck`, `npm test`, `npm run build`, and browser checks where available. Use Node 22.12+ (the environment also has Node 18, which is unsupported).
