# Current-source equal-trust minification control versus selected COO arithmetic

**Date:** 21 November 2026 UTC. **Status:** independently rerun intermediate negative candidate assessment. This is application-scoped CI evidence, not a general deobfuscation theorem.

## Exact executable provenance

Manual [GitHub Actions run 44931444436](https://github.com/FlareZ123/obfs/actions/runs/44931444436), main source SHA `96126f33046f76250876205abda308d3754cbd92`. Both Ubuntu and Windows matrix jobs passed. Node.js `v22.23.5` on both, Ubuntu Chromium `Chrome/157.0.8103.78` with a **positive 35-ms live CPU-clock probe** and 288 fresh HTTP module requests. Workflow `.github/workflows/manual-minified-control.yml` records exact dependencies, Node + Chromium source SHA, paired distributions, source-only extraction, matched-query oracle, ESM source parity and host callback traces. Raw audit artifacts: `four-way-node-Linux`, `four-way-node-Windows`, `four-way-browser-Linux`, `four-way-cross-runtime-Linux`.

- Original three-module ESM graph: **2,467 bytes**.
- Identical unbundled esbuild `0.28.2` minified control: **1,115 bytes**.
- Selected COO protected graph: **7,498 bytes**.
- Independent source-only reconstructed graph: **2,342 bytes**.

SHA-256 across entire graph is pinned by the workload audit: original `42c039f233285da6dc8f837b3ff2aca62ad73b659cc715838c48fc3226cb52a8`; minified `6ec3fd603b4af09a82784b0e10df71426db1e2564dc402d1e5d60fb2143bd11c`; COO `611a2f64b5421e0e2e150cf1cca1910ac52cb49235b9321f5aa3a3e776f1545d`; reconstructed `77d535303fb563508777debc373b104c6b02c6e9959f67cf8c95e652f09579b0`. These match the separate release-gate rerun on the same graph [44930959323](https://github.com/FlareZ123/obfs/actions/runs/44930959323). The two tests use distinct workflow binaries and timing boundaries.

## Measured security axes

All three named arithmetic leaf functions `round1`, `round2`, `round3` were recovered by a source-only interpreter from emitted COO text. The independent minifier-targeted extractor recovered all three selected functions from esbuild output as well. The matched **three-query public oracle** fitted an Int32 translation clone after exactly one `f(0)` call for each function. It then matched **12,288 held-out native output comparisons per each of four distributions**: original, esbuild, COO and reconstructed. The holdouts are evaluator-only checks and were not counted as fitting queries. A separate nonlinear negative control is part of the workflow.

A distinct source-only attack may require different coding time from another. Do not convert the small benchmark-time differences into human analyst effort or broad static reconstruction claims. The common input-query attack gives no demonstrated security advantage over a conventional minifier for these selected algebraic functions. Test data and adversary grammar are constrained; this does not prove arbitrary code is reconstructable in three queries.

## Independent 2.5× performance diagnostic

| Verified population | Native median ms | COO median ms | Ratio of medians | Paired strict >2.5× |
| --- | ---: | ---: | ---: | ---: |
| Ubuntu Node fresh ESM session, 1 event | 0.47262 | 0.69676 | 1.4743× | 0/12 |
| Ubuntu Node fresh ESM session, 50 events | 0.66867 | 1.02698 | 1.5359× | 0/12 |
| Ubuntu Node fresh ESM session, 1,000 events | 2.73231 | 4.83811 | 1.7707× | 0/12 |
| Ubuntu Node fresh ESM session, 10,000 events | 10.45835 | 14.64916 | 1.4007× | 0/12 |
| Chromium warmed synchronous compute, 10,000 events | 3.65 | 7.95 | 2.1781× | **2/12** |
| Chromium cold graph synchronous compute, 10,000 events | 5.70 | 11.65 | 2.0439× | 0/12 |

The six-population simultaneous median estimate was **inconclusive** (`familywise.verdict=sample-inconclusive`) and the observed strict performance gate was **breached**: exactly 2 overbudget pairs, maximum `2.583333333346807×`. The 95% familywise requested coverage and attained minimum `0.9619140625` refer to simultaneous median-bound inference, not an all-input hard upper bound. Windows Node 1, 50, 1,000 and 10,000-event fresh ESM tests had **0/12** strict breaches each; Node-only decision judged median budget supported, and this does **not** cancel the real Chromium breaches. Browser effects and full output passed the independent differential checks.

Node fresh-session sample time includes ESM loading and synchronous work. Chromium rows specifically separate synchronous compute from fresh browser module import and wall latency; comparisons between those absolute durations are inappropriate. Trial frequencies and OS-specific scheduling constrain generalization.

## Candidate decision

The selected backend is **rejected** against the equal-trust minified baseline, with `candidateChoice=reject`, `staticAttackerVerdict=reconstructed`, `strictComputeBudget=sample-breached` and `releaseVerdict=RELEASE-BLOCKED`. Adding layers to this specific low-algebraic-rank candidate would require a precommitted attacker model beyond the same 3 queries, whole-program transform coverage, independently verified output/host effects, and separate strict CPU measurements. Increasing generated byte count alone is not evidence of practical protection.

This result preserves the current negative selection while updating it to exact contemporary compiler bytes and a live real browser clock. Neither the SNO local-runtime attacker nor SCO authorization boundary was exercised by this four-way test; [current separate cross-mode evidence](release-evidence-revalidated-2026-11-21.md) addresses those tests under their own limitations.
