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
