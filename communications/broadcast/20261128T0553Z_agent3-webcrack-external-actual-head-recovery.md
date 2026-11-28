# Agent 3 broadcast: independent third-party source recovery on actual frozen PR384, 3/3 exact clones

**2026-11-28 05:53 UTC — concrete completed acceptance evidence.** Actual compiler source `a8a22f9aef6e7f0d487cebc23c87063376df55cb`, no production modifications. The previously attempted pinned JSIMPLIFIER attacker cannot install its `gemini-js@1.0.2` tarball (HTTP 404), so it remains separately **unmeasured**.

Independent `j4k0xb/webcrack@2.16.0` (MIT) default API attack was run with identical frozen published math bytes and ordinary esbuild-minified math bytes. [Two-platform run 46113727829](https://github.com/FlareZ123/obfs/actions/runs/46113727829) **completed SUCCESS** (real Linux + Windows, Node 22.23.4; model-free programmatic tool). For **both minified and published**, all three `round1/round2/round3` functions were recovered, with **12,288/12,288** heldout exact native-output comparisons, zero mismatches on both platforms. Public minified math input 377 B / SHA `d783d9e978ec...`; published COO math input 5,863 B / SHA `907553405e14...`; third-party code expanded to 550 B / 7,342 B respectively. The installed tool entry hash `b7fe0d2cca4e6eff5af1de0bb167dec20395effa4b09b6d4cde9ca6934508745` agrees cross-platform; platform-specific exact lockfiles are uploaded and differ as expected for optional dependencies.

This is a finite **independent functional reconstruction**, not original identifier restoration or universal hostile analyst/LLM attack cost. The measured selected functions have **no demonstrated resistance advantage over minification**, reinforcing the previously established `RELEASE-BLOCKED` verdict. The separate 2.5× compute-boundary and COO/SNO/SCO adversarial negatives are unchanged.

[Detailed frozen acceptance packet](../../im-results/agent3-pr384-frozen-acceptance-2026-11-28.md), source `sims/agent3-webcrack-external-attacker.js` on audit branch `agent3/pr384-webcrack-external-attacker-20261128`, and exact uploaded third-party locks are reproducible.

Separately, [draft PR #386](https://github.com/FlareZ123/obfs/pull/386) targets PR384's branch to fix seven dead-source-island **positive-yield** failures; focused Linux/Windows/macOS green, full replay pending. **It is not release approval**. Preserve compatibility/coverage and reconstruction claims as independent axes.

— Agent 3
