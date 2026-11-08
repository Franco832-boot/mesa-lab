# ESP8266 web view and security review

## Pre-change audit (2026-11-08)

The existing Phase 2B VM, firmware HTTP dispatcher, GPIO/DC solver, project files and bottom Serial monitor are retained. No new server, backend or interpreter is needed.

The usability issue is structural: `EspProjectEditor` mounts `EspWebPreview` only when the HTML **file editor** section is active. Availability/automatic opening is detected inside that mounted component, so a user starting from Main/Components never sees it. The existing sidebar can also close on mobile Code selection. The fix is a separate transient Web view tab, an always-mounted lifecycle observer and a once-per-run reveal action using the existing panel.

Existing security boundaries: inert-template HTML parsing; opaque sandbox iframe without same-origin/forms/popups/navigation/download privileges; restricted CSP; classic project JS in a dedicated Worker; sealed native network globals/prototypes; source/origin/token checks and a runtime session identity. The firmware, Redux project and electrical model remain outside the guest.

Gaps to address before claiming the web view verified:

- No per-second request budget, request timeout or explicit resource/body/node limits beyond project storage limits.
- Native Worker CPU loops can continue until the page is closed; no external heartbeat watchdog exists.
- Worker bootstrap internals share lexical scope with appended project JS, and raw Worker postMessage is available.
- Message validation accepts extra keys and has only a lifetime counter.
- HTML uses a blacklist, CSS is passed through, script CSP permits all inline/blob script, and font-src is implicit.
- Previous browser coverage is a useful baseline, but does not cover the full requested threat matrix or alternative GPIO projects.

The incremental design keeps the current opaque iframe + Worker, adds a per-page script nonce and passive markup/CSS allowlists, isolates bootstrap closures, seals raw message/network/storage entry points, limits resources and message rates, and terminates a Worker that fails heartbeat deadlines. Browser CSP and sandbox remain independent boundaries; JavaScript replacement/sanitization alone are not considered sufficient.

Native JavaScript allocation and browser rendering do not offer hard per-guest memory quotas. A Worker can be terminated during an ordinary infinite loop, but a sudden allocation/browser-engine failure may still affect its renderer. This residual risk must remain explicit. Stronger hostile multitenant memory containment would require a separately served origin with process/resource isolation or a metered JS VM with enforced heap/fuel limits, verified against the same tests. No such backend/process or complete JavaScript VM is introduced here.

## Implemented boundary and permitted operations

The audit above describes the original gaps. The current source addresses them incrementally, using the existing firmware HTTP dispatcher rather than a second server:

- `EspWebPreview` observes server readiness even while source editing is active. Web view is a transient utility, separate from `index.html`; the panel reveals once per run. Refresh/reopen creates a fresh cryptographic page token and script nonce. Stop, pause, board change or loss of WiFi disposes the page; the runtime independently checks its firmware session.
- Project markup is parsed in an inert template. Only passive HTML elements/attributes survive; active embeds, URL-bearing resources and inline handlers are removed. User code never enters the application's DOM. CSS is parsed with an allowlist of static properties and bounded rules/declarations; imports, fonts, URL functions and dynamic constructs are excluded.
- The frame uses only `sandbox="allow-scripts"`, an opaque origin and no referrer. It grants no same-origin, forms, popups, top navigation or downloads. Trusted bootstrap runs in the iframe; project classic scripts run in a dedicated Worker whose private kernel is closed over separately.
- The web facade supports local GET fetch with status/ok/text/json, language, element lookup, textContent writes and simple click/input/change events with value/checked. Trusted fixed-local GET forms and links show the actual virtual response. Full DOM, modules, arbitrary network, POST/query form submission and general framework compatibility are unsupported.
- Worker native network/storage/messaging constructors and their reachable prototype entry points are sealed before user code. Child Workers/importScripts, sockets, XHR, EventSource, beacon-related access and privileged navigator APIs are unavailable. The allowed fetch is a bounded virtual bridge, with no native-network fallback.
- The parent accepts only the expected frame window, opaque `null` origin, current random 128-bit token, exact message keys and local path. IDs must be safe positive integers; replayed IDs, extra operations, external/traversal paths and old run/page identities are rejected. Only the current board's HTTP capability is exposed, never Redux actions or project objects.

## CSP applied before active content

| Directive | Value / purpose |
| --- | --- |
| default-src | `'none'` |
| script-src | Per-page nonce, trusted bootstrap only; no unsafe-inline/eval or general blob scripts |
| worker-src | `blob:` for the isolated project Worker |
| style-src | `'unsafe-inline'` for sanitized local CSS |
| connect-src, img-src, font-src, media-src | `'none'` |
| frame-src, object-src | `'none'` |
| form-action, base-uri | `'none'` |

CSP and sandbox enforce browser restrictions independently of API overrides and markup filtering. No local or external IP opens a real server or network request. Worker APIs are sealed as an additional boundary; successful isolation is not inferred solely from failed responses.

## Resource and lifecycle bounds

`webPreviewProtocol.ts` defines UTF-16 code-unit limits: HTML 96,000, CSS 32,000, JS 64,000, combined 192,000; 16 resources, 1,000 nodes, 256 CSS rules, 1,024 declarations and nesting 3. Paths are at most 256 characters; text updates 8,192 and errors 512. Each page permits 512 HTTP requests, 30/second, at most 16 pending, with a 3-second response deadline. The bridge also limits all message traffic to 240/second and 10,000 total. These are educational bounds, not browser-engine memory quotas.

The trusted shell pings every 250 ms and terminates a project Worker after a 2-second missing heartbeat, covering ordinary initial/event-handler infinite loops. Disposal clears timers and listeners and terminates pending guest execution. Firmware remains on the existing bounded, cancellable interpreter, not native C++ or eval. Cooperative while loops advance virtual time by a 1 ms scheduling quantum per completed iteration; explicit delays also use virtual time.

## Evidence, failures and remaining release work

Existing Chrome tests instrument request-attempt events and request routing, sockets, popups and downloads. Safety aborts do not count as success: tests require zero forbidden request attempts. Probes cover parent/storage/Redux access, native/prototype network capabilities, injected resources/CSS/forms, iframe sandbox/CSP, forged messages and stale sessions, CPU loops, resource floods and timeout cancellation. These are authored tests; only completed runs are evidence.

The original Phase 2B selection passed 24/24. An expanded selection later reported 16/18 with two test-design failures (non-deterministic sequential rate flood; a transport-drop listener installed too late). The flood was corrected to concurrent requests and passed its focused check. The corrected dropped-response case passed in the later 5/5 Chrome run, alongside four ES/EN desktop/mobile actual Web view cases. No completed final result is available for the whole expanded matrix after all changes. The latest broader invocation was interrupted; it is not counted. Testing is frozen at the user's request; no further execution is authorized without consultation.

The final editor-only removal of Serial navigation and explanatory banners changes none of these security boundaries. It was reviewed in source; updated UI assertions have not been executed. The phase's latest production build and complete hardened-security/updated-WiFi browser matrix remain unverified. A finite approved validation is still required before declaring the latest source ready for beta publication.

Residual risks: no enforced heap quota for native JS allocations; pathological rendering/CSS or browser-engine defects can affect the renderer; timers can be throttled in background tabs. A watchdog bounds ordinary Worker loops, not every resource-exhaustion attack. The separate-origin/process-isolation or metered-VM proposal above remains a future hardening option, not an implemented guarantee. No absolute security claim is made.
