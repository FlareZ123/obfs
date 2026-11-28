# SCO WebAuthn assertion admission (research candidate)

**Status: opt-in trusted-server component, NOT a strong-obfuscation release, authenticator-registration system, or proof of the 2.5× compute budget.** This is a reusable implementation of the assertion half of the [SCO WebAuthn charter](../workplace/sco-webauthn-candidate-charter-2026-11-19.md).

## Scope

The exported factory is **createScoWebAuthnAdmission** from the CommonJS project entry point or **src/sco-webauthn-admission.js**. The trusted SCO server issues independent random 256-bit challenge bytes and challenge IDs for an *already identified* principal and server-owned ceremony/session intent. The verifier checks:

1. Fresh, one-use, bounded-TTL challenge matching both principal and ceremony, consumed synchronously before asynchronous credential policy callbacks. Parallel copies of the same challenge cannot both mint sessions in a single process.
2. Exact canonical origin from an allowlist; WebAuthn client data type = we­bauthn.get; canonical base64url client challenge; crossOrigin must not be true.
3. SHA-256 of the configured RP ID in signed authenticator data; user presence and by default user verification; consistent authenticator backup flags; ES256 signature over authenticatorData concatenated with SHA256(clientDataJSON) under a *pre-registered* P-256 public key.
4. A **required application-supplied atomic credential counter update** that enforces live credential ownership, expected prior count and whatever sign-counter/backup-state policy fits that credential. The helper does not claim that counters alone prove no cloned keys.
5. No intervening principal revocation during either asynchronous credential lookup or durable counter update. A generation fence prevents late session creation after revocation.

Successful verification mints a 256-bit bearer session. The trusted server can require this bearer through SCO's existing **authorizeRpc** callback, *before* private implementation execution. The helper exposes expiry, session authorization, individual session revocation and whole-principal revocation, with bounded challenge/session capacities. Clock rollback is clamped within the process.

Only ES256 is supported. Attestation, COSE credential registration, non-ES256 algorithms, credential replacement, CSRF defenses, authenticated principal resolution, and the cookie transport are deliberately **not** implemented.

## Application wiring

Create the helper on the trusted server with the RP hostname, exact HTTPS origin allowlist, a credential lookup bound to a previously authenticated account, and a **durable atomic sign-counter CAS**. Obtain a challenge via **issueChallenge(principal, ceremonyId)** only after independent authentication, then have the browser invoke navigator.credentials.get() for that RP ID. The response supplies canonical base64url fields **credentialId**, **clientDataJSON**, **authenticatorData** and **signature**, plus the server's **challengeId**. Pass those alongside server-owned **principal** and **sessionId** to **verifyAssertion**; never take principal or ceremony authorization from a client-supplied JSON field or HTTP Host header.

The returned token belongs in an HttpOnly, Secure, SameSite=Strict cookie over HTTPS, with application-managed CSRF protections, account session policy, logout and expiration. Pass a trusted server principal and the bearer into **authorizeSession(token, principal)** from the SCO handler's **authorizeRpc** callback. For mutable private operations, use the existing SCO isolation/transaction API where necessary; a session check is not an automatic cancellation of work already running when revocation occurs.

The code deliberately has no public credential enrollment route. See the separately [reproduced unauthenticated software-key registration bypass](../im-results/sco-webauthn-untrusted-enrollment-software-key-2026-11-21.md): if an attacker can install an arbitrary software public key as their registered credential, they can sign fabricated origin and UP/UV claims from raw Node. Require authenticated WebAuthn registration artifacts, principal binding, credential-origin/provenance policy and protected credential replacement. The verifier does not itself distinguish hardware-held keys from attacker-controlled private keys.

## Runtime and attacker boundaries

In-memory challenge consumption, generation revocation and session storage are atomic **only inside one Node process**. Clusters, replicas, active/passive failover and crashes require a shared transactional state store and separately proven global at-most-once and revocation behavior. The application must rate-limit challenge issuance and protected operations; bounded global entries alone are not per-user fairness.

This is an **SCO admission improvement**, not a COO/SNO integrity or static-obfuscation claim. Correct WebAuthn RP binding rejects a copied-origin browser attempting to access an uncompromised credential, as the [existing Chromium test](../im-results/sco-webauthn-origin-boundary-2026-11-19.md) showed. Hostile code already running at the admitted origin can still request allowed WebAuthn ceremonies, and a stolen session bearer can still relay admitted work. These are mandatory negative controls, not bypasses of the trusted server's cryptographic authentication.

The existing [per-operation WebAuthn CPU study](../im-results/sco-webauthn-proof-cpu-budget-2026-11-21.md) measured roughly **95–111× server-only overhead** for verifying an ES256 proof before each tiny operation; this is strictly over the 2.5× cap. The implemented **one-assertion-per-login-session** policy removes mandatory crypto verification from every RPC, but no same-source full-session browser/CPU budget is established. Browser ceremony overhead cannot be deducted using SCO's *server-only initialization* exception. The project-wide security release remains **blocked**.

## Reproduction and remaining work

The standalone **test/sco-webauthn-admission.test.js** uses independent Node P-256 signatures, rejects bad RP/origin/UV/challenge/credential/counter input, checks simultaneous identical proof consumption, expiry, revoked in-flight lookup and CAS, and checks real SCO HTTP private-work authorization. The separate **test/sco-webauthn-admission-browser.js** runs Chromium virtual WebAuthn authentication against the **production helper**, seeds the genuinely generated credential from the *privileged test runner* (NOT from untrusted public registration), checks real RPC and replay behavior, demonstrates copied-origin browser refusal and a successful **stolen-cookie relay** negative control, then revokes the principal.

The existing **manual-sco-ratchet.yml** WebAuthn-only job runs these against the original RP boundary experiment on Linux, together with strict JSDoc. Promotion requires a source-pinned successful real-browser/Node gate, authenticated and independently reviewed credential registration, cluster-safe revocation, full-session strict compute measurement, and equal-trust attacker-cost advantage over a conventional authenticated application, none of which this code alone establishes.
