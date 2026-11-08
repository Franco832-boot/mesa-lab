# Focused interface cleanup

## Inspected controls and changes

- `App.tsx` owns the editing toolbar, folder button, help button and footer. `ProjectLibrary.tsx` already uses the shared sidebar shell; its existing X and responsive layout were retained.
- Projects now defaults to open through an additive `projectsOpen` field in the existing `mesa.workspace.preferences.v1` UI preferences. Old preferences retain their right-panel open state, tab and widths; an absent field defaults to true. An explicit false survives rerenders, project loading and application reload. Unchanged serialized preferences are not written again. Redux, circuit format and project migrations are unchanged. Storage-unavailable sessions retain usable in-memory preferences.
- The toolbar plus button was a persistent multiple-selection mode toggle, not an add-component button. It and its exclusive state, setter, prop forwarding and translation were removed. Shift/Ctrl/Meta pointer selection, Shift+Enter and existing keyboard shortcuts remain. Add-component, wire-point, zoom and sidebar expansion plus buttons are retained.
- `HelpDialog.tsx` now contains a short bilingual user guide using the existing `Dialog`. It covers navigation, components, cables, breadboard contact groups, templates, Arduino main.ino, simulation controls, Serial, DHT11, LCD and local save/export/import. Only implemented functions are described. Closing uses the existing X, Done, backdrop and native Escape handling. App-level Escape yields to an open dialog rather than also closing background panels. The existing compact mobile header still exposes the same dialog through the brand link where its help icon is hidden.
- The public roadmap list, footer link and Inspector's future-feature card were removed, together with their exclusive callback, translations and CSS. Technical Markdown roadmaps remain intact. No new panel or modal system was introduced.

## Files

Production changes:

- `src/app/{App.tsx,HelpDialog.tsx,styles.css}`.
- `src/features/tools/{preferences.ts,useWorkspaceTools.ts}`.
- `src/features/components/Inspector.tsx`.
- `src/features/project/useCircuitEditor.ts` and `src/features/workspace/{Workspace.tsx,useCircuitInteraction.ts}`: only removed mode-state plumbing; modifier selection remains.
- `src/locales/{es,en}/messages.ts`.

Tests and documentation:

- `src/app/ProjectLibrary.test.ts`: first visit, folder/X/right-arrow independence, persisted close and no redundant preference write, both guide languages and closing paths, unchanged circuit data, remaining toolbar controls and Shift selection. Existing template loading checks remain.
- `src/features/tools/preferences.test.ts`: legacy UI settings and the new default/explicit preference.
- `src/features/components/ContextualInspector.test.ts` and `src/features/workspace/Workspace.test.ts`: removed exclusive props from test callers; existing assertions retained.
- `tests/browser/{projects,lcd}.test.mjs`: opening helpers respect either panel state. Project cases assert first-visit open, close/reload persistence and native guide dismissal in both languages and screen sizes.
- This report. No technical roadmap Markdown was deleted or rewritten.

## Validation

Node 22.23.4 `npm run verify` passed TypeScript, **505 tests in 58 files**, and production build. Following the final dialog/Escape guard, the two application test files passed **18 tests**, and type checking passed again. The final full release run is recorded below. The existing >500 kB production-chunk warning remains; no dependencies were added.

The new guide test initially forbade all mentions of a plus button, incorrectly including the preserved add-component action. Its check was corrected to cover the navigation instructions specifically; the actual removed toolbar control is separately checked. Existing circuit, interpreter and electrical assertions were not weakened. Catalog-opening helpers were updated for the requested initial-open behavior rather than clicking hidden buttons in jsdom.

`git diff --check` and syntax checks of both edited browser files passed. Source scans found no remaining public roadmap callbacks, labels, list or card styles. Files under `src/sim`, `src/firmware`, Arduino examples and circuit persistence were not modified.

Native browser execution and screenshot review remain unverified in this environment. Authored browser checks are not reported as passes. jsdom uses its existing dialog API shim and cannot establish native focus trapping or pixel layout.

Manual check: visit in a private window, close Projects with X, toggle it with the folder and reload. Its closed state should remain while the purple arrow controls only right tools. Open the question-mark guide, switch ES/EN, and close with Escape. Select multiple components with Shift and confirm that the remaining plus buttons still add components/points or zoom. Open an existing template and run it normally.

Final release run: `npm run verify` exited **0** with **505 passed tests in 58 files**, successful type checking and production build. The existing chunk-size warning remains (560.24 kB before gzip). Native browser checks remain unexecuted; no screenshot baseline was created or approved.
