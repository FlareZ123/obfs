# SCO private capability architecture: conditional admission verdict (Agent 17, 2026-11-17)

**Purpose:** one source-pinned synthesis of the experimental principal-bound capability design, its independently reproduced black-box adversary, real Node/Chromium behavior, and CPU/session-cost constraints. This is not a verified general-purpose obfuscation release or a substitute for PR #65's ownership review. Authoritative source of program behavior remains the tested code and immutable CI logs.

**Evaluated candidate:** Server-controlled obfuscation with the key, state and private module retained by a trusted server; the user receives only a compiler-generated async ESM facade. A server-bound verified principal controls opaque 256-bit, URL-safe capability handles with per-principal isolation, bounded live capacity and revocation. Client-only and attacker-owned-server modes do not inherit the trusted boundary. The attacker can freely modify its client, inspect all public files and network responses, and make unlimited legitimate authenticated calls.

## Independent dimensions

| Dimension | Evidence | Scoped verdict |
| --- | --- | --- |
| Static client-side reconstruction | Real compiled public facades omit private key, HMAC implementation and private model canary; Node HTTP and Ubuntu Chromium verified absence. This is a genuine trusted-server boundary only when private source is never distributed | **Private bytes withheld** under the trusted SCO model, no offline general-source recovery proof |
| Dynamic behavioral reconstruction | Public-only four-state learner reuses existing source-blind algorithm, 837 authorized public RPCs with 125 revocations under default 256-handle principal quota; learns 4 states and passes 2,046/2,046 offline words plus 64/64 post-commitment live HTTP words, with 768 verifier-only RPCs separate from training | **Finite-state behavior cloned** under permitted chosen queries; high-entropy private key extraction not shown |
| Unauthorized modification and integrity | Unauthenticated RPC 403, other-account bearer use rejected, browser key withheld. No client-side anti-tamper claim; same-account online relay and client instrumentation remain possible | **Observed account boundary holds**, but authenticated client cannot be prevented from observing or relaying own permitted outputs |
| Authorized environment | Verified identity is obtained from a trusted server-side callback for the fixture; HttpOnly cookie in actual Chromium, no acceptance of caller-supplied principal argument | **Per-principal locking shown** for test identities, no general URL/domain/hostname or stolen-credential enforcement guarantee |
| Compute / compatibility | Server-local 20m-transition CPU: 24/24 per-step pairs >2.5x, 0/24 per-session pairs >2.5x. Real generated-facade HMAC sessions: 16 x 8MiB private HMAC, 24 CPU pairs/strategy all <=2.5x, batched wall <=2.239x even with 25ms request delay; serial 25ms-delay wall 12/12 >2.5x. Real Chromium 12/12 digest parity. Invalid input caused different serial vs prevalidated-batch committed prefixes | **Reject per-step capability lookup for hot loops; conditional approval of coarse batch for proven same-contract workloads**, no universal CPU bound or semantic equivalence |

## Source-pinned evidence

1. **Stateful source-blind learner**: test/sco-capability-public-oracle.test.js and im-results/sco-capability-public-oracle-2026-11-17.md. Full Ubuntu+Windows+typecheck pass: https://github.com/FlareZ123/obfs/actions/runs/44149360637, source e87c04997b7736d062bccf4cf8eeb498fe713e73.
2. **Server-side CPU granularity**: sims/sco-capability-granularity.js and im-results/sco-capability-granularity-2026-11-17.md. Same exact green source/run as (1), process CPU for 20m transitions per trial.
3. **Real server/client end-to-end HMAC sessions**: sims/sco-capability-http-batch.js and im-results/sco-capability-http-batch-2026-11-17.md. Full Ubuntu+Windows+typecheck pass: https://github.com/FlareZ123/obfs/actions/runs/44150242792, exact SHA b9f0b61737881cbc4e6c7f4f1f5b2ef6f0759ad8.
4. **Real Chromium client execution**: test/sco-capability-public-browser.js and im-results/sco-capability-browser-2026-11-17.md. Ubuntu Chromium 12/12 correct; both Node 22 JSDoc checks green: https://github.com/FlareZ123/obfs/actions/runs/44151164627, exact SHA 5dea4a3bcbd389641a073dc5fd7a8f056f8acff2. Windows browser step deliberately skipped.
5. **Batching semantics falsifier and guarded prefix candidate**: test/sco-capability-batch-error-contract.test.js and im-results/sco-capability-batch-error-2026-11-17.md. Initial two-platform named test step green at source ff5cdb2243da12dbdaeb037a56101bb755d2f91b, workflow https://github.com/FlareZ123/obfs/actions/runs/44151887716. Stronger prefix-preserving variant added subsequently and requires its own pin before final characterization.

## Conditional implementation policy

A coarse server operation is an admissible candidate only when its native source meaningfully performs that amount of useful private work, it returns identical public outputs, it is authorized to do so for the verified account, and a representative complete client/server workload meets the strict paired 2.5x compute target. HTTP latency, cold startup, memory footprint and domain-specific misuse are independent metrics. A heavy 8 MiB input already present in the native algorithm qualifies for this experiment; artificially inflating cheap work solely to bury RPC cost does not.

**Explicitly reject** general claims that opaque handles defeat authorized black-box learning, that same-account clients cannot replay/relay, that a per-step capability lookup fits a tight hot loop, that `SameSite=Strict` cookies prevent in-session fetch instrumentation, or that a prevalidated batch automatically preserves a sequence's partial-progress behavior.

Batching is safe only when the public API already promises atomic all-or-nothing execution, or when the server-client protocol is carefully designed to preserve per-item outputs, errors, state updates and continuation. Even guarded first-error processing does not automatically preserve cancellation, interleaving, observers, side effects and all JavaScript await/microtask semantics. If those are exposed, prefer distinct APIs rather than silently transforming an arbitrary source sequence.

## Research disposition

- **Keep** the server-private capability boundary as an opt-in SCO architecture candidate for high-entropy private state, not a universal obfuscation technique. Its strongest property is that server-held secret source is absent from client files. This property is not available when the attacker owns the SNO server or all COO files.
- **Keep** the source-blind finite-state negative test as a release regression. Future claims must compare raw-source secrecy, offline clone cost, same-principal online relay, authorization, CPU and wall separately.
- **Reject** the default fine-grained RPC/handle lookup path as the principal hot-loop architecture under this workload's 2.5x budget.
- **Investigate** actual application contracts, partial errors, cancellation, multi-tenant concurrency and network conditions before admitting a serial-to-batch rewrite. Do not equate one selected workload's six-trial cross-platform success with a universal bound.
- **Require** Agent12's independent architectural review before incorporating this candidate into the production entrypoint. PR #66 is based on PR #65 and should be considered an adversarial companion, not an unconditional green release.

The limited positive confidentiality result is a consequence of the *trusted server* operating boundary. No computationally feasible client-side obfuscator can claim that same trust boundary under the stated full-control COO/SNO assumptions without relying on separate trusted hardware or services outside the stated model.
