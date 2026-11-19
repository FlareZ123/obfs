# SCO same-account online relay stopline

**Agent 5, 19 November 2026. Status: threat-model consequence and research stopline.**

## Claim being bounded

Under the repository's SCO threat model, the client attacker controls its own
runtime, can inspect and modify the delivered JavaScript, can observe every
response, and may make unlimited legitimate requests to the trusted SCO
server. Within that model, no client-side obfuscation or software-only
proof-of-possession mechanism can establish **same-account online functional
anti-cloning** for an operation that the authorized client is itself allowed
to invoke on attacker-chosen inputs.

This is a statement about live functional relay. It says nothing about
recovering private source, private server state, or outputs belonging to a
different principal.

## Relay construction

Let an authorized client protocol `P` expose protected functionality
`F(x)` for every input `x` in the account's allowed input domain. Assume
the hostile client can cause `P` to execute on an input it chooses and can
observe the resulting output, which is exactly the SCO client-control model.

An attacker can implement an online service `R`:

1. receive a downstream query `x`;
2. submit `x` through the legitimate authorized client protocol `P`;
3. observe the authorized response `y`;
4. return `y` to the downstream caller.

Whenever the legitimate protocol returns `F(x)`, the relay returns the same
value. The construction does not need to recover source bytes, cryptographic
keys, the server's ratchet state, or the internal algorithm.

If the protected interface is stateful, `R` keeps the same authorized
session and forwards queries in the legal sequence. State prevents stale
replay and can isolate different accounts. It does not remove the relay for
fresh legal operations of the attacker's own account.

## Existing repository witnesses

This consequence is already exhibited by multiple independent experiments:

- `im-results/sco-private-graph-relay-2026-11-16.md`: an attacker-operated
  proxy returned 30/30 held-out outputs through a legitimate SCO session while
  the private HMAC implementation stayed server-only.
- `im-results/sco-ratchet-state-boundary-2026-11-17.md`: 32 fresh Account A
  operations were forwarded online while stale replay and cross-account
  guesses remained denied.
- `im-results/sco-ratchet-browser-instrumentation-2026-11-17.md`: hostile
  same-origin Chromium code intercepted every authorized ratchet response even
  though the session cookie was HttpOnly and the page used a self-only CSP.
- `im-results/sco-ratchet-equal-trust-minified-control-2026-11-17.md`: the
  generated facade and an ordinary minified facade gave the same authorized
  online-cloning capability. The security boundary came from private server
  residency and account authority.

Two additional browser controls now sharpen the credential boundary:

- `im-results/sco-webcrypto-proof-of-possession-2026-11-19.md`: a real
  Chromium page kept the ECDSA private `CryptoKey` non-extractable and
  `exportKey` failed with `InvalidAccessError`, while hostile same-origin
  code retained the opaque key handle and signed a fresh attacker-chosen
  request that the server accepted.
- `im-results/sco-webauthn-origin-boundary-2026-11-19.md`: WebAuthn
  successfully blocked a copied `127.0.0.1` client from requesting the
  `localhost` RP credential, while hostile code already running at the
  admitted `localhost` origin obtained a fresh UV-required assertion when
  the authenticator ceremony succeeded.

## What remains achievable

SCO can still provide properties that COO and SNO software-only delivery
cannot provide under their stated hostile-runtime models:

- withhold private implementation and secret state from distributed files;
- deny unauthenticated or cross-account calls;
- enforce server-side sequence, concurrency, quota, and business policy;
- make stale replays fail;
- rotate or destroy server-held state;
- confine what each principal is authorized to request.

These are useful security properties. They should be reported as server trust
boundary and authorization properties.

Same-account anti-relay requires an additional assumption that contradicts or
narrows the current unlimited-legitimate-request attacker. Examples include a
non-forwardable external trust anchor with independently enforced user
presence, trusted hardware outside the hostile runtime, a restricted input
domain, or a server policy that makes the downstream query unavailable to the
authorized client. Each changes the threat model and must be declared.

WebAuthn demonstrates why this distinction matters. Its RP binding supplies a
real copied-origin admission boundary because the browser/authenticator
participate in the security decision. The same mechanism does not prevent
relay by hostile code already executing at the admitted RP when the required
ceremony can be satisfied. Environment admission and same-account functional
anti-relay must therefore remain separate reported properties.

## Research decision

Do not spend further candidate budget trying to prove that a software-only
client facade, CSP, HttpOnly cookie, local host/domain check, obfuscated
credential wrapper, or non-extractable browser key prevents an attacker who
controls that authorized runtime from relaying its own allowed service.

Future SCO work should instead measure:

1. private-source and private-state separation;
2. cross-principal authorization;
3. state and replay invariants;
4. realistic end-to-end compute/session cost;
5. semantic partitioning coverage;
6. the exact additional trust assumption whenever stronger environment
   admission is claimed.

This stopline does not apply to offline source reconstruction, cross-account
impersonation, or a future explicitly different hardware/attestation threat
model.
