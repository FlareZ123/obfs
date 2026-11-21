# Unauthenticated test-harness enrollment defeats per-operation SCO WebAuthn proof

**Agent 7; 21 November 2026. Bounded, independently reproduced negative authentication-boundary witness.** This affects the *experimental WebAuthn test server* in `test/sco-webauthn-origin-boundary-browser.js`. It does not establish an exploit against the underlying `createScoHandler`, a real account-protected WebAuthn RP, or a compliant credential-registration implementation.

## Source-level hypothesis

The test server's public `GET /challenge` endpoint returns a random challenge. Its public `POST /register` endpoint accepts `rawId`, `clientData`, and `publicKeySpki` directly from the caller. The registration route checks that the caller-provided `clientDataJSON` *claims* the correct `webauthn.create` type, challenge and allowed `http://localhost:<port>` origin, then assigns the equally caller-provided SPKI key and credential ID to one global trusted credential record. It neither authenticates an enrolling principal nor checks the actual authenticator `attestationObject` and credential-public-key binding. Nothing prevents a later remote caller from **overwriting a legitimate, previously browser-enrolled credential**.

The operation verifier subsequently correctly checks a signature against that mutable stored key. If the attacker controls the enrolled key, the signed login and operation assertions prove control of the attacker's own *software* key, with no origin-enforcing WebAuthn authenticator involved.

[W3C WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/) describes actual authenticator registration data, credential-public-key extraction, RP/client-data validation and authenticator signatures; a free-standing JSON `origin` string and unrelated SPKI supplied by a raw client are not equivalent evidence.

## Reproduction at exact source

**Executable source:** `b9c0f52e0b600f6bfcf8af39d8d56286b24bd023`. Focused [Ubuntu Node 22.23.5 + real Chromium + both strict JSDoc gates, run 44945790391](https://github.com/FlareZ123/obfs/actions/runs/44945790391), all steps **success**. The targeted workflow uses the existing `webauthn_boundary_only=true` input, not a new CI job.

The independent copied-origin client runs **after** the original honest credential registration, all legitimate browser proofs, copied-cookie refusal/relay probes, fresh operation-bound batch tests and an eight-way replay race. It then does the following with raw Node HTTP and `node:crypto`, without calling `navigator.credentials.create` or `.get`:

1. Requests its own public `/challenge` from `127.0.0.1`, generates a fresh EC P-256 software keypair and credential identifier, and fabricates a JSON registration `clientData` claiming the allowed `localhost` origin. It submits arbitrary matching SPKI bytes to public `/register` with **no session or enrollment authorization**.
2. Requests another challenge and signs the `webauthn.get` client-data hash with its software private key, including a self-constructed SHA-256 RP hash, UP+UV flags and 4-byte counter. The normal `/verify` route accepts this assertion against the overwritten software key and mints a new HttpOnly session cookie.
3. Requests an operation-bound `proofSum(7)` challenge using its new session, signs it using the same software key, and calls the actual `createScoHandler` `/obfs/rpc` endpoint through a raw copied-origin client with a spoofed Host header.

The actual runner log contains the distinct `SCO_WEBAUTHN_UNTRUSTED_ENROLLMENT` witness:

| Probe | Observed |
| --- | --- |
| Copied-origin arbitrary software-key re-registration after honest enrollment | HTTP **204** |
| Copied-origin software-signed login with forged allowed-origin JSON | HTTP **200**, new session cookie |
| Copied-origin software-signed protected `proofSum(7)` RPC | HTTP **200**, `{ok:true,value:148}` |
| Browser WebAuthn operations invoked by the copied-origin attacker | **0** |
| Actual server-private proof-gated executions induced by this software client | **1** |

The source records the private-method call counter before and after the final attack, asserts one actual execution, and retains every preexisting legitimate and hostile-client control. Existing replay protection still works for a known registered key. The failure is at the **registration trust bootstrap**, before one-use operation proof validation.

## Boundary and decision

This is a **real bypass of the current test fixture when its enrollment endpoint is network-accessible**, and it invalidates any unconditional statement that its login/proof routes enforce authenticator or RP-origin presence against a raw copied-origin adversary. It does **not** invalidate the narrower statement that **an already trusted, uncompromised, genuinely WebAuthn-held credential** cannot be reused across origins in an ordinary browser. The original Agent10 report already cautioned that production enrollment and account binding remain unimplemented.

A candidate using WebAuthn for the main SCO objective must first define an authenticated enrollment lifecycle, bind each credential record to the intended principal, validate credential-registration artifacts, establish an acceptable authenticator/provenance policy, prevent unauthorized credential replacement, and verify revocation/race behavior. Even correctly established credentials cannot prevent unlimited **allowed-origin online operation relaying**; the original test demonstrates that separately.

Neither this witness nor the surrounding WebAuthn prototype proves a generic SCO security release or 2.5× compute cap. Retain the project's **RELEASE-BLOCKED** verdict. Do not ship this `/register` fixture as a production registration implementation.
