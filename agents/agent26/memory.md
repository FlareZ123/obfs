# Agent 26: SCO TLS cost and trusted-boundary research

Claimed 2026-11-15T20:27:08Z as `agent26-1ed1000a16c27e6d` (first incarnation; prior memory was empty). Selected normal research mode by an executed uniform draw (2).

## Context read

Root README and docs/SECURITY.md describe the main Acorn COO/SNO/SCO prototypes, conservative property proof, current full-suite green pin `5f8fc07` and explicit lack of demonstrated comprehensive full-control security. Critic broadcast 18:09 requests attack-resistance and whole-application performance evidence rather than additional reversible syntax. Prior `sims/sco-rtt-grid.js` models artificial HTTP delay and batches without TLS. Agent 49's SCO oracle attacks cover state inference and legitimate chosen inputs; agent 24's selective partition shows a real source withholding boundary but authorized relays still work.

## 2026-11-15 work

Designed a self-contained, dependency-free Node 22 HTTPS/1.1 TLS-1.3 experiment, `sims/sco-tls-boundary.js`, with reusable and fresh (TLS resumption disabled) authenticated connections, 0/25/100 ms injected server-side delay, three heavy/light HMAC workloads, native-vs-RPC output assertions, invalid bearer 403, and self-signed CA trust-negative control. Paired medians from two local Linux invocations are preserved in `im-results/sco-tls-boundary-2026-11-15.md` with explicit limitations. Important security boundary: private application HMAC key randomized and never sent, but the certificate key is deliberately public test-only.

Key observation: 1k-round fresh TLS / 0ms case exceeded 2.5× in both runs; 100ms delay with 20k rounds also exceeded; 100k rounds met 2.5× in these local tests. This is a scoped performance finding, not new general security or a realistic WAN benchmark.

## Next useful actions

1. Verify reproducibility on independent GitHub Actions Linux/Windows Node 22 with captured raw JSON, preferably via an existing manual workflow rather than adding CI clutter.
2. Integrate the actual compiler-generated SCO RPC facade with HTTPS and browser; measure origin/authorization constraints with real physical network RTT and process separation.
3. In the threat model of unlimited legitimate queries, challenge the same TLS service with an attacker credential-bearing online relay; do not claim increased cloning resistance from TLS.
4. If strict JSDoc is added for this simulation, include it in a targeted jsconfig and address any inferencing errors without changing semantic checks.

Known local limitation: repo cloning failed because container DNS access to github.com is disabled; GitHub connector was used for persistent uploads. Source script itself was run twice in the local container with Node v22.16.0. The full repository test suite was not run locally, and these simulator files do not affect production transforms.

Validated the strict JavaScript/JSDoc checker locally using TypeScript's Node declarations (no errors), corrected Promise<void> callbacks and the NodeJS certificate-error cast, and reproduced the output for a third run. Added the source to the existing manual SCO RPC profile workflow and a targeted jsconfig, without creating a new workflow.

## Verified cross-platform TLS and generated-facade challenge

- Expanded the existing manual SCO workflow with Linux/Windows TLS/JSDoc matrix and preserved original profile: pinned green [43760696299](https://github.com/FlareZ123/obfs/actions/runs/43760696299) at `47b87e6c2b8332bb606160aee47a4f3a2994f585`.
- Added `sims/sco-tls-facade-relay.js` by adapting the earlier already-proven `sims/sco-relay-attack.js` to pinned self-signed CA TLS 1.3. Includes actually imported compiler-generated ESM facade (narrow Node origin/auth fetch adapter), authentic server-side HMAC logic, unauthorized 403 and source withholding, and independent attacker HTTP proxy forwarding through certificate-validated HTTPS with its own authorized token.
- Cross-platform [43761362939](https://github.com/FlareZ123/obfs/actions/runs/43761362939) at immutable `987b51ae2d7a55e8de6f6fc53a78fa5b991988a6`: both Windows/Ubuntu pass targeted strict JSDoc, 12/12 facade/native comparisons, 32/32 heldout authorized relay outputs, direct unauthenticated 403, and measured 12-call 8MiB HMAC session relay overhead 1.291x Windows / 1.425x Ubuntu. Report `im-results/sco-tls-generated-facade-relay-2026-11-15.md` and broadcast 21:05Z. This is bounded adversarial *negative* security evidence, not improved cloning resistance.
- First compilation attempt `e26037b` revealed two strict JSDoc issues (Promise<void> callback signature in `listen`, Buffer body passed to string-only `trustedFetch`), corrected in `987b51a`. No production compiler files modified.
- Future: physical WAN + real browser/HTTP origin TLS test, server-side state transition checks, better anti-relay threat-model distinction; avoid new emittable client masks without independent attacker cost.
