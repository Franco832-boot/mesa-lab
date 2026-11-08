# Right tools toolbar correction

The split-panel button in `App.tsx` previously called `toggleInspector`, controlled `context-inspector` and was disabled without a component/wire selection. The right Components/Code/IoT panel already uses `useWorkspaceTools`' persisted `open` state, with first-visit defaults of open and Components. Those defaults and the preference decoder were retained.

The same split-panel button now calls the existing `toggleLibrary` handler shared with the purple arrow. Its accessible label/tooltip is **Mostrar/Ocultar panel derecho / Show/Hide right panel**; expanded/pressed state reflects the right panel and `aria-controls` points to `workspace-tools`. Its test ID is `tools-toggle`. There is no second open state, no tab mutation and no selection requirement.

The handler's mobile-only Inspector dismissal was removed, so neither right-panel toggle changes Inspector state. The now-unused toolbar-specific `toggleInspector` function and its exclusive label were removed. Inspector selection, close/expand controls and internal implementation are retained. Existing mobile selection/docking behavior outside these toggles remains unchanged. Project-folder state remains independent.

Files changed for this correction:

- `src/app/App.tsx`: retarget the existing control, reuse the right-panel handler, remove Inspector-toggle side effects/dead handler.
- `src/locales/{es,en}/messages.ts`: label the corrected control accurately.
- `src/app/ProjectLibrary.test.ts`: default open/Components, toggle without selection, tab retention, preference restoration, left/right and Inspector independence, unchanged canvas node and serialized circuit; desktop/mobile logical coverage.
- `tests/browser/projects.test.mjs`: native control/layout/viewport/Inspector assertions using the same browser harness.
- This report. Earlier interface-cleanup edits already in the workspace are retained.

No right-panel tab structure, sidebar implementation, circuit/persistence format, electrical solver, interpreter, sketch or LCD model was changed. The new code uses existing UI state and resizing behavior.

Validation: Node 22.23.4 `npm run verify` exited **0**: type checking, **508 tests in 58 files**, and production build passed. The existing >500 kB chunk warning remains (559.98 kB before gzip). Browser-file syntax checking and `git diff --check` also passed. Native-browser checks are authored but remain unexecuted in this environment; jsdom checks are not pixel/layout verification.

Manual check: open a fresh browser profile to see right tools on Components; select another tab, close/reopen with the split-panel button and check that the same tab returns. Select a circuit component, toggle right tools using both controls and confirm the Inspector stays in its current state. Close the Inspector with its X, toggle tools, and verify the Inspector remains closed. Toggle Projects independently and reload to verify saved choices. Observe that zoom, wire endpoints and component positions remain unchanged.
