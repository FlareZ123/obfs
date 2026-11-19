# WebAuthn RP binding versus hostile allowed-origin relay

**Agent 5, 19 November 2026. Classification:** bounded SCO environment-admission
result with an explicit external browser/authenticator trust assumption.

## Question

Can a browser/authenticator trust boundary distinguish a copied client running
at an unauthorized origin while still leaving same-origin authorized relay
available to the hostile SCO runtime?

This experiment evaluates WebAuthn relying-party binding with required user
verification. It is separate from the software-only Web Crypto
proof-of-possession experiment in
`im-results/sco-webcrypto-proof-of-possession-2026-11-19.md`.

## Pinned implementation

- browser/server harness:
  `test/sco-webauthn-origin-boundary-browser.js`
- initial harness:
  `3043982ca9d9fb4bfe1300f990668b1707aaad7f`
- PATH-only launcher repair:
  `db279c76439c1b123ba333cdaa9869c6922b75f9`
- workflow integration:
  `6faa1efb61ae8a742c3eaad0fa0f1add1c45193b`
- source-pinned workflow run:
  https://github.com/FlareZ123/obfs/actions/runs/44427336036

The first workflow attempt, 44426824063, did not reach WebAuthn semantics.
Puppeteer Core requires a filesystem executable path while the existing CI
convention supplies `CHROMIUM_BIN=google-chrome` as a PATH command. Commit
`db279c7...` resolves that command from `PATH`; it makes no change to the
WebAuthn ceremony or security assertions.

The Linux job of run 44427336036 completed successfully with real headless
Google Chrome. The Windows job does not execute the browser step.

## Construction

The Node server uses RP ID `localhost`. Chrome runs a CDP virtual CTAP2 USB
authenticator with:

- resident-key support;
- user-verification support;
- `isUserVerified=true`;
- automatic presence simulation.

The virtual authenticator is a deterministic testing mechanism. It is not
evidence about physical-authenticator latency, human interaction, or real
biometric resistance.

At `http://localhost:<port>`, the page creates an ES256 credential with
`residentKey:"required"` and `userVerification:"required"`. The server
stores the credential ID and public SPKI.

For every registration/authentication response, the server independently
validates the browser/authenticator material relevant to this experiment:

- `clientDataJSON.type`;
- the exact server-issued challenge;
- the exact expected origin;
- the SHA-256 RP ID hash in authenticator data;
- both User Presence and User Verification flags;
- the ES256 assertion signature over
  `authenticatorData || SHA256(clientDataJSON)`.

Two authentication ceremonies are then performed at the authorized origin:

1. an honest fresh server challenge;
2. a second fresh challenge explicitly requested by attacker-controlled
   same-origin code.

Finally the same page is loaded at
`http://127.0.0.1:<same-port>` and attempts
`navigator.credentials.get()` with `rpId:"localhost"` and the registered
credential ID.

## Observed boundary

The successful Chromium log reports:

```json
{
  "rpId": "localhost",
  "honestAssertionAccepted": true,
  "hostileSameOriginFreshAssertionAccepted": true,
  "copiedClientRpAssertionResult": "SecurityError",
  "userVerificationRequired": true,
  "acceptedAssertions": 2
}
```

Thus the copied client on the distinct `127.0.0.1` origin could not request
an assertion for RP ID `localhost`. The browser rejected the request before
the server could accept it.

At the allowed `localhost` origin, attacker-controlled runtime code obtained
a fresh, independently verified assertion for its own fresh server challenge
when the virtual authenticator ceremony succeeded.

This matches the current WebAuthn contract. WebAuthn Level 3 is a W3C
Recommendation as of 25 August 2026. Credentials are scoped to a WebAuthn
Relying Party, the user agent mediates authenticator access, and authenticators
are responsible for user consent. Current MDN documentation states that the
browser checks whether `rpId` matches the origin or a domain suffix and that
`userVerification:"required"` makes the operation fail if user verification
does not occur.

References:

- W3C Level 3 Recommendation announcement:
  https://www.w3.org/news/2026/web-authentication-an-api-for-accessing-public-key-credentials-level-3-is-now-a-w3c-recommendation/
- MDN `PublicKeyCredentialRequestOptions`:
  https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialRequestOptions
- MDN authenticator data:
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/Authenticator_data

## Security interpretation

This is positive evidence for **origin/RP admission using an external browser
and authenticator boundary**. It is stronger than a JavaScript hostname
comparison because the copied page cannot simply rewrite its own `rpId` and
continue using the same registered credential.

It does not make downloaded COO code secret after an authorized client has
received it. It also does not create same-account online anti-relay for SCO.
Code already executing at the authorized RP origin can request fresh
assertions whenever the required authenticator ceremony succeeds, then use
the authorized SCO service and relay the result.

The second point is demonstrated directly in the same run by the accepted
attacker-chosen fresh assertion. The experiment therefore separates two
questions that should remain distinct:

- **copied-origin admission:** WebAuthn can provide a real boundary under the
  browser/authenticator trust model;
- **same-account functional relay:** still available to hostile code running
  inside the admitted origin when the ceremony is satisfiable.

If a future design depends on non-automatable physical user presence,
hardware-backed authenticators, enterprise attestation, or per-operation
human approval, that is an additional trust/interaction assumption. It must
be declared explicitly and measured separately from software obfuscation.

## Decision

WebAuthn is a credible optional SCO **environment-admission/authentication
primitive** when the project is willing to rely on the browser and
authenticator. It should not be described as a software-only obfuscation
property, and it should not be credited with preventing an authorized client
from relaying its own permitted operations.

No performance claim is made here. The project's 2.5x compute rule still
requires a matched supported-workload evaluation before WebAuthn-dependent
admission becomes part of any release configuration.

Keep this result in `im-results/` until a full candidate integrates the
trust assumption, server verification, lifecycle policy, semantic workload,
and measured performance.
