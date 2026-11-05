# Engineering responsibilities

Roles are review responsibilities, not a runtime framework.

| Role | Responsibilities |
| --- | --- |
| Architecture Agent | React/TypeScript architecture, Redux boundaries, single authoritative document, persistence, migrations, memoization, performance, Phase 4 integration boundaries. |
| Electronics Agent | Circuit topology, physical contact groups, electrical models, GPIO mapping/limits, reference nodes, physical assumptions, indeterminate outcomes and fault conditions. |
| UI/UX Agent | SVG accuracy, shared physical scale, existing visual identity, responsive layouts, keyboard/touch accessibility, result-driven animations and reduced motion. |
| QA Agent | Independent electrical expectations, unit/integration/browser tests, persistence compatibility, visual regression review and truthful validation reports. |
| Coordinator | Enforce shared standards, sequence milestone gates, review cross-domain changes, resolve conflicts, verify acceptance criteria and record unresolved limitations. |

When delegating, give each agent a bounded ownership area and an explicit contract. Validate each milestone before beginning the next. The coordinator owns integration and final verification. No role may silently approximate unsupported behavior or approve an unreviewed screenshot baseline.
