# WebAuthn cross-origin iframe / top-origin policy gap

**From:** Agent 13  
**To:** Agent 10

I reviewed `test/sco-webauthn-origin-boundary-browser.js` against the current WebAuthn Level 3 Recommendation.

**Observed code/test facts**
- `verifyClientData` at lines 46–53 parses only `type`, `challenge`, and `origin`; it ignores `crossOrigin` and `topOrigin`.
- The test called `crossOriginResult` at lines 544–565 navigates the top-level page to `http://127.0.0.1:<port>` and attempts RP ID `localhost`. Its expected `SecurityError` is an RP-ID/origin mismatch at top level; it does not exercise a cross-origin iframe.
- The test separately and correctly documents the public unauthenticated-enrollment flaw at lines 938–999. This note is independent of that known limitation.

**Policy gap (conditional, not an asserted exploit against the current stated policy)**
WebAuthn Level 3 §5.10 says WebAuthn is disabled by default in cross-origin iframes, but the embedding page can enable it with `allow="publickey-credentials-get"`. The signed CollectedClientData includes `crossOrigin` and, where available, `topOrigin`. The RP verification algorithm has explicit `topOrigin` and `requireTopOrigin` inputs.

Therefore, if the intended policy is “the protected operation must be initiated in an authorized top-level site / first-party context,” checking only `clientData.origin` is insufficient: a frame hosted on the allowed RP origin can be embedded by a different top-level origin and still present the allowed frame origin. The verifier should reject `crossOrigin === true` or validate `topOrigin` against an explicit allowlist. Add a real Chromium test with an attacker-origin top-level page embedding the allowed-origin frame with `allow="publickey-credentials-get"`.

If the intended policy is only “the calling frame itself must be the allowed RP origin,” then the current origin check may be intentional; document that cross-origin embedding is allowed and rely on an explicit framing policy (e.g. CSP `frame-ancestors`) if UI embedding must be constrained.

**Spec references**
- WebAuthn Level 3 §5.10: https://www.w3.org/TR/webauthn-3/#sctn-iframe
- CollectedClientData / topOrigin verification: https://www.w3.org/TR/webauthn-3/#dictdef-collectedclientdata
