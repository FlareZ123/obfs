# WebAuthn admission versus bearer-authorized SCO operation origin (2026-11-21)

**Agent:** 10  
**Classification:** intermediate architecture rejection experiment with real Chromium + real SCO RPC; no standalone security guarantee.  
**Preregistered question:** [charter](../workplace/sco-webauthn-session-origin-charter-2026-11-21.md).

## Question

Does WebAuthn credential RP/origin checking automatically restrict **subsequent server-private SCO operations** to the original browser origin when a successful WebAuthn assertion bootstraps a conventional bearer session?

The experiment extends Agent 5's independently verified browser WebAuthn origin-boundary fixture by placing a genuine `src/sco.js::createScoHandler` private operation behind a post-WebAuthn HttpOnly, SameSite=Strict cookie. It tests the same registration, authentication, and private server method under normal browser use and an attacker who controls the client/DevTools.

## Frozen construction

- Node 22 creates a trusted HTTP server on a loopback ephemeral port, with WebAuthn relying-party ID `localhost`.
- Chrome CDP installs a `ctap2` virtual authenticator requiring and supporting user verification. Real browser `navigator.credentials.create/get` APIs generate the registration and fresh assertions.
- Node verifies registration clientData `type`, challenge and exact origin, stores the generated public key, then verifies assertion challenge, RP hash, UP/UV flags and ES256 signature.
- Every accepted authentication consumes its challenge and creates a new cryptographically random, 256-bit session token in a trusted server-side set, returned solely as `Set-Cookie: webauthn_session=<token>; HttpOnly; SameSite=Strict; Path=/`.
- The same HTTP server routes `/obfs/rpc` to a live `createScoHandler` instance with `remoteMethods.protectedSum` residing only in server memory. Its `authorizeRpc` accepts only a currently registered session cookie; `allowedHosts=['localhost']` is configured to exercise the documented Host-routing filter, without elevating that header to authentication.
- The emitted public facade is served separately. The probe confirms it does not expose private RPC source strings.
- The copied-origin attacker reads the cookie through the browser debugging API and constructs an independent raw Node HTTP request to `127.0.0.1`, supplying its own `Host: localhost:<port>`. The test never asks the attacker to forge a WebAuthn signature.

The trusted server, registered authenticator public key, user-verification flag, challenge map, session authorization and private method remain outside attacker control. This is the repo's SCO **client-control** attacker, not the SNO compromised-server attacker. Loopback + virtual authenticators serve as a deterministic browser test. No claim about a real user's hardware device is made.

## Evidence

**Focused reproducible build:** [manual SCO ratchet WebAuthn-only run 44876677945](https://github.com/FlareZ123/obfs/actions/runs/44876677945), source pin `77a98d2420cace048e15dffb96e027acd82ba3c3`, Linux Node v22.23.5 and Chrome. The focused run passed the integrated real browser test and both strict JSDoc gates. The original broader [Linux+Windows SCO ratchet suite 44876365045](https://github.com/FlareZ123/obfs/actions/runs/44876365045) also passed on an earlier branch source pin `094f7588435d75c626173adb38b41b178ea74e37`, before adding the explicit assertion-replay, private-source separation and revocation checks.

The exact source-pinned final browser JSON canaries are:

| Probe | Observed |
| --- | --- |
| Honest RP-bound assertion | accepted |
| Hostile code at authorized origin obtains fresh UV assertion | accepted |
| `127.0.0.1` origin requests `localhost` RP credential | browser `SecurityError` |
| Authenticator is configured not user-verified | browser `NotAllowedError` |
| Reuse a consumed WebAuthn assertion | HTTP 403 |
| Browser `document.cookie` sees the HttpOnly token | false |
| Debugger/browser context can export that token | true |
| Authorized browser calls real private SCO RPC | HTTP 200 |
| Copied-origin raw HTTP RPC without token | HTTP 403 |
| Copied-origin raw HTTP RPC with exported token and spoofed Host | **HTTP 200**, identical private result |
| Served public facade exposes private RPC source strings | false |
| Copied-origin raw HTTP RPC after server revokes token | HTTP 403 |

Exactly two protected RPC calls executed in the success lane, one from the honest browser and one from the copied-origin raw client. Forbidden calls and replay did not increment the private execution counter.

The actual test is `test/sco-webauthn-origin-boundary-browser.js`. The default `.github/workflows/manual-sco-ratchet.yml` continues to run the full suite; an opt-in `webauthn_boundary_only` dispatch input selects this reproducible browser-and-JSDoc gate without running the expensive unrelated ratchet experiments. No per-commit workflow was added.

## Interpretation

This construction separates a **real origin-bound credential enrollment/authentication boundary** from the subsequent **session authorization boundary**. WebAuthn rejects copied-origin RP credential requests. Once a bearer cookie is minted, the server's ordinary cookie gate no longer checks a cryptographically authenticated client origin. Host headers and cookie bytes can be supplied by the copied client. Browser HttpOnly and SameSite flags constrain *browser script access* and *automatic cross-site browser sending*; they cannot enforce those same restrictions on a raw attacker-controlled HTTP client that already has the token.

The result rejects the proposal that WebAuthn **once at login plus a normal bearer session** is sufficient for permanent SCO origin-locked execution under the defined hostile-client model. It does not reject WebAuthn for login admission, prove a signature forgery, bypass the verification algorithm, or grant another account's authority. The final revocation check shows the copied credential remains dependent on the legitimate trusted server and its session policy.

Even issuing fresh assertion proofs for every protected operation would change the architecture and performance tradeoffs. It can prevent this particular *offline bearer-cookie portability* if every RPC is bound to a one-use challenge and payload digest; it cannot stop a same-account attacker who can satisfy the WebAuthn ceremony and relay allowed operations online. This conditional mitigation requires a **separate** preregistered test and full compute/session cost measurement, not security credit from this negative result.

The explicit strict 2.5x compute budget was not measured for the WebAuthn ceremony, cookie handling or RPC in this fixture. Security and performance remain separately evaluated, and the project release gate stays **RELEASE-BLOCKED**.

Related prior work: `im-results/sco-webauthn-origin-boundary-2026-11-19.md`, `im-results/sco-webcrypto-proof-of-possession-2026-11-19.md` and `workplace/sco-authorized-relay-stopline-2026-11-19.md`. Their prior conclusions are preserved; this test adds a source-pinned integration with the *actual* SCO authorization handler and explicit cookie revocation/portability controls.
