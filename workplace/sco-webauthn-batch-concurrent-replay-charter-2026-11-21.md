# Preregistered concurrent replay of one SCO WebAuthn-signed batch (2026-11-21)

**Agent 10. Classification:** narrow concurrency authorization test, not a new obfuscation backend.

## Question

The current real-Chromium signed SCO batch uses a one-use server challenge consumed synchronously in `authorizeOperation`. Sequential replay tests show a signed 128-value proof cannot be reused. Does a **burst of eight truly concurrent raw-client requests carrying exactly the same fresh signed batch proof and bearer token** execute a private operation only once, or can requests race the one-use challenge?

## Precommitted experiment

After existing batch correctness, source-secrecy, stale-credential, signed-relay and wall-latency tests, the trusted server revokes the old session. The Chrome page repeats a genuine UV-required `localhost` WebAuthn login to mint a **new active session**. While at the authorized origin, the page creates one new signature for the existing exact ordered 128-integer batch using the real WebAuthn virtual CTAP2 authenticator, but does not consume the challenge.

An attacker with exported new session cookie then sends **eight parallel raw Node HTTP POSTs** to `127.0.0.1` with crafted Host header, byte-identical `x-webauthn-proof` header and identical method/arguments. All requests are started before awaiting their results via `Promise.all`. Each gets a real JSON response from the same `createScoHandler`, with no test stub.

**Security acceptance:** exactly one HTTP 200 with all 128 correct original output values; exactly seven HTTP 403. Private `proofBatch` execution counter increases **exactly once**, beyond all prior accepted calls. A ninth sequential replay must also be HTTP 403. Any two successful calls, any private side effect beyond one, or a legitimate first signed call denied is a security failure.

## Conditions and limitations

- Trusted server's one-use challenge map and `authorizeOperation` are within one Node process. This does **not** prove atomicity across clustered Node workers, Redis shared storage, crash replay, process restarts, or distributed replicas. Those need a shared transactional nonce store and separate experiments.
- The hostile client already possesses a valid cookie and fresh proof created by an authorized browser. This experiment isolates **at-most-once use** from the broader issue of origin locking and authorized online relay. A fresh authorized proof may be forwarded once successfully, as intended by the current architecture.
- Performance cost of eight concurrent raw HTTP requests is not the protected-code 2.5x CPU ratio. No latency or throughput threshold is asserted.
- Use the existing manual-only real-Chromium/JSDoc workflow with `webauthn_boundary_only=true`, source-pin green or red and store the observed responses/counter in `im-results/`. Do not rewrite this criterion after seeing the result.

This is a meaningful operation-integrity condition before considering genuine batched SCO protection. The global strong-protection release decision remains **RELEASE-BLOCKED**.
