# Preregistered SCO per-operation WebAuthn origin gate (2026-11-21)

**Agent 10. Status:** open architecture candidate, do not claim general success without frozen red/green and strict performance.

## Motivating rejection

The prior [WebAuthn-to-cookie boundary report](../im-results/sco-webauthn-session-origin-boundary-2026-11-21.md) demonstrated that one-time RP-bound WebAuthn admission followed by a conventional bearer cookie allows the cookie holder to call the real SCO private RPC from an unauthorized raw client. The server still enforces session revocation and denies requests without credentials.

## Candidate

For a *selected* protected SCO operation, require a fresh WebAuthn assertion verifying the original RP origin, UV/UP, server-selected random challenge, credential signature, and exact intended method/primitive arguments before any private execution. The server allocates a **one-use** challenge record with intended method/arguments and consumes it when the proof is used. The existing bearer session remains an independent coarse authorization gate.

This is a test of operation-bound external credential admission, with the cryptographic assertion verified by the existing test fixture's independently verified Node ES256 signature checker. Do not claim this is a production WebAuthn implementation or a complete canonical JSON protocol.

## Precommitted attacker experiments

1. Authorized browser with live `localhost` credential and bearer cookie can request fresh challenge, sign with `navigator.credentials.get({userVerification:'required'})`, submit matching operation and receive the correct real server-private result.
2. Copied origin `127.0.0.1` with exported cookie but **no fresh assertion** is denied HTTP 403 for the new protected method, while the same cookie can still call the deliberately bearer-only comparator method.
3. Reusing the captured assertion twice is rejected; private execution count must remain one for the proof-bound operation.
4. A fresh assertion signed for `proofSum(7)` is rejected if a raw attacker substitutes `proofSum(8)` before submission. Challenge binding must occur before any private side effects.
5. The hostile code that already controls the **allowed** origin can still use the authenticator to obtain fresh proof when the ceremony succeeds; the design cannot claim same-account online anti-relay.
6. A copied-origin browser `navigator.credentials.get` for the `localhost` RP still fails `SecurityError`. That is an independent browser/authenticator boundary.
7. Server revocation of the bearer session still blocks any operation, including with valid unused proof. Public facade continues not to reveal private operation source.
8. Strict 2.5x runtime budget must be measured separately; each proof requires browser signing and server verification. No unmeasured universal passing claim, and fine-grained operations may be infeasible.

## Boundaries and anticipated interpretation

If all checks pass, the candidate blocks **stolen-cookie-only offline raw-client replay** of the selected operation under trusted-server and authenticator assumptions. This is narrower than permanent environment locking: a hostile allowed-origin runtime that can invoke its legitimate authenticator may relay arbitrary authorized operations online, as proven by Agent 5's stopline. The signed challenge's intended operation must be data-bound, not just a generic login nonce.

A violation (raw no-proof accepted, replay accepted, substituted arguments accepted, intended allowed-browser operation denied) falsifies this local mitigation; retain red evidence.

## Test protocol

Extend the source-pinned `test/sco-webauthn-origin-boundary-browser.js` security fixture with one optional proof-bound SCO method and a challenge endpoint. Pair it with the existing bearer-only protected method in the same handler. Run on Chrome's real WebAuthn API with virtual user verification and Node22. Use the focused `.github/workflows/manual-sco-ratchet.yml` `webauthn_boundary_only` dispatch; only manual CI. Save reproducible output and source-pinned result in `im-results/`.

The one-argument numeric JSON fixture avoids semantic ambiguity from dynamic property graphs or arbitrary JSON canonicalization. A production design would require strict byte-exact/canonical method+argument commitments and independent account-level policy, user-presence throughput and deadline measurement.
