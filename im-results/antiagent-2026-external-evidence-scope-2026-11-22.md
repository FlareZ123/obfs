# New 19 November 2026 evidence: AntiAgent as an anti-LLM boundary

**Agent 47, 22 November 2026. Classification:** literature triage / intermediate research direction. **Release decision:** unchanged, **RELEASE-BLOCKED**.

## Source and reproducibility

- Zhenhao Tian, Jintong Yu, Jingwei Feng, Jianwei Zhuge, Penghui Li. *Hardening JavaScript Programs against LLM-Based Vulnerability Detection*. arXiv:2611.25718, first posted **19 November 2026**. Primary readable source: https://arxiv.org/abs/2611.25718 .
- Facts below are the **authors' reported experiments** in that preprint, not independent reproductions in this repository. Relevant source sections: 3 (threat model), 4 (rules), 6.2 (detection), 6.3 (parity and overhead), 6.5 (ablations), 6.7 (rule usage), 7 (dual use and limitations).
- This is distinct from our public-artifact GPT-6 reading probes: `im-results/llm-deobfuscation-probe-synthesis-2026-11-22.md`, and distinct from the same-trust source/minifier challenge in `im-results/four-way-minified-current-source-2026-11-21.md`.

## Source-reported outcome, with exact measurement boundary

- The evaluated task is **LLM-agent discovery of known vulnerabilities** on 40 real-world JavaScript applications, across four detection agents. The authors report reducing *the number of vulnerabilities found* by **52.0% to 60.7%** versus unprotected code. This metric is an agent-recall outcome, **not** source reconstruction failure, functional-clone difficulty, authorized-host refusal, dynamic extraction cost, or secret confidentiality.
- The transformed applications reportedly pass all **10,062 official tests**, preserve all **40 known vulnerability PoCs**, and show zero disagreements over an additional **20,000 differential inputs**. The paper explicitly says this does **not** constitute a formal semantic-equivalence proof.
- Reported aggregate test-suite execution wall time: **213.91 s** original, **237.13 s** transformed (**1.11×**). Reported aggregate disk size: **4.35 MiB** original, **5.95 MiB** transformed (**1.37×**). Corresponding conventional JS-Obfuscator comparison: **526.23 s (2.46×)** and **11.43 MiB (2.63×)**, with **88.46%** official tests passing.
- The 1.11× is aggregated **wall time of official suites**. It does not report protected hot-loop ratios, per-workload worst pairs, real Chrome/Node CPU normalized against identical native sessions, initialization/selected-work separation, or an exact >2.5× veto population. **It cannot satisfy our project's strict runtime admission requirement.**
- In a rule-aware attacker ablation, authors report vulnerability-detection defense success falling from **52%** to **32%** under a detector supplied with rule-family descriptions and explicit preprocessing. This shows the tested result is partly analyzer-configuration dependent.

## Structural and dual-use scope

The 111 extracted rules fall into 13 families. Four families use structural indirection, including call chains and cross-module fragmentation. Other families explicitly mislead vulnerability auditors using apparent sanitization, decoys or context claims. The preprint acknowledges this dual use and states that source-release access would be reviewed. For our compiler, **do not count deceiving vulnerability review as a desirable protective capability**; maintain reliable local auditing and failure reporting. The legitimate comparable question is whether semantics-preserving *structural indirection* creates a measurable independent reconstruction burden, under a fair attacker and code-review policy.

The reported technique uses LLM-chosen, fixed AST operations, with the language model prohibited from freely generating replacements. This **engineering pattern** is relevant to the project's conservative rewrite gates. Its empirical no-drift result is useful test coverage evidence, but every new JavaScript transform still needs source-language semantics, reflection and host-boundary proof or an explicit refusal. This project already has native-vs-emitted tests for its own candidate-specific transformations.

## Recommended falsifiable follow-up, if a candidate is pursued

1. **Freeze one multi-file application** and a standard esbuild-minified baseline with identical exports, callbacks, module boundaries and attacker access. Preregister target behavior, seed, source hashes and holdouts.
2. Study only a *transparent, code-auditable* structural-coupling candidate, with a working static recovery challenge and dynamic trace extraction challenge. Reject the candidate if an equal-budget analyst recovers both variants or if a complete reconstruction is trivial. Do not interpret reduced vulnerability discovery as a clone-resistance result.
3. Measure exact observed protected hot work, full-session CPU/wall in real Node and Chromium, and all strict >2.5× comparisons. Record every exception, reflection effect and normal host callback difference.
4. Report **LLM unaided comprehension, LLM plus execution, static tool recovery, dynamic extraction, host admission, integrity bypass, functional cloning** separately. Include a source-proximate control and independent attacker, and report lack of observed advantage without smoothing failures.

**Decision:** This preprint is worth knowing because it directly tests contextual transformation choice and runtime cost. It supplies no current evidence for promoting any COO, SNO or SCO backend of `obfs`. The 22 November [three-mode convergence record](../workplace/three-mode-candidate-convergence-2026-11-22.md) remains authoritative for candidate selection.
