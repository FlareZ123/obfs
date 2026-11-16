# Frozen application: source-observer refusal versus transformation yield

**Date:** 2026-11-16. **Classification:** intermediate, reproducible compatibility and transformation-coverage experiment. No obfuscation-security claim is established by a source-preserving refusal or by a file-changing rewrite.

## Pinned reproducible comparison

The six-module Node ESM COO application is frozen in [examples/application-challenge/before/](../examples/application-challenge/before/) with SHA-256 of NUL-joined module source text `48525e6f89a7561aad52edbc54fa7e7ddc64948ce63c4ecb1f1e3cc9bfa79b09`. The same declared `SEED` from its build script and `obfuscateFiles({mode:'coo',closedWorld:true,identifiers:true,properties:true,strings:false})` were used for both variants. The input file order, Node ESM runtime and 84 deterministic inputs were held constant.

The [reproduction script](../sims/application-challenge-refusal-yield.js) materializes original and obfuscated ESM files into isolated temporary directories via the atomic writer, executes both with Node's actual ESM linker, checks full parsed JSON output equivalence, and records SHA-256, source byte counts, field coverage and file changes. The frozen graph includes a mixed computation, imported private fields, cross-file identity forwarding, and a public `window.externalValue` host interface.

| Measured metric | Original source-observing application | Distinct source-observer-free *diagnostic control* |
|---|---:|---:|
| Modules | 6 | 6 |
| Candidate private own fields | 2 | 2 |
| Private fields actually renamed | **0** | **2** |
| Files with changed emitted text | **0/6** | **6/6** |
| Input source bytes | 2,786 | 2,794 |
| Emitted source bytes | 2,786 | 3,059 |
| Native-versus-emitted outputs | **84/84 matched** | **84/84 matched** |
| Input SHA-256 | `48525e6f89a7561aad52edbc54fa7e7ddc64948ce63c4ecb1f1e3cc9bfa79b09` | `9f7a99532ee27b1d6d8b0e243eacc8daaf1e23ea515ca4d4fe0d026e415366ca` |
| Emitted SHA-256 | Same as input | `e17e289797e9e4ca6fd45822760f7d35ea8ca55716196931141409aabb84aba8` |

The second, source-observer-free variant is constructed by the existing [observer ablation diagnostic](../sims/application-challenge-observer-ablation.js), replacing the unrelated descriptor-reading expression in `reflect.mjs` and an output newline concat in `entry.mjs`. **These interventions change source-program semantics.** The positive variant is a *different application* whose native output is compared against its own transformed output. It cannot demonstrate that rewriting the original source-observing application would be correct. It is, however, a concrete positive control showing cross-file property transformation becomes possible with those observer expressions absent. Its 6/6 changed files include lexical mangling and do not quantify the fraction of meaningful protected computation, attacker reconstruction cost or strength of security boundaries.

## Cross-platform evidence

The new ledger is included in the existing manual-only [frozen application workflow](../.github/workflows/manual-application-challenge.yml). [Pinned run 43821290036](https://github.com/FlareZ123/obfs/actions/runs/43821290036) at commit `c3454f06e925371d21e4c09c5cac409a17a64f6e` **passed Ubuntu and Windows** on Node 22, while continuing the frozen COO/SNO adversarial experiments, semantic checks, whole-session profiler and Linux Chromium check. The table reproduces the exact `APPLICATION_REFUSAL_YIELD` log line from its Ubuntu challenge job `133144725952`. The code is deterministic: the same script is executed by the Windows matrix with the same source and fixed seed. A subsequent commit explicitly added `sims/application-challenge-refusal-yield.js` to the separate strict `jsconfig.external.json` project, requiring an additional pinned gate to validate its own JSDoc types; do not assume run 43821290036 alone checked this newly added include.

The original six-file artifact was already independently shown to be byte-identical to its original, with 160/160 held-out public-file copy attack results ([baseline report](application-challenge-refusal-2026-11-16.md)). The currently measured 0/2 rename count remains a deliberate semantic refusal. The alternate variant's 2/2 private-field rename count is structural coverage evidence only. It was not independently attacked for deobfuscation, authorization bypass or runtime extraction under a bounded adversary.

## Relationship to native function-source observers

The active conservative `observesFunctionSource` rule prevents rewrites when function-source text might cross a module boundary. The [new native Intl and locale-method differential evidence](intl-native-source-observation-2026-11-16.md) confirms that there are additional real user-program paths where this refusal is necessary. The experiment emphasizes the price of that policy: even unrelated observability can leave all client-delivered application code byte-identical, making it trivial to copy. Future improvements should preserve each explicit source-observation contract while making ownership proofs and source-transformation eligibility more precise.

**Remaining decision:** benchmark independent attacker reconstruction and extracted behavior on an *actually transformed*, representative positive application with whole-session costs inside 2.5×; compare to native/minified as well as the frozen byte-identical negative control. Distinguish eligible private fields, transformed protected logic and attacker effort in the final report.
