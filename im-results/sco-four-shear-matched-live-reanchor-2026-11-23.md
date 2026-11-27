# Real authenticated SCO versus ordinary minified API: exact four-shear preimage comparison

**Agent:** 20. **Date:** 23 November 2026. **Status:** source-pinned intermediate adversarial HTTP result, not an established universal security theorem. **Primary release:** RELEASE-BLOCKED.

## Scope and equal-trust trial

A private 32-bit JavaScript ESM function wraps four **interacting compatible triangular shears** at bits 17, 21, 25 and 29 between two unknown invertible affine 32×32 GF(2) maps. The private source includes 32-bit input/output offsets and gates constructed so a source-known target triggers all four shears. The production conservative SCO selected-export machinery only admits **distinct top-level primitive literal consts**, so the fixture expresses its private map and gate values as separate literal declarations, with arrays assembled inside the selected function. The initial top-level-array version was correctly rejected by the SCO admission policy in [red focused run 45288870203](https://github.com/FlareZ123/obfs/actions/runs/45288870203); this is a source-eligibility correction, not a security bypass.

Two independent localhost Node HTTP arms import the **same original private source semantics**:

- **Generated SCO:** production `partitionScoSelectedAsyncExports`, `bindScoModuleExports`, and `createScoHandler`. The attacker fetches only the generated public ESM facade, learns its public method route, and submits authenticated `/obfs/rpc` requests to the server-private implementation.
- **Ordinary minified API:** the same original ESM is independently minified using `esbuild.transformSync({minify:true,format:'esm',target:'es2022'})` and served through a minimal native Node HTTP RPC handler with the same credential, exact private method signature, and unsigned 32-bit input contract. The native method route is part of this arm's public API contract.

Both arms deny missing-credential calls with HTTP 403. The attacker is deliberately authorized in each arm and knows only the published target and public RPC method contract. It cannot read the private ESM, inner/outer affine keys, gate specifications, or fixture secret. The attack is a chosen-input functional preimage request, **not unauthorized access or source extraction**.

The public-only inversion runs the same `invertByReanchoring` policy in both arms. Because HTTP is asynchronous and the inversion core is synchronous, a `NeedQuery` exception pauses the core whenever it requests a missing oracle input; the driver makes one genuine authenticated HTTP request, memoizes the reply, and replays the deterministic core. This maintains the exact distinct oracle request count and avoids synthesizing server responses.

## Source-pinned two-platform outcome

On source commit `e1dc38511896a62b9da2650a69b448a24bb019cc`, [focused workflow 45289067929](https://github.com/FlareZ123/obfs/actions/runs/45289067929) passed both Ubuntu and Windows. The complete raw output is printed as `SCO_FOUR_SHEAR_MATCHED_HTTP` by `sims/sco-four-shear-reanchor-matched-http.js`, enforced by `test/sco-four-shear-reanchor-matched-http.test.js`.

| Measurement | Generated SCO | Ordinary minified native API |
| --- | ---: | ---: |
| Authorized input/output oracle requests | **38** | **38** |
| Reanchoring fixed-point corrections | 4 | 4 |
| Source-private function executions | 38 | 38 |
| Missing-credential HTTP status | 403 | 403 |
| Exact original secret recovered | Yes | Yes |
| Private constants in public facade | None detected | No private facade served |
| Original/minified server-private ESM bytes | 4,578 | 2,119 |
| Served generated client facade bytes | 571 | 0 (native method route is public contract) |
| Private program semantic control inputs | 133 | 133 |

Both arms emitted **identical authenticated query transcripts** with SHA-256 `10d6bcbe43e33ce64db8df2f432592b93bea379609f7ceda24c5e0b0a1a67d7a`. The source SHA-256 was `20041fa12f01c1308991946198fb1ffc8ceba732e5c235484a042353a8f2e18a`. In the normal-source sparse four-shear policy the canonical anchor is independently proven clean; this is a source-conditional theorem fixture. The attacker does not receive the clean-anchor result.

The 133 extra private semantic probes per arm are **harness-only preflight comparisons against the original source**, outside the chosen-query transcript and private server execution counter. They show that esbuild minification and SCO server placement preserve this selected function on those inputs; they do not constitute an exhaustive 32-bit semantic equivalence proof.

## Decision

For this selected source and authorized same-account forward-oracle threat model, SCO withheld the implementation and keys while giving **zero measurable incremental input/output preimage resistance over ordinary minified native RPC**. The request sequence, request count, recovered result, authorization denial, and private-execution count matched exactly. The stronger source-private secrecy boundary remains intact.

This source family uses a separately validated clean interpolation anchor. Dense high-degree or unconstrained compatible sources need independent assessment; successful 38-query inversion cannot be extrapolated to them. The experiment recovers **one target while the legitimate server is available** and does not show post-shutdown offline functional cloning, browser DevTools extraction, tamper-resistance bypass, or universal domain/URL locking. No cold-start or 2.5× defender compute conclusion follows; native and SCO public JS delivery are deliberately distinct, and the comparison is limited to equal authorized RPC behavior.

The result complements `im-results/reanchor-vs-lowrank-matched-2026-11-23.md` and the general conditional `2n=64` proof at `im-results/reanchor-depth-tightness-2026-11-23.md`.
