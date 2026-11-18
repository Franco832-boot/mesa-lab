# Account and cloud project integration

The React application calls `https://losprofesparavosback.onrender.com` through RTK Query. The business routes have no `/api` prefix. [backend.openapi.json](backend.openapi.json) is the public OpenAPI document retrieved during the initial inspection on November 17, 2026; it matched the local Nest controllers and DTOs. No backend, database, migration, private environment variable or deployment was changed.

## Existing HTTP contract

| Operation | Access | Request | Success |
| --- | --- | --- | --- |
| `POST /auth/register` | Public | `{ email, password }` | 201, authentication response |
| `POST /auth/login` | Public | `{ email, password }` | 200, authentication response |
| `GET /auth/me` | Bearer JWT | None | 200, public user |
| `POST /projects` | Bearer JWT | `{ name, data }` | 201, project |
| `GET /projects` | Bearer JWT | None | 200, array of owned projects |
| `GET /projects/:id` | Bearer JWT | UUID v4 path parameter | 200, owned project |
| `GET /tasks` | Bearer JWT | None | 200, array of owned tasks |

Authentication returns `{ accessToken, tokenType: "Bearer", expiresIn, user }`. Users have `id`, `email`, `createdAt`. Projects have `id`, `userId`, `name`, `data`, `createdAt`, `updatedAt`. Tasks have `id`, `userId`, `title`, `completed`, `createdAt`. Dates are strings on the JSON wire. There is no pagination envelope. Lists are ordered by descending creation date and ID by the backend.

The backend's errors have `{ statusCode, message, timestamp }`; `message` may be a string or string array. Expected statuses include 400 for invalid DTO/JSON/UUID, 401 for invalid authentication, 404 for missing or foreign projects, 409 for an already registered email, 413 for the HTTP body limit, 415 for unsupported encoding, 429 for authentication rate limits, and 500 for internal failures. Connection, timeout and incompatible-response failures receive local, typed Spanish/English messages; raw server content is not rendered.

Email is normalized by the backend. Both credential endpoints require a 12–128 character password without trimming it. Project names are trimmed and must have 1–120 characters. `data` must be a JSONB-compatible object, at most 262,144 UTF-8 bytes and depth 64. The default HTTP body limit is 524,288 bytes. Those are backend source defaults, not measurements of Render's private configuration.

There are **no project update/delete endpoints, task write endpoints, token refresh endpoint or server logout/revocation endpoint**. The frontend implements none of them.

## Redux and secret handling

`baseApi.ts` defines one RTK Query API. `authApi.ts`, `projectsApi.ts` and `tasksApi.ts` inject their endpoints into it. The existing `createAppStore` attaches its reducer and middleware alongside the transient `auth` slice. No additional application store is created and no dependencies were added.

Each store owns an `ApiRuntime` supplied through thunk's extra argument. It contains the JWT in memory, request cancellation controllers, the expiration timer and creation guards. Passwords exist only in the active form and temporary request handling. Authentication submissions use an opaque request ID as the RTK Query argument; the credentials are consumed from a temporary map, not dispatched as Redux payloads. Authentication results cache only the explicitly mapped public user. Request/response metadata, which can retain authorization headers or request bodies, is stripped before returning from the base query. Production Redux DevTools integration is disabled.

Protected requests use `Authorization: Bearer ...`. Cookies are omitted, redirects are rejected and requests have a 20-second timeout. There is no retry wrapper, automatic refresh or automatic upload. Signing in enables the authenticated user, project and task reads. A page reload requires signing in again.

Logout, expiration and protected 401 responses clear the token, public profile, staged credentials, private RTK Query cache, creation guards and timers. Pending requests are aborted. A per-session epoch rejects late responses; ownership checks additionally reject project/task responses for another user. An aborted request does not prove that a server-side write was cancelled. Logout is local: the backend cannot revoke a previously issued JWT before its expiry with the currently available endpoints.

## Local data and explicit cloud actions

Redux Persist still wraps only `project`, with `whitelist: ['document']`, version 1 and the original storage/recovery behavior. Its keys and existing migrations are unchanged. Authentication, API cache, simulation state and history are not persisted. No new migration, purge or local deletion was introduced. The project document remains the only editable circuit.

**Save** keeps its existing local behavior. **Save a cloud copy** is an independent authenticated action. It validates the existing portable project format using the existing serializer/parser, checks JSONB compatibility and counts compact JSON UTF-8 bytes before sending `{ name, data }`. Oversized projects remain usable locally; the local 2 MB limit is not reduced. The cloud name is separate metadata and does not rename the local document. The dialog explains that the complete document includes its source files and any credentials the user wrote in those files.

The Projects panel labels local and cloud projects separately. Opening a cloud project requires a fresh `GET /projects/:id` followed by explicit confirmation. Generic JSONB is not assumed to be a valid simulator document. The existing replacement flow validates it and writes a verified immutable backup of the current project before resetting the workspace or replacing its document. Validation or backup failure leaves the current document and simulation untouched. Opening is disabled while the simulation is running or paused.

The remote UUID identifies the API record; the document's own `data.id` remains a local document ID. Opening does not bind local edits to a remote record or create an automatic synchronization relationship.

Downloaded copies are explicitly saved locally, as the dialog explains. They and the pre-existing local projects **remain after logout**. This browser's existing local project library is not isolated by account; logout removes private account/cache data, not user-approved local documents and backups.

## Duplicate prevention and uncertain writes

A store-wide guard and a synchronous form guard prevent simultaneous submissions. Every explicit creation attempt first lists owned projects. An identical name and document reuse the existing record; comparisons sort object keys because JSONB can reorder them, but retain array order and every document field.

If a POST has an uncertain outcome, the application does not resend it automatically. An explicit subsequent attempt reads again and returns an existing matching record if found. If it cannot confirm that uncertain write, it blocks another identical POST in that session and asks the user to inspect cloud projects.

This is not server idempotency. The backend always creates a new UUID on POST and has no unique document constraint. Simultaneous browser tabs/devices, changing the copy name, and restarting the session after a lost response can still create duplicates. No deletion or update is attempted to compensate.

## Verification boundaries

The new API and mounted UI unit tests use fictional credentials and in-memory fetch responses. They start no HTTP server, run no Chrome instance and send no requests to Render or Neon. They exercise the real Redux middleware, serializers, forms and existing replacement/backup flow. They do not establish production JWT cryptography, PostgreSQL durability, deployed user isolation, CORS or browser layout.

Postman Simulation and its dependent browser tests were removed at the user's request. The earlier local simulator was stopped; it served zero requests. No browser integration result is claimed.

Type checking, unit tests and the production build are run with Node 22.23.4. Authenticated production integration and browser validation remain pending. No test account was created in production, no project was uploaded to Neon, and no deployment was performed.

The full unit suite also contains failures reproduced from the original HEAD (`d1979b0cb5ec9672b7eaeea4d4b24c24e8dbc278`) in a separate `/tmp` checkout: project-library selection/message expectations (3), LCD template branding/character expectations (7), inspector markup assertions (2), and sidebar markup assertions (2). These failures must not be reported as passing or as introduced by the account integration.

### Final checks, November 17, 2026

| Check | Actual result |
| --- | --- |
| `npm run typecheck`, Node 22.23.4 | Passed |
| `npm run build`, Node 22.23.4 | Passed; Vite warns about the approximately 753 kB main JavaScript chunk |
| New API and mounted UI tests | 31 passed: 10 authentication/session, 12 project/task/document, 9 mounted account/cloud UI |
| Focused account/store/application regression run | 47 passed before the final documentation/copy changes |
| Full `npm test -- --maxWorkers=2` | 690 tests: 676 passed, 14 failed; all remaining failure names also fail in the pre-integration checkout |
| Authenticated production integration, browser layout and CORS | Not executed; pending |

The earlier sandbox run blocked five existing ZIP tests with `spawnSync python3 EPERM`; the approved repeat of the unit suite outside the sandbox passed those checks. A default parallel run also timed out in an existing project-reopening test; that test passed in isolation and in the final run with two workers. No test timeouts or application behavior were changed to mask failures. The final checks launched only unit-test processes, including Python's ZIP reader; they started no API test server or browser and wrote no production data.
