# White-box execution boundaries for the three obfuscator modes

**Agent 1, 18 November 2026. Classification:** formal threat-model analysis
and decision constraints. This is an explanatory working note, without a novel
cryptographic impossibility claim or an unmeasured empirical security claim.

## Scope

The [primary objective](../README.md) asks for source unreadability,
modification resistance and execution restricted to authorized environments
under separate SCO, COO and SNO threat models. Strong words such as "only"
and "cannot" need a specified verifier and execution trust boundary. The
propositions below distinguish a full-control attacker reusing an artifact
from an attacker reconstructing its source. The two capabilities have
different complexity and security implications.

Let `D` be the complete distributed artifact, `E` the execution environment
and `F_D(E,x)` the sequence of externally observable effects from running it
on input `x`. The security goal may include secrecy of `D`'s embedded logic,
integrity of `F_D`, or denial of unauthorized execution. Each proposition
states its own assumptions. Genuine external services, unforgeable hardware
attestation and externally enforced permissions are excluded from the
self-contained full-control claims.

### Proposition 1: COO functional code lifting under a fully simulated local environment

**Assumptions.** The distributed COO artifact contains every component
required to compute a supported output given local inputs and observable host
interfaces. The adversary obtains every distributed file, may run those bytes
in an instrumented engine, and can emulate local host observations needed by
the selected application. The client does not require an external trusted
decision about each authorized operation.

**Construction.** The adversary copies the complete distributed artifact
and implements a host adapter `E'` that presents the same local observations
as the intended environment `E` for the tested inputs. The cloned executable
invokes the copied code directly. Consequently, for every `x` for which
`E'` faithfully simulates `E`,
`F_D(E',x) = F_D(E,x)`, without identifying the source-level algorithm.
The attack may leave every integrity-checked byte unchanged. Modification of
the ultimate public result is possible in an output wrapper that lies outside
the artifact's checks.

**Boundary.** This is a conditional functional-cloning construction. It does
not prove that simulating all possible host interactions is cheap, that the
original source text can be recovered, or that every browser security
primitive can be emulated. Real origin-bound server decisions, hardware
secrets and device attestation change the premise and must be modeled as
distinct authorities. A client-only string comparison with
`location.hostname` cannot itself supply such an authority to an attacker
who controls the JavaScript engine and local host observations.

### Proposition 2: SNO local integrity cannot bind results to an adversary-controlled runtime

**Assumptions.** The SNO attacker controls the server filesystem, Node
runtime and memory, as specified in the primary objective. Verification and
the application execute within that same authority domain, with no external
trusted observer enforcing what response leaves the process.

**Construction.** The attacker can run the integrity-verified entry without
altering its signed or hashed files, observe the returned result, and apply
an arbitrary transformation afterward. The verifier continues to accept the
original files because its checked bytes were preserved. Alternatively, an
attacker-controlled module loader can substitute execution or verification
behavior while preserving the original manifest on disk. A public checksum
has no independent authority when the attacker also controls its checker.

**Boundary.** This establishes that checking local file bytes alone cannot
guarantee end-to-end result integrity against the stated SNO attacker.
It does not establish the computational cost of identifying a particular
private algorithm, nor does it deny that internal consistency checks can
detect accidental corruption or unauthorized changes in a narrower,
trusted-runtime deployment. Such checks remain operationally useful.

### Proposition 3: authorized same-account SCO oracle forwarding

**Assumptions.** A genuine client may invoke operation `m` on a trusted
server for account `A`, and the attacker legitimately controls such an
account. The service accepts the attacker's unlimited authorized requests,
and the attacker can observe the returned `y`. The desired copied
functionality is the observable behavior available to `A` through the
server, without requiring private source extraction.

**Construction.** A forwarding program receives a query `x`, invokes the
same server operation using the genuine authorized account `A`, and
returns the observed `y`. For every accepted `x`, it reproduces the
service's response for `A` with one online service query and the associated
communication and local forwarding costs. Server-private source, keys,
state and account policies need not be extracted.

**Boundary.** This is a live-service relay. A forwarding client remains
dependent on the original server, its credentials, policy and availability.
Account B's results need not be obtainable from Account A's token.
The proof does not say a private keyed computation is recoverable offline,
or that a revoked account can keep using the original server. Fresh account-
scoped nonces and session state can alter what a copied query means, but
cannot, by themselves, conceal a response delivered to the authorized
attacker account.

## Security axis decision rule

| Axis | What the conditional constructions establish | What they do not establish |
| --- | --- | --- |
| Static reconstruction | No static source recovery is required for code lifting or online forwarding | Recovery of original names, structure, secrets or bytecode |
| Dynamic extraction | The distributed code or an authorized output can be reused at the execution boundary | Universal extraction of all private SCO server methods or state |
| Unauthorized modification | An attacker-controlled outer output boundary defeats artifact-internal SNO checks as an end-to-end guarantee | Breaking the cryptographic collision resistance of SHA-256 |
| Environment locking | Self-contained COO local checks rely on host observations an engine-level adversary may simulate; SNO checks share attacker-controlled trust | Bypassing an external authorization service or hardware root |
| Runtime budget | Relay, emulation, and isolation costs require workload- and platform-specific measurement | Any unconditional 2.5× statement from these propositions |

The primary objective can still seek expensive static deobfuscation,
harder-to-patch internals, higher-cost instrumentation, excellent
compatibility and measured performance. Security claims must name an
attacker budget and the exact artifact plus trusted components.

## Existing executable witnesses in this repository

- `sims/closed-graph-host-bypass.js` and
  `sims/branch-block-host-bypass.js` investigate local environment
  control in specific COO workloads.
- `sims/sno-esm-runtime-hook-attack.js` and
  `sims/polyvariant-app-sno-static-attacker.js` cover specific SNO
  runtime manipulation and offline recovery, with pinned evidence in
  `im-results/`.
- `sims/sco-ratchet-online-relay.js` and
  `sims/sco-ratchet-minifier-control.js` provide a bounded live relay
  against trusted server-private code and an equal-trust ordinary-client
  comparison. Their pinned observations are recorded in the corresponding
  SCO ratchet intermediate reports.
- `sims/release-evidence-gate.js` reports four security axes and strict
  performance separately, returning `RELEASE-BLOCKED` on its tested
  public artifacts and relayed services.

These are concrete samples supporting the practical relevance of the
conditional constructions. They should not be reinterpreted as proofs
that every possible program admits efficient complete source recovery.

## Relevant external research

The general virtual-black-box (VBB) obfuscation impossibility results of
Barak, Goldreich, Impagliazzo, Rudich, Sahai, Vadhan and Yang provide
historical context. Their theorem constructs unobfuscatable program
families under a specific formal VBB definition. **Our three simpler
execution-boundary propositions are separate and do not follow by
substituting the VBB theorem for a proof.**

- [Barak et al., *On the (Im)possibility of Obfuscating Programs*,
  CRYPTO 2001 and later full paper](https://www.wisdom.weizmann.ac.il/~oded/p_obfuscate.html).
- [ETSI TR 103 642 V1.1.1, *Security techniques for protecting software
  in a white box model*](https://www.etsi.org/deliver/etsi_tr/103600_103699/103642/01.01.01_60/tr_103642v010101p.pdf),
  especially the white-box and code-lifting threat vocabulary.

## Proposed architecture-selection discipline

Require each proposed security backend to declare which independent axis
it changes over an equal-trust minified control. If a private secret must
remain unavailable to a fully controlling client, put that secret and
its sensitive computation behind an SCO trust boundary and explicitly
measure authorized relays, cross-account policy and full runtime costs.
COO/SNO experimental transforms should claim quantified attack resistance
for frozen workloads, with a stop condition when a static, dynamic or
copy-based attack succeeds. A correctness pass with zero transformed
private work is insufficient evidence of protection.

This note changes no implementation or current `RELEASE-BLOCKED`
conclusion.
