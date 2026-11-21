# Source-coincident zero-oracle static reconstruction score for COO four-way comparison

**Agent 7; 21 November 2026. Intermediate, negative security-decision evidence.** This is a correction to how the existing published-byte source-only attacker is scored. It does not introduce a new deobfuscation algorithm or establish a generic JavaScript obfuscation impossibility theorem.

## Claim and source pin

At exact source `63a9ccadfc7040a34c0d7e1b7d3e96b33dbfbbbf`, the manually dispatched [four-way Ubuntu/Windows/Chromium gate 44945307778](https://github.com/FlareZ123/obfs/actions/runs/44945307778) completed successfully, including both new static attack decisions, Node 22 application work, real Chromium external callbacks, and strict external JSDoc.

The selected implementation is a three-module stateful ESM application with three genuinely transformed Int32 arithmetic functions. The four delivered variants are native, esbuild 0.28.2 unbundled minified, compiler-generated COO polyvariant, and a source-only independently reconstructed version of the COO math module. The compiler and minifier operate on the same native graph, and the existing four-way publisher records SHA-256 hashes of all distributed graph bytes. The Chromium cross-runtime join checks those hashes match the Node publisher's.

Two **distinct existing** independent source-only Acorn recognizers receive their respective published source without compiler secrets, original source, a runtime oracle, or privileged trust. The ordinary-minifier recognizer emits executable recovered functions; the COO recognizer emits a recovered ESM math module. The verifier subsequently uses the original exports solely to compare results. Each recognizer has **zero pre-verification runtime oracle queries** and is evaluated on the same three selected exports with 4,096 signed-Int32 inputs per export, including signed extremes, `-0`, and deterministic held-out values. The minifier extraction checks 12,288 functions/inputs; the recovered COO module now independently checks **12,288/12,288** matched evaluations. The full four-way sessions separately compare complete state and external host callback traces at 1, 50, 1,000, and 10,000 events.

The experiment now applies `compareCandidateEvidence` to these real zero-query source-only outputs, recording `matchedStaticDecision` alongside the existing **three-query** functional clone decision in the exact Node audit JSON. It requires each to report a **contradicted** incremental reconstruction advantage. The Node/Chromium join now refuses to declare source-only reconstruction established unless the zero-query classifier is ready, contradicted, and carries the full 12,288 published-reconstruction comparison count.

## Independent dimensions and decision

| Dimension | Observation | Boundary |
| --- | --- | --- |
| Static reconstruction | 3/3 selected minified and 3/3 selected COO exports recovered, 12,288 held-out checks each | Acorn recognizers for these two specific emitted grammars |
| Runtime oracle access during attack | **0** calls in either static arm | Trusted original is used only for subsequent hidden verification |
| Second attack | Existing matched **3-query** Int32 functional clone succeeds in both arms | A narrowly promised affine/translation family, independent of the static check |
| Behavior | Full application outputs and callback trace verified across four versions | These fixed ESM graphs and deterministic held-out sessions |
| Runtime | Original four workloads plus real Chromium warm/cold measurements retained from this identical source run | Strict observed >2.5× pairs veto sampled workloads; no worst-case guarantee |
| Selection | **Reject this COO variant as a demonstrated incremental static-obfuscation advantage over esbuild** | Does not assess unrelated backends, human development time or generic dynamic anti-instrumentation |

One source-only pass is sufficient negative evidence against this specific incremental static-protection claim, but the recognizers have different target grammars and are **not a controlled comparison of developer effort**. A successful negative result cannot quantify either attacker implementation's human or LLM time. Full-control COO runtime extraction, environment imitation, and tampering require separately documented threat-model tests; zero-query static recovery supplies no new evidence of cross-account server abuse.

Before this work the generic classifier's `oracleCalls>0` readiness condition excluded source-only attacks from its matched decision. That condition was corrected in [PR #220](https://github.com/FlareZ123/obfs/pull/220), merged as `81c219957fbf32828ed3d1559d8d012d9f339233`. The present integration actually exercises the corrected gate with published bytes, rather than using hypothetical test records.

## Reproduction

- Producer and matched static score: `sims/polyvariant-app-four-way-control.js`.
- Same-source Node/Chromium decision join: `sims/four-way-cross-runtime-verdict.js`.
- Focused join regressions: `test/four-way-cross-runtime-verdict.test.js`.
- Manual existing Linux/Windows/Chromium workflow: `.github/workflows/manual-minified-control.yml`.
- CI source pin: [44945307778](https://github.com/FlareZ123/obfs/actions/runs/44945307778), `63a9ccadfc7040a34c0d7e1b7d3e96b33dbfbbbf`.

The saved CI audit artifacts contain the actual per-variant graph SHA-256 values, raw trial times, source-recovery counts, and both classifier outputs. No claim about current moving `main` or about security effectiveness of a different published artifact follows. Strong-protection release remains **RELEASE-BLOCKED**.
