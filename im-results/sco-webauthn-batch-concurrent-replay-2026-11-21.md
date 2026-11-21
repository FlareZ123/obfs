# Eight-way concurrent WebAuthn batch replay: one accepted private execution (2026-11-21)

**Agent 10. Classification:** intermediate single-process authorization-integrity concurrency result, independent of static code obfuscation strength.  
**Precommitted criteria:** [workplace/sco-webauthn-batch-concurrent-replay-charter-2026-11-21.md](../workplace/sco-webauthn-batch-concurrent-replay-charter-2026-11-21.md).

## Why this test matters

The real-Chromium SCO operation-bound WebAuthn batch correctly rejected **sequential** replays of an already used signature. The missing boundary was whether simultaneous raw HTTP requests could all observe a fresh challenge before its one-use state was consumed and therefore cause duplicate server-private effects.

The pre-registered attacker controls a raw Node HTTP client and can export an authorized-origin browser's HttpOnly bearer session cookie and signed WebAuthn proof. The trusted Node server, its fresh challenge state and private operation remain intact. This is **not** a credential-forgery or cross-account access test.

## Frozen procedure

Using the same genuine `src/sco.js::createScoHandler` in `test/sco-webauthn-origin-boundary-browser.js`, the fixture completes all existing real Chrome RP/UV, source separation, session revocation, per-operation proof and 128-value proof-batch controls. After revoking the original bearer session, the browser makes a new independently signed, UV-verified WebAuthn login at trusted `http://localhost:<port>`, yielding a fresh active HttpOnly session. It asks for **one** operation-bound WebAuthn challenge and signs the exact ordered 128-safe-integer `proofBatch` arguments. The challenge remains unused.

The raw attacker then launches **eight HTTP POST requests concurrently** to `127.0.0.1`, with self-supplied `Host: localhost:<port>`, identical exported session cookie, identical ES256 assertion header, identical method and identical 128 integer inputs. All eight promises are created before any result is awaited with `Promise.all`. Each request reaches the actual SCO handler and returns its real HTTP status/body.

The protected private-operation execution counter is read immediately before and after the burst. A ninth request reuses the same proof after the burst, independently checking that the nonce remains consumed.

## Source-pinned outcome

[Manual real-Chromium and strict JSDoc CI run 44878609302](https://github.com/FlareZ123/obfs/actions/runs/44878609302), source `76fb141a8129d47249f503c642c7523280b5035b`, Node v22.23.5/Linux, **success**. All previously established WebAuthn origin, browser/private operation output, signed-batch mutation, cross-origin relay and full-session wall-latency checks remained green.

The exact JSON evidence logged as `SCO_WEBAUTHN_BATCH_RACE` is:

| Probe | Observed |
| --- | --- |
| Parallel requests with same valid fresh signed proof | **8** |
| Actual successful private batch executions | **1** |
| HTTP 200 responses | **1** |
| HTTP 403 responses | **7** |
| Accepted batch response | All 128 native values, exact |
| Ninth sequential identical proof | HTTP **403** |

The captured response-status array was `[200,403,403,403,403,403,403,403]`. The one-use challenge record was consumed synchronously within the SCO authorization check prior to private operation execution. No second request could execute the private batch.

## Interpretation and limits

**Established for the exact single-process source:** an attacker cannot multiply server-private execution of one operation-bound WebAuthn proof by racing eight byte-identical requests through the same trusted Node handler. This is an important integrity and replay property of the tested one-use challenge implementation. It strengthens its previous sequential-replay evidence.

The result does **not** establish process-independent at-most-once semantics. Multiple clustered Node workers with independent challenge stores, a shared external nonce database, duplicated hot standbys or crashes between commitment and private execution require separate transactional/recovery analysis. The experiment does not demonstrate the same result for 1,000 concurrent requests or arbitrary HTTP pipelining patterns. It remains a sample-backed observation rather than a proof of global linearizability.

It also leaves the overarching origin-locking problem unchanged: the hostile runtime can generate a *fresh* legitimately signed batch at the admitted RP, forward it to the raw copied-origin client and execute it once, as in the prior [signed batch security study](./sco-webauthn-proof-batching-2026-11-21.md). No full strict 2.5x compute guarantee, static code reconstruction resistance, credential secrecy or 3-mode release result follows.

No new per-commit CI was introduced. Reproduce with `.github/workflows/manual-sco-ratchet.yml`, input `webauthn_boundary_only=true`, and inspect the source-pinned `SCO_WEBAUTHN_BATCH_RACE` log record. Overall strong-protection status remains **RELEASE-BLOCKED**.
