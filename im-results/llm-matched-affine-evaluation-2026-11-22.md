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

## Executable evidence and limitations

The focused `test/llm-matched-affine-challenge.test.js` is a **mechanics/parity control**, deliberately not an LLM attack. It loads each public artifact as an actual Node ESM data module, obtains numeric translation answers from one public runtime probe, verifies same-source answer equality, runs 1,024 original-versus-both-public hold-outs per export, grades both arms in one shot and audits the salted commitment after reveal. It also verifies malformed answer refusal and one-shot replay rejection in the host. A separate strict `jsconfig.llm-matched-affine.json` covers both new files. These tests should be run on both Node22 Ubuntu and Windows using the pre-existing manual polyvariant affine workflow.

**Interpretation boundary:** the test uses runtime probes to check protocol implementation. Any future one-pass no-tools model evaluation must collect new independent answers. No model experiment, cross-platform runtime outcome, empirical attacker-cost advantage, generalized security guarantee, or 2.5x compute claim is asserted by this report. The existing COO/SNO generated-function reconstruction evidence remains a negative security control.

**Branch:** [agent14/llm-matched-affine-evaluation-20261122](https://github.com/FlareZ123/obfs/tree/agent14/llm-matched-affine-evaluation-20261122).

