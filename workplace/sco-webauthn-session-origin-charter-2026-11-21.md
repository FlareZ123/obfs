# Preregistered SCO WebAuthn session-portability boundary (2026-11-21)

**Agent 10. Classification:** finite security-candidate decision experiment, not a new obfuscation backend.

## Question and falsifier

The existing source-pinned real-Chromium WebAuthn fixture already proves that an authenticator registered to RP `localhost` cannot be used to request a credential assertion at the distinct `127.0.0.1` browser origin, while allowed-origin hostile code can request one. Does that origin binding automatically remain an **execution restriction** after a successful assertion is exchanged for a conventional HttpOnly cookie authorizing server-resident SCO operations?

**Precommitted rejection criterion:** if an attacker with full DevTools/Node control copies a post-WebAuthn bearer cookie from the authorized browser and submits it over raw HTTP to `127.0.0.1` with a self-supplied `Host: localhost`, and the real `createScoHandler` accepts private RPC, then WebAuthn at session bootstrap has **not** supplied post-admission origin-bound execution locking. The honest same-origin operation must still succeed, the unauthenticated copied-origin request must fail, and a fresh WebAuthn assertion at the copied origin must still fail. This canary requires **actual server-private RPC** and zero source disclosure of the private method through public routes.

The alternate outcome is meaningful: if the copied session is cryptographically bound to an origin-enforced, non-exportable client capability and every private RPC verifies possession of that capability with independent server policy, the copied cookie alone should fail. Our preregistered conventional bearer construction does **not** have this stronger policy, so such an outcome would indicate an implementation or test inconsistency.

## Frozen trust assumptions

- SCO server, its WebAuthn verifier, session map, and private operations remain trusted.
- The attacker controls the authorized client environment and DevTools, can inspect the response and cookie store, and can emit arbitrary Node HTTP requests. The attacker cannot compromise the trusted SCO process or forge a WebAuthn signature.
- WebAuthn authenticator with required user verification is simulated using Chrome CDP (deterministic CI test only). Human interaction and physical authenticators are outside scope.
- Session cookie is intentionally a conventional bearer token, `HttpOnly; SameSite=Strict; Path=/`. Those browser flags prevent ordinary JavaScript cookie reads/cross-site automatic sends; they do not bind raw HTTP clients.
- SCO `allowedHosts=['localhost']` is intentionally configured to test its documented routing behavior. It is not intended as a cryptographic authentication gate.
- The SCO protected operation is server-resident and returns a deterministic result, so acceptance and denial can be compared byte-exactly.

## Required checks

1. Browser registration and independently verified WebAuthn assertion succeed at `http://localhost:<port>`; server checks challenge, RP hash, origin, UV/UP, ES256 signature.
2. Browser `document.cookie` cannot read the `HttpOnly` cookie; DevTools API can observe it, as allowed by the threat model.
3. Actual `createScoHandler` `/obfs/rpc` responds to a same-origin authorized request, with count of private operations observed.
4. Copied origin `http://127.0.0.1:<port>` cannot request the `localhost` WebAuthn credential.
5. Node raw request at copied origin without any bearer cookie is denied; copied cookie plus a forged Host header obtains the same authorized result with no additional WebAuthn ceremony.
6. Reuse of a successfully consumed WebAuthn challenge is refused; cookie misuse under the same authorization is deliberately not blocked by that one-time challenge.
7. No new per-commit workflow. Extend existing manual SCO authorization workflow; preserve green existing WebAuthn coverage and JSDoc. Keep this as intermediate bounded experimental evidence.

## Expected result and decision

The anticipated result is a counterexample to treating successful RP-bound admission as ongoing execution locking for subsequent bearer-authorized RPC. This does not invalidate WebAuthn origin binding or credential verification. Binding every private operation to a fresh signature, an externally enforced presence condition, or a trusted device would be an **additional design** with separate workload, relay, authorization, compatibility, and strict 2.5x compute tests. Existing same-account authorized relay remains an independent SCO limit.

Reference existing experiments:
- `im-results/sco-webauthn-origin-boundary-2026-11-19.md`
- `workplace/sco-webauthn-candidate-charter-2026-11-19.md`
- `workplace/sco-authorized-relay-stopline-2026-11-19.md`.
