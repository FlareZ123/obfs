# SCO WebAuthn admission candidate charter

**Agent 5, 19 November 2026. Status:** preregistered design/evaluation charter.
This is not a release candidate and makes no performance claim.

## Motivation

The repository now has two complementary real-Chromium observations:

- software-only non-extractable Web Crypto keys remain usable by hostile code
  inside the authorized runtime;
- WebAuthn RP binding rejects a copied client at a different origin while
  still permitting fresh assertions from hostile code already running at the
  admitted RP when the authenticator ceremony succeeds.

Sources:

- `im-results/sco-webcrypto-proof-of-possession-2026-11-19.md`
- `im-results/sco-webauthn-origin-boundary-2026-11-19.md`
- `workplace/sco-authorized-relay-stopline-2026-11-19.md`

This charter defines what would be required to turn the latter boundary into a
real opt-in SCO admission feature without overstating its security.

## Candidate architecture

WebAuthn admission should be an explicit SCO-only authentication policy layered
in front of the existing trusted server/private-graph boundary.

The obfuscator should not manufacture a browser credential and embed it in the
delivered JavaScript. Registration belongs to the application/account
lifecycle. The SCO server receives or delegates to a verifier backed by the
application's stored credential records.

A session bootstrap would:

1. issue a fresh cryptographic challenge tied to a principal and intended SCO
   session;
2. require an assertion for a configured RP ID and allowed origin set;
3. verify the credential ID belongs to the intended principal;
4. verify the exact challenge and origin;
5. verify the RP-ID hash;
6. require UP and, when configured, UV;
7. verify the assertion signature with the registered public key;
8. apply the application's sign-counter / backup-state policy;
9. consume the challenge atomically;
10. mint the existing short-lived/account-scoped SCO session authority.

The private implementation and ratchet state remain server-side. WebAuthn is
an admission gate to that boundary rather than a replacement for it.

## Explicit non-goals

A successful candidate must not claim any of the following from WebAuthn
alone:

- prevention of same-account online relay;
- secrecy of already downloaded COO code;
- protection against code already running at the admitted RP origin;
- protection against a compromised trusted SCO server;
- automatic hardware-backed storage on every platform;
- resistance to a user who intentionally satisfies an authenticator ceremony
  for attacker-chosen work.

Those require separate evidence or a different threat model.

## Preregistered security tests

A candidate is incomplete until the following source-pinned tests exist.

### Positive admission

- registered credential, correct RP/origin, fresh challenge, required UV;
- independent server signature verification;
- exact principal/credential binding;
- successful transition into the existing SCO account/session state.

### Copied-origin negatives

Attempt the same credential from:

- a sibling host that is outside the configured RP-ID suffix policy;
- an IP-literal origin corresponding to a DNS RP;
- an unapproved port/origin when the server's origin allowlist is exact;
- an attacker-chosen RP ID that the browser should reject.

Browser rejection and server rejection are separate observations and should be
reported separately.

### Server-verification negatives

Freeze valid browser assertions, then independently mutate:

- challenge;
- origin;
- credential ID / principal;
- RP-ID hash;
- UP flag;
- UV flag when required;
- signature;
- already-consumed challenge.

Every case must fail before SCO private work is committed.

### Same-origin hostile-runtime control

Run hostile code first at the admitted origin. When the virtual authenticator
ceremony is satisfiable, require evidence that the attacker can still obtain a
fresh assertion and relay its own permitted SCO work. This is a required
negative control against inflated claims.

### Credential lifecycle

Test the actual policy chosen for:

- credential deletion / revocation;
- multiple credentials per account;
- backup-eligible / backed-up credential state if accepted;
- authenticator sign counters where meaningful;
- concurrent challenges;
- crash/restart challenge consumption;
- replay after successful session bootstrap.

## Performance gate

The current prompt's initialization exception does not create a general
client-side authentication exemption. Therefore WebAuthn-dependent release
claims need matched end-to-end measurements that retain the authentication
cost applicable to the supported workflow.

At minimum measure separately:

1. server CPU for challenge issuance and assertion verification;
2. browser/client wall time for the ceremony under the chosen authenticator;
3. one-session bootstrap plus a short protected workload;
4. a long-lived session plus repeated protected work;
5. the existing private-work compute budget after admission.

Virtual-authenticator timing is useful for deterministic CI correctness. It is
not a substitute for physical-authenticator/user-interaction measurements if
those become part of the supported security claim.

The 2.5x decision rule must remain strict for whatever matched workload the
candidate advertises. Any amortization assumption needs an explicit minimum
session/workload contract rather than an implicit appeal to long-running use.

## Compatibility gate

WebAuthn is a browser capability. The SCO implementation should fail closed or
decline the feature when the required browser/authenticator capability is
unavailable. The ordinary SCO protocol should remain independently testable so
the feature does not silently become a universal browser requirement unless
the product intentionally chooses that policy.

Source-observer, CSP, HttpOnly-cookie, module-graph, transactional-ratchet, and
cross-account tests remain applicable. WebAuthn does not waive them.

## Promotion criterion

Promotion requires a source-pinned candidate that simultaneously demonstrates:

- exact semantic parity for admitted workloads;
- server-private source/state separation;
- cross-principal authorization;
- RP/origin admission under the declared browser/authenticator trust model;
- retained same-account-relay negative control;
- crash/replay-safe challenge/session lifecycle;
- browser compatibility evidence;
- strict matched performance evidence.

Until then, WebAuthn remains a promising external admission primitive rather
than part of the obfuscator's established protection set.
