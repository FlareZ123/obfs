# Reusable server-side WebAuthn assertion admission for SCO: first source-pinned real-browser gate

**28 November 2026, Agent 6. Classification: intermediate implementation and bounded authentication evidence; NOT a claim of source-obfuscation secrecy, universal execution authorization, or <=2.5× compute compliance.** The pre-existing [SCO WebAuthn charter](../workplace/sco-webauthn-candidate-charter-2026-11-19.md) and prior [Chromium RP-boundary experiment](sco-webauthn-origin-boundary-2026-11-19.md) established the question but used a dedicated research harness rather than a reusable trusted-server assertion component. This contribution implements a separate, opt-in, JSDoc-typed library plus tests against the real SCO handler.

**Source pin:** [commit 8b117fb2df730d55573bcfb667a6b14b006bd2d1](https://github.com/FlareZ123/obfs/commit/8b117fb2df730d55573bcfb667a6b14b006bd2d1), research branch \`agent6/sco-webauthn-server-admission-20261128\`. **Independent GitHub runner:** [workflow run 46122643625](https://github.com/FlareZ123/obfs/actions/runs/46122643625), completed **success** on Ubuntu Node v22.23.5 with real Chromium virtual WebAuthn authenticator, 14/14 new Node assertions, existing origin/session browser experiment, and strict main/external JSDoc. The immediately previous branch source [80e0633](https://github.com/FlareZ123/obfs/commit/80e06330d0eb06359fd947d65982a9066b333dc1) passed all 14 Node tests and both browsers but failed a TypeScript inference in a negative test; the *only change* in 8b117fb was the required explicit policy configuration JSDoc annotation. Preserve that red CI [46122443059](https://github.com/FlareZ123/obfs/actions/runs/46122443059) instead of reporting a fictional uninterrupted green history.

## Implementation and exact protocol profile

- \`src/sco-webauthn-admission.js\` exports \`createScoWebAuthnAdmission\`; \`src/index.js\` reexports it, leaving existing SCO/COO/SNO behavior unchanged unless opted in.
- Independent random 256-bit challenge and nonce ID are associated with an already trusted principal and login session intent. A known challenge is consumed **before** any asynchronous credential lookup, so concurrent identical attempts cannot mint duplicate sessions in a single trusted Node process. Invalid attempted challenges burn their nonce.
- The component accepts only canonical base64url, valid UTF-8 signed \`clientDataJSON\` with exact allowlisted origin, \`webauthn.get\` type, matching challenge, no cross-origin flag; exactly 37-byte basic authenticator-data prefix, SHA256(RP ID), UP and required UV bits, no unsupported flags/extensions; and a real ES256 signature under an already-enrolled P-256 public key.
- The *application* must supply account/credential lookup and atomic durable compare-and-swap counter policy. These callbacks are snapshotted at construction. Generation fencing checks revocation across awaited lookup and counter mutation, preventing late issuance of new sessions for a revoked principal. Issued random 256-bit bearer tokens are checked by the actual SCO \`authorizeRpc\` callback before protected work.
- Session and nonce memory stores are bounded and TTL controlled, and principal/session revocation is available. This version's nonce and session atomicity is **one process only**; it does not make a multi-worker, crash-recovered or geographically replicated exactly-once claim.

## Source-pinned executable observations

\`test/sco-webauthn-admission.test.js\` passed 14/14 tests: good ES256 login and SCO private RPC, principal confusion, invalid origin/RP/UV/UP/challenge/credential, signature tampering, malformed canonical encodings, unsupported signed authenticator flags and extensions, stale signature counter, two independently issued racing challenges, 16 same-challenge attempts, revoked in-flight async credential lookup and counter CAS, expiry, bounded state, mutation of constructor callbacks and a real HTTP SCO private-work counter.

\`test/sco-webauthn-admission-browser.js\` produced this actual Chromium test record, with two private SCO executions total:

\`\`\`json
{"trueAuthenticator":true,"originalRpc":{"ok":true,"value":148},"originCopyResult":"SecurityError","replayDenied":403,"stolenCookieRelay":{"status":200,"body":{"ok":true,"value":148}},"principalRevocationDenied":403,"protectedCalls":2}
\`\`\`

The virtual authenticator's P-256 credential was copied into a *privileged test-runner-owned* credential map, **not** submitted to an unauthenticated network enrollment endpoint. The test then uses the real browser \`navigator.credentials.get\` for a fresh challenge and verifies the resulting signature through the reusable component. A copied origin at \`127.0.0.1\` attempting \`rpId=localhost\` fails with \`SecurityError\` at the browser, but an attacker who extracts the HttpOnly bearer through a debugging context can relay an already authorized SCO RPC via Node raw HTTP. This is an essential **negative control** against falsely claiming the admission scheme prevents same-account relay.

The older browser test was also retained and passed on this source pin. Its published untrusted registration test purposely demonstrates software-key credential takeover in the *old* sample harness: see [Agent 7's enrollment counterexample](sco-webauthn-untrusted-enrollment-software-key-2026-11-21.md). The new module does not expose a public registration endpoint; **application credential enrollment, attestation, account binding, key provenance and protected replacement remain outside its contract.**

## Unresolved objective-level gates

1. **Clustered state:** multiple Node workers with separate session and nonce maps can accept stale authorization, and per-process revocation does not propagate; require durable shared transactional storage plus adversarial cross-process tests before claiming replicated SCO origin admission.
2. **Credential bootstrap:** validating a signed assertion against a compromised or attacker-installed software public key proves only that software key. Authenticated enrollment, credential binding and policy for hardware/backup state must be independently reviewed.
3. **Compute:** earlier source-pinned [per-operation verifier CPU](sco-webauthn-proof-cpu-budget-2026-11-21.md) measured roughly **95–111× native** for tiny operations, a strict 2.5× veto. This research uses one proof per **session** and does not prove a matched full-session browser + server compute bound. One ceremony's time cannot be excused under the prompt's server-only initialization exemption.
4. **Security baseline:** the new integration verifies origin admission but not an independent *reconstruction-cost advantage* over an ordinary authenticated app or static analysis resistance. Same-origin hostile runtime and authorized relay still work. COO and SNO adversaries retain full local control; this opt-in SCO verifier offers no comparable guarantee there.

The objective-wide verdict in \`results/README.md\` remains **RELEASE-BLOCKED**. Treat this as a concrete implementation of a limited external admission primitive, not as proof that the JS obfuscator is tamperproof or unreadable.
