# Environment-admission boundary matrix

**Agent 5, 19 November 2026. Status:** research synthesis for candidate selection.
This matrix separates executable evidence from architectural inference.

## Why separate admission from obfuscation

The primary objective asks that protected code run only where explicitly
allowed. That phrase covers several materially different mechanisms.

A local JavaScript hostname check, a private-server authorization decision, a
software-held signing capability, and a WebAuthn RP-bound credential do not
have the same trust boundary. Future reports should name the boundary instead
of collapsing them into one "domain lock" score.

## Current evidence

| Mechanism | External trusted component | Copied client at another origin | Hostile code at allowed origin | Same-account SCO online relay | Source / evidence |
| --- | --- | --- | --- | --- | --- |
| JavaScript host guard | none beyond browser exposing location | guard can execute, but hostile client can inspect/patch distributed code | controls guard and runtime | unaffected | current `allowedHosts` implementation; source-observer compatibility report `im-results/host-lock-stack-coordinate-2026-11-18.md` |
| HttpOnly cookie + self-only CSP | browser origin/cookie policy | credential is scoped by browser policy, depending on cookie attributes | hostile same-origin code cannot read HttpOnly bytes but can issue authorized fetches and observe responses | succeeds | `im-results/sco-ratchet-browser-instrumentation-2026-11-17.md`, equal-trust ratchet report |
| non-extractable Web Crypto key | browser Web Crypto object/usage policy | transport/storage choice determines where handle exists | hostile same-origin code hooked `sign`, retained opaque key handle and signed fresh attacker payload; byte export failed | succeeds | `im-results/sco-webcrypto-proof-of-possession-2026-11-19.md`, run 44426140180 |
| WebAuthn RP-bound credential + required UV | browser + authenticator + server verifier | tested `127.0.0.1` copy requesting RP `localhost` failed with `SecurityError` | tested hostile code at `localhost` obtained fresh assertion when virtual authenticator ceremony succeeded | succeeds when the admitted account can satisfy ceremony | `im-results/sco-webauthn-origin-boundary-2026-11-19.md`, run 44427336036 |
| SCO private source/state + account authorization | trusted SCO server | copied public facade still lacks private implementation/state and valid account authority | admitted account can invoke its own allowed service | succeeds for own permitted inputs | ratchet/private-graph reports and `workplace/sco-authorized-relay-stopline-2026-11-19.md` |
| SNO local integrity/admission | none outside attacker-owned server runtime under stated threat model | not a browser-origin question | attacker controls filesystem, Node runtime and memory | not applicable | existing SNO owner-bypass reports |

## Mode-specific interpretation

### COO

Every distributed JavaScript file is available to the attacker, who can run it
in an instrumented browser and reproduce the hosting environment. A local
hostname check is therefore a compatibility/admission guard for honest
execution rather than an independent authorization authority.

Gating initial download with WebAuthn can control who receives an artifact from
a server, but after an authorized hostile client obtains a self-contained COO
artifact, the browser-side code remains copyable and instrumentable. That is
access control around distribution, not persistent secrecy of the delivered
program.

If WebAuthn is ever attached to COO, report the authentication property
separately from post-download code protection.

### SNO

The stated SNO attacker owns the server filesystem, Node runtime and memory.
A software-only environment predicate executing inside that process has no
independent trust anchor. Local manifests and integrity checks can still
diagnose accidental corruption, but hostile-owner admission requires a new
external assumption such as hardware attestation or a remote authorization
service.

Any such assumption changes SNO's architecture and should be named explicitly.

### SCO

SCO has the strongest native admission boundary because private code, keys and
policy can remain on an obfuscator-controlled server. Cross-account denial and
private-source separation are meaningful even when the public client is fully
hostile.

WebAuthn can strengthen **which browser/RP/account is admitted** by placing
part of the decision in the browser/authenticator. Its tested RP binding is a
real improvement over a mutable hostname comparison.

The authorized runtime still receives its own permitted outputs. Under the
current unlimited-legitimate-request threat model, it can relay those outputs
online. This is why RP/origin admission and same-account anti-relay must remain
separate axes.

## Recommended scorecard fields

Every future environment-locking result should report:

1. **decision authority:** JavaScript runtime, trusted server, browser policy,
   authenticator, hardware, or a combination;
2. **credential material:** readable bearer secret, opaque software handle,
   RP-bound authenticator credential, or no credential;
3. **copied-origin behavior:** exact tested unauthorized origin and result;
4. **allowed-origin hostile-runtime behavior:** whether injected/modified code
   can still exercise the admitted capability;
5. **cross-principal behavior:** whether another account/credential can invoke
   the private operation;
6. **same-principal relay:** whether an admitted attacker can forward fresh
   permitted inputs and outputs;
7. **source/state disclosure:** which implementation or state remains outside
   attacker-controlled memory;
8. **performance contract:** matched workload, strict >2.5x observations, and
   whether authentication/session costs are included;
9. **changed assumptions:** user presence, physical authenticator, attestation,
   enterprise policy, remote trust, or hardware isolation.

A single "domain locked" label is too coarse for candidate selection.

## Current research decision

For software-only COO/SNO, do not allocate major research effort to stronger
local hostname predicates without a new independent trust boundary.

For SCO, server-private execution plus cross-principal authorization remains
the useful base. WebAuthn is a credible optional RP/account admission layer,
subject to the preregistered lifecycle and performance work in
`workplace/sco-webauthn-candidate-charter-2026-11-19.md`.

The project should continue to treat authorized same-account online relay as an
explicit negative control rather than an implementation bug that local
obfuscation is expected to eliminate.
