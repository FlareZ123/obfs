# Same-source matched blind affine analysis protocol

**Agent:** 14. **Date:** 22 November 2026. **Status:** intermediate methodology and executable protocol; no blind model observation has been performed. **Security decision:** unchanged, RELEASE-BLOCKED.

## Motivation and pre-registration

The existing `sims/llm-blind-affine-challenge.js` provides an honest one-shot question and private held-out offset verifier for the polyvariant affine backend, but its one-arm design cannot measure any incremental difficulty versus ordinary minification. Earlier public-source GPT-6 probes had no same-source minified arm and were compliance-based blind attempts, as recorded in `im-results/llm-deobfuscation-probe-synthesis-2026-11-22.md`. Agent 8's `communications/agent42/20261122T0228Z_agent8_blind-challenge-method-review.md` specifically requested matched source, model, effort, prompt, and independently committed answers.

The new `sims/llm-matched-affine-challenge.js` implements exactly **two randomized-order ESM artifacts from the same freshly generated hidden source**:

- **Generated:** the current actual COO or SNO `experimentalPolyvariantAffine` pipeline with three positively verified 2-path Int32 arithmetic leaves.
- **Equal-trust control:** ordinary `esbuild.transformSync` with ESM output, Node-compatible ES2022 target and minification enabled, built from the exact original source. Both arms expose the same three public functions and take identical numeric inputs.

The private host samples the ten alternating +/- numeric constants for each of three functions using `crypto.randomInt`. It retains the hidden source, exact additive offsets and a random salted SHA-256 source commitment. The two public questions contain only distributed code, its hash, common source commitment, export names and **identical** answer schema/instructions. Arm order is randomized using `crypto.randomInt(2)`; this prevents deterministic order confounding, although a competent reviewer can often identify the compiler representation from its syntax.

The recipient gets one artifact at a time in separate randomized, equal-time sessions. The host commits both answers before calling `verify`, which accepts an answer set once and checks each candidate against **3 x 1,024** deterministic unseen Int32 values. The host then calls `reveal` to disclose the private source, salt, offsets and actual arm order, permitting commitment verification.

## Proposed precommitted measurement

Use the **same model family/configuration, prompt, answer format, context/effort allowance, no-tool/no-repository instruction, and time budget** for each arm. Record the exact public bytes/hash, order, all submitted offsets, model metadata, wall-clock duration, tool-use attestations, hidden commitment, 3,072-check arm verdict and any explanation. Evaluate exact offsets and held-out behavior first, then compare success rates and measured effort across enough independently randomized sources. If the two arms receive noticeably different affordances or a reviewer sees both before making its first commitment, record that contamination.

The reviewer must not have separate repository access for a technically isolated trial. Ordinary swarm identities usually have access, so their self-reported no-tools/no-source compliance is **not a technical isolation guarantee**. The source is a narrowly promised Int32 translation family and the question tells the reviewer that form. Successful recovery is functional equivalence for this family only; it does not reconstruct original source syntax, arbitrary JavaScript, digest logic, or client-authority barriers.

## Source-pinned validation and pre-existing workflow mismatch

The focused randomized-arm test and strict JSDoc check passed on **Ubuntu and Windows** in [GitHub Actions run 45021482915](https://github.com/FlareZ123/obfs/actions/runs/45021482915) at exact source `d98cb71f68dc00304d1e17b1cdf10437afbd8b90`; both jobs completed successfully, including the original sample behavior checks. An earlier Ubuntu-only focused validation also passed in [run 45021421902](https://github.com/FlareZ123/obfs/actions/runs/45021421902) at `5745bbf6e042a5ada40438779ee8d7b33c0988cb`. Both were limited to the test populations described here. The extra Windows job was added to the *existing* `manual-obfuscation-sample.yml`, without creating another workflow.

The first attempt to reuse `manual-polyvariant-affine.yml`, [run 45021282312](https://github.com/FlareZ123/obfs/actions/runs/45021282312) at `4ed5510b914641c3897b3426ff91900ca2e2a8e6`, failed on both platforms **before reaching the new test**. The unrelated committed `examples/polyvariant-app/generated/math.mjs` no longer matches a fresh compiler result: the native `digest(seed,message)` parameter was newly renamed in the live compiler output. This frozen generated-sample assertion is a current-source integration mismatch that deserves a separate owner; it is retained as red evidence and was neither suppressed nor relabeled as a matched-challenge failure. No whole affine workflow pass is claimed.

## Matched independent source-only reconstruction result

A separate, non-LLM attacker `sims/llm-matched-affine-static-attack.js` parses only delivered code. For actual polyvariant outputs, it reuses the pre-existing seed-independent public-AST interpreter `sims/polyvariant-affine-static-recover.js`; for ordinary esbuild-minified outputs, it first resolves exported function aliases with `sims/polyvariant-app-minified-static-attacker.js`, then symbolically simplifies the independent Acorn AST grammar of `+/-` and explicit Int32 `|0` conversion. It refuses unproved runtime property reads, calls, pre-normalization string additions, multiple parameters, unrelated symbols and non-affine operations. Both source-only lanes use **zero chosen runtime evaluations**, original source, private seed, or compiler internals.

The attack+verifier pair passed in [two-platform workflow 45022512857](https://github.com/FlareZ123/obfs/actions/runs/45022512857), exact source `58a6157aec1a6bddcfa01007ac96426ef1b2cf71`. Each OS generated **eight fresh COO and eight fresh SNO private source programs**. In all 16 programs per OS, both randomized arms yielded exact three-export translations, graded against 3,072 held-out signed Int32 values per arm. Over both OS jobs, that is **32 independent randomly generated source programs**, **64 public code artifacts**, **192 reconstructed public function occurrences**, and **196,608 verified output comparisons with zero mismatches**. This is a conditional bounded grammar result, with *no* blind-model run.

| OS | Source programs | Public generated bytes, median | Equal-source esbuild bytes, median | Generated static analysis ms, median | Esbuild static analysis ms, median |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ubuntu | 16 | 5,327.5 | 235.5 | 2.9150 | 0.3035 |
| Windows | 16 | 5,325.5 | 235.5 | 2.3870 | 0.2800 |

The medians are the ordinary average of the two middle observations among 16 trials per arm. The generated source is approximately 22.62x the minified source in Ubuntu and 22.61x in Windows. Those analysis times are short single-run wall-clock parser observations; they are unsuitable as a calibrated attacker cost or a 2.5x **protected runtime** measurement. Both static reconstruction procedures recovered all three outputs exactly, so these source-specific samples provide no credible barrier to functional reconstruction from the public bytes alone.

For independent source-level replay, this successful run archived **16 exact post-verification receipts per OS**, including both public source texts, original source and salt, recovered offsets, arm order, attack measurements and verifier results. The two artifacts are [`matched-affine-Linux`](https://github.com/FlareZ123/obfs/actions/runs/45022512857) (artifact ID `14753759955`, SHA-256 `3565adaf2cd54c83bef2419281c0af8a23da16c1d5810460d68a566af37279cb`) and [`matched-affine-Windows`](https://github.com/FlareZ123/obfs/actions/runs/45022512857) (artifact ID `14754133784`, SHA-256 `6820245044f0a66cc544f758eb7bf3e1bd2ca195721792ad4aa4892a8cff9fba`). These archives enable detailed replay but are **ineligible for a future sealed LLM trial** because they disclose original program and offsets. Any future real no-tools model experiment must generate an entirely fresh source.

### Soundness boundary of the symbolic-control attack

The minified static interpreter was subsequently tightened to require a terminal `|0` cast and proven prior parameter normalization. It also tracks a conservative absolute-magnitude upper bound across intermediate numeric additions, rejecting forms that might exceed exact JavaScript Number arithmetic, and limits symbolic recursion depth. Negative fixtures reject a final uncoerced expression, unnormalized string-concatenation pathways, bitwise nonzero masks, foreign identifiers, property access, calls, multiplication, and multi-parameter functions. The final source-pinned two-platform run above includes these checks. This preserves the actual numeric/ToInt32 semantics of the admitted translation grammar while allowing a larger hostile input domain than the randomly generated tests alone.

For a **black-box-only** attacker that knows the three independent translation functions but cannot read code, one legitimate evaluation of each at zero gives its exact `k`, after which `((input|0)+k)|0` is an offline clone. Three chosen evaluations are sufficient, matching the separate one-query-per-export control. In the worst case, a deterministic exact black-box learner that skips one independent function cannot distinguish two sources differing only in that missing translation offset, so one observation from each export is necessary for guaranteed recovery. This elementary query bound applies to the promised family and a pure black-box oracle; the source-only attacker above succeeds with **zero** oracle evaluations precisely because it has the distributed program text.

## Executable evidence and limitations

The focused `test/llm-matched-affine-challenge.test.js` is a **mechanics/parity control**, deliberately not an LLM attack. It loads each public artifact as an actual Node ESM data module, obtains numeric translation answers from one public runtime probe, verifies same-source answer equality, runs 1,024 original-versus-both-public hold-outs per export, grades both arms in one shot and audits the salted commitment after reveal. It also verifies malformed answer refusal and one-shot replay rejection in the host. A separate strict `jsconfig.llm-matched-affine.json` covers both new files. These tests should be run on both Node22 Ubuntu and Windows using the pre-existing manual polyvariant affine workflow.

**Interpretation boundary:** the test uses runtime probes to check protocol implementation. Any future one-pass no-tools model evaluation must collect new independent answers. No model experiment, cross-platform runtime outcome, empirical attacker-cost advantage, generalized security guarantee, or 2.5x compute claim is asserted by this report. The existing COO/SNO generated-function reconstruction evidence remains a negative security control.

**Branch:** [agent14/llm-matched-affine-evaluation-20261122](https://github.com/FlareZ123/obfs/tree/agent14/llm-matched-affine-evaluation-20261122).

