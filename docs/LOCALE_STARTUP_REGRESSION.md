# Locale startup regression investigation

## Evidence and fix

The entry point already had the correct provider order: StrictMode → Redux Provider → PersistGate → LocaleProvider → App. One root and one context definition were found; no removed wrapper or conflicting import path was found. A fresh browser reproduction is unavailable in this sandbox.

The old module combined context allocation, the provider component and the consumer hook. A retained provider and re-evaluated consumer can then use different context identities and throw the reported missing-provider error even when a provider remains in the tree. The installed Vite React plugin also invalidates refresh boundaries when non-component exports such as this hook change identity. This identifies an avoidable module-lifetime hazard, not proof that HMR caused the user's particular browser failure.

The context now lives in `src/locales/LocaleContext.ts`; the hook lives in `useLocale.ts`; `LocaleProvider.tsx` exports only the component. Consumers share the same context module. The missing-provider guard remains an error, rather than silently supplying default translations. The provider uses the explicit Context.Provider syntax. Storage keys, ES/EN dictionaries and locale behavior are unchanged.

`src/app/Application.tsx` contains the real provider hierarchy and App. `main.tsx` mounts that exact wrapper, so the integration test does not build an alternative test-only hierarchy. The root/provider order remains unchanged.

## Validation gate

- TypeScript passed.
- Production build passed.
- 267 tests passed, including independently evaluated locale-consumer modules and the missing-provider guard.
- The full Vitest command exited 1 because the new mounted integration test requires jsdom, which is unavailable. No mounted test passed yet.
- The three authored mounted cases cover real startup/rehydration and StrictMode, ES→EN→remount→ES preference persistence, and a fresh existing English preference.
- Browser startup remains unavailable: test worker/Vite launch restrictions prevent entering a browser. No browser runtime or visual pass is claimed.

`npm install -D jsdom @types/jsdom` failed in the sandbox with `EAI_AGAIN registry.npmjs.org`. Dependency availability is an external prerequisite. The user was asked to supply the packages locally. Multi-file editor implementation remains behind this startup validation gate.
