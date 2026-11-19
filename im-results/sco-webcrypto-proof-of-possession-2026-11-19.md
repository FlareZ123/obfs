# Non-extractable WebCrypto proof-of-possession under hostile Chromium

**Agent 5, 19 November 2026. Classification:** bounded negative SCO
credential-boundary result.

## Question

Can an SCO client strengthen environment admission against its own hostile
runtime by replacing a bearer credential with a browser-generated,
non-extractable proof-of-possession key?

This experiment evaluates the software Web Crypto version of that idea. It
does not evaluate WebAuthn, a hardware authenticator, remote attestation, or
user-presence policy.

## Pinned implementation

- attacker/browser harness:
  `test/sco-webcrypto-proof-of-possession-browser.js`
- harness commit:
  `d6043110abc8c435c03e3b4a448f5a75f15ca576`
- workflow integration:
  `51e603094c408cdb194f0f03722f82594a581e7b`
- full cross-platform SCO ratchet workflow:
  https://github.com/FlareZ123/obfs/actions/runs/44426140180

Run 44426140180 completed successfully on Ubuntu and Windows Node 22.23.4.
The browser step runs on the Ubuntu job using real headless Google Chrome.
Both strict JSDoc lanes and the existing ratchet architecture suite passed
before the new browser control.

## Browser/server construction

The page is served from a loopback origin with a self-only CSP. Loopback is a
secure context under current browser secure-context rules, allowing Web
Crypto.

The honest ESM application:

1. calls `crypto.subtle.generateKey` for ECDSA P-256 with
   `extractable=false`;
2. exports only the public JWK;
3. signs one legitimate JSON request with the private `CryptoKey`;
4. sends the signature and payload to the Node server.

The private key is module-local and is never deliberately returned to the
attacker.

The same-origin hostile module loads first and replaces
`crypto.subtle.sign` with a wrapper. On the honest application's first
signature, the wrapper receives the opaque private `CryptoKey` object. It
retains that object while delegating to the original signing method.

The attacker then:

1. attempts `crypto.subtle.exportKey("jwk", capturedKey)`;
2. observes the expected `InvalidAccessError`;
3. creates a fresh attacker-chosen payload with a different nonce;
4. passes the captured opaque key object back to the original
   `crypto.subtle.sign`;
5. sends that new signature to the protected server endpoint.

The server imports only the registered public JWK and verifies each ECDSA
signature independently. It rejects duplicate payloads. Node verification uses
the IEEE-P1363 ECDSA `r || s` signature representation emitted by Web Crypto.

The Web Crypto contract intentionally distinguishes exportability from usage:
a `CryptoKey` with `extractable=false` cannot be exported through
`exportKey` or `wrapKey`, while a private key whose usage includes
`sign` remains an input accepted by `SubtleCrypto.sign`.

References:

- MDN `CryptoKey.extractable`:
  https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey/extractable
- MDN `SubtleCrypto.generateKey`:
  https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/generateKey
- MDN `SubtleCrypto.sign`:
  https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign
- Node crypto signature verification:
  https://nodejs.org/api/crypto.html

## Observed result

The Chromium log from the source-pinned workflow reports:

```json
{
  "privateKeyExtractable": false,
  "privateExportRejected": "InvalidAccessError",
  "legitimateSignedRequestAccepted": true,
  "freshAttackerChosenSignedRequestAccepted": true,
  "verifiedRequests": 2
}
```

The DOM assertion also required exactly:

```text
HONEST=200|RELAY=200|EXPORT=InvalidAccessError|CAPTURED=true
```

Thus private key serialization failed while private key **use** from hostile
same-origin runtime code succeeded.

## Security implication

For this software-only Web Crypto construction, non-extractability protects
private key bytes from the export API. It does not create an execution boundary
against code that controls the authorized JavaScript runtime. Such code can
instrument the signing API, retain the opaque key handle, and request
signatures over attacker-chosen messages.

This matches the repository's existing HttpOnly-cookie and fetch-instrumentation
negative controls at a stronger-looking credential layer. Credential secrecy
and capability secrecy are separate. An opaque signing capability that remains
invocable by the hostile runtime can still support same-account online relay.

The result therefore strengthens
`workplace/sco-authorized-relay-stopline-2026-11-19.md`: software-only proof
of possession should not be credited as same-account anti-relay under the
current SCO threat model.

## WebAuthn is a separate lane

WebAuthn Level 3 became a W3C Recommendation on 25 August 2026. Its credentials
are scoped to a relying party, the user agent verifies the RP ID against the
origin, authenticators mediate operations with user consent, and a relying
party can require user verification.

References:

- W3C Level 3 publication:
  https://www.w3.org/news/2026/web-authentication-an-api-for-accessing-public-key-credentials-level-3-is-now-a-w3c-recommendation/
- MDN request options and RP ID / user verification:
  https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialRequestOptions
- MDN passkey scope and origin verification:
  https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passkeys

Those properties can make credential use outside the RP origin harder and can
require an external authenticator or user factor. They add a trust assumption
outside ordinary obfuscated JavaScript. A future WebAuthn experiment is
meaningful only if the project explicitly elects to test that altered
environment-admission model.

Even then, the current SCO attacker is an authorized account holder allowed
unlimited legitimate requests. If that account holder can satisfy the required
authenticator ceremony, a downstream query can still be relayed through the
authorized origin. User presence or hardware policy may change throughput and
automation; it does not retroactively make the present software-only threat
model an anti-relay model.

## Decision

Reject non-extractable Web Crypto proof-of-possession as a software-only
same-account anti-relay mechanism for SCO. Retain it only as a credential
theft hardening tool whose private bytes cannot be exported through the tested
API.

Keep this result in `im-results/`. It makes no claim about browser CPU
overhead, WebAuthn, hardware-backed key isolation, cross-account
impersonation, or private-server source extraction.
