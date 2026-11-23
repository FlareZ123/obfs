# LLM-assisted reconstruction benchmark: protocol and decision criteria

**Author:** Agent 47  
**Date:** 2026-11-23T11:24:09.810Z  
**Status:** research protocol proposal; no new model trial or security result is claimed.

## Objective

Measure whether a named obfuscation candidate makes a capable LLM attacker materially less able to reconstruct or functionally clone a JavaScript program than an equal-trust conventional minifier does, under a fixed practical budget. This is not a vulnerability-detection benchmark and not a test of whether a model can be induced to refuse.

The primary comparison is:

- one frozen original multi-file JavaScript program;
- the candidate's exact emitted bytes;
- an independently generated esbuild/Terser minified control from the same original source;
- the same attacker model, prompt, context budget, tool permissions, time budget, and hidden verifier for both arms.

The result must be reported as a candidate-minus-control difference. Candidate-only failure, refusal, larger byte count, or unreadable-looking output is not evidence of incremental protection.

## Literature scope and what it does (and does not) establish

1. **JavaScript-specific LLM deobfuscation — JsDeObsBench (CCS 2025).** The authors report 36,260 unique executable obfuscated JavaScript samples, 4,515 malicious samples, seven transformations, and six LLMs. Their aggregate results report 2.76% syntax failures and 37.40% execution failures for LLM outputs, while the two conventional deobfuscators had 16.25% semantic failures. The study reports stronger simplification scores for LLM outputs, but those scores must not be treated as successful recovery unless execution equivalence also passes. This supports a hidden semantic oracle and separate syntax, behavior, and readability metrics. [Paper](https://arxiv.org/abs/2506.20170) · [artifact/leaderboard](https://github.com/Ch3nYe/JsDeObsBench).

2. **Repository context and retrieval — “More Context, Mixed Results” (14 Nov 2026 preprint).** Across 51 Java projects, three obfuscators, four traditional baselines, three LLMs and six context/retrieval settings, the authors report 91.56% F1 for **detecting which visible occurrences are obfuscated**, not recovering their names. The separate naming task is semi-oracle: it receives the ground-truth occurrence inventory and does not require a compilable program. Exact recovery peaks at 16.42% overall / 32.93% for fields. End-to-end detection-plus-recovery is materially worse; the paper's 5% ablation reports detector F1 of 63.17% (Qwen) / 57.04% (OLMo) and BERTScore F1 of 44.14% / 42.92%, versus oracle-target 52.58% / 47.62%. Its “agentic retrieval” is also bounded and one-shot (at most two read-only inspections and 700 combined evidence tokens; no arbitrary command execution, file modification or iterative feedback). The work is Java bytecode, not JavaScript, and is under review; use it as methodological evidence that context matters, not as a JS or full-agent performance claim. [Preprint](https://arcxiv.org/abs/2611.19043).

3. **Adversarial prompting/obfuscation — Acoda (June 2026).** Acoda reports eight semantics-preserving transforms and up to 70% attack success against seven models. Its score includes model refusal or misinterpretation, so it measures a different objective from exact source reconstruction or functional cloning. Refusal must be recorded separately; comments, alarming identifiers, dead-code decoys, or token tricks that trigger a safety refusal are not a durable confidentiality result. [Preprint](https://arxiv.org/abs/2606.11755).

4. **Direct inference on protected code — “Robustness and Trade-offs for Code LLMs on Protected Code” (3 Jul 2026 preprint).** This execution-based study evaluates seven code LLMs, four source languages (including JavaScript), five protection methods, and three protocols: plain, obfuscated, and same-model-deobfuscated inference. It uses 164 HumanEval-style instances per setting, so it is function-level rather than repository-scale. GPT-4.1 and Qwen3-Coder-30B achieve 90.0% and 90.5% Pass@1 on obfuscated translation inputs versus 92.9% and 88.3% on plain inputs; six of seven models lose accuracy after same-model restoration. This is direct evidence that an attacker may not need to deobfuscate before understanding or translating code. It motivates measuring direct task success on obfuscated input and a separate rescue/degradation trade-off for any restoration stage. [Preprint](https://arxiv.org/abs/2609.04220).

5. **LLM-generated obfuscator testing — OBsmith (OOPSLA 2026).** OBsmith uses LLM-generated program sketches plus skeletons extracted from real programs, then applies reference-oriented equivalence and metamorphic oracles to test obfuscators. Across 600 sketches from six models, more than 3,000 candidate programs, and seven configurations of Obfuscator.IO and JS-Confuser, the authors report 11 previously unknown correctness bugs. Generic metamorphic relations did not find bugs in their ablation, underscoring the need for obfuscator-specific relations. This is not an attacker result; it is a strong methodology for expanding this project's behavior-preservation suites once an independent generation/evaluation path is available. [DOI](https://doi.org/10.1145/3798204).

6. **LLM-specific token perturbation — CodeCipher (ICLR 2025).** CodeCipher learns a token-to-token confusion mapping from a model's embedding matrix to preserve selected LLM tasks while confusing source tokens. On its CodeSearchNet privacy sample, the paper reports 0% compilation, 34% token-recall deobfuscation, and 43.18% post-deobfuscation edit distance. The later protected-code study's Java slice reports CodeCipher at 53.7% direct obfuscated Pass@1, 52.4% after same-model deobfuscation, 31.2% conditional rescue, and 24.6% conditional degradation. These are model-facing task and token-recovery metrics, not executable source parity or functional cloning. CodeCipher is therefore not a directly usable semantics-preserving JavaScript obfuscator for a runtime that must execute the emitted code; it is an adjacent model-input privacy technique. [Preprint](https://arxiv.org/abs/2410.05797).

7. **Vulnerability detection is not reconstruction — AntiAgent (19 Nov 2026).** The existing repository note reports the authors' 52.0–60.7% reduction in vulnerabilities found by LLM agents on 40 applications. That is a vulnerability-discovery metric, not source recovery, cloning, extraction, or the project's runtime budget. Keep the scope distinction in `im-results/antiagent-2026-external-evidence-scope-2026-11-22.md`.

8. **LLM-assisted JavaScript deobfuscation tooling — JSIMPLIFIER (NDSS 2026).** This multi-stage static-analysis, dynamic-tracing and LLM-assisted tool is a useful candidate attacker baseline, not a defense result. Its reported 44,421-sample corpus and broad transformation support motivate including deterministic and hybrid recovery tools alongside LLM agents. [Paper](https://doi.org/10.14722/ndss.2026.242198).

For property-renaming tasks, score four distinct stages rather than one “recovery” number: (1) candidate-use detection, (2) oracle target/key recovery when the occurrence inventory is supplied, (3) end-to-end detection plus target recovery, and (4) executable clone success on hidden tests. Ground truth must be keyed by declaration/owner identity, not only textual spelling; same-spelling or shadowed properties may be distinct targets.

## Threat tiers

Run tiers independently. Do not pool them into one score.

### T0 — single-pass static reviewer

- Receives only the distributed artifact(s) and a fixed task.
- No source, seed, original repository, execution, runtime oracle, external web search, or recovery scripts.
- One answer per sample; record exact prompt, model snapshot, decoding settings, time and token use.

This preserves comparability with the existing blind affine challenge.

### T1 — agentic static reviewer

- Receives all files the mode's attacker can obtain.
- May use AST parsers, grep/search, deobfuscators, dependency graphs, and multiple collaborating agents.
- No execution or runtime state.
- Must include repository-wide retrieval and cross-file context; a one-file prompt is not an adequate model of an agentic attacker.

A useful team decomposition is reconnaissance (exports, module graph, host APIs), reconstruction (data/control flow and transformation recovery), and verification (construct candidate behavior and adversarial tests), with a coordinator integrating the results. Preserve every subagent transcript and tool call.

### T2 — agentic dynamic reviewer

- May execute the supplied artifact in a disposable Node/browser environment, inspect outputs, instrument functions, use DevTools/debuggers, and generate adaptive inputs.
- COO: receives every distributed file and can reproduce the hosting environment.
- SCO: controls the client, intercepts every response, and may make unlimited legitimate requests; report request count and server-visible state separately.
- SNO: receives the stated full filesystem/runtime/memory access; do not quietly weaken this to a static-only task.

### T2-H — LLM-guided deterministic hybrid attack

Keep a distinct sub-track for a CASCADE-style pipeline:
1. The LLM labels semantic roles and source locations of a small decoder/prelude/dispatcher component set.
2. A deterministic validator checks dependency and data-flow constraints before accepting those labels.
3. A controlled runtime executes only the identified decoder/prelude; a deterministic IR/constant-propagation pass resolves aliases, wrappers and calls.
4. For a VM candidate, the analogous attacker locates the dispatcher, bytecode tables and handler families, then builds a bounded symbolic/dynamic interpreter.

Score component-localization precision/recall, validator acceptance, runtime executions, recovered literals/structure, and hidden-test clone success separately. This is a hybrid compiler attack, not direct LLM source reconstruction. CASCADE's published results are specific to Obfuscator.IO string arrays; they motivate testing the workflow against a stable prelude/dispatcher but do not establish that it succeeds against this project's VM.

A candidate that survives T0 but fails T1/T2 is not LLM-resistant under the stronger tier.

## Corpus and controls

1. Use hidden, non-public, multi-file applications with meaningful cross-file behavior, exported APIs, dynamic property access, reflection, external/browser APIs, and realistic data/control flow. Do not use a public sample whose source or emitted artifact is already in the repository as the primary blind trial.
2. Generate fresh private seeds and source variants after the reviewer/model snapshot and prompts are fixed. Keep the original source and verifier outside the reviewer's filesystem and conversation.
3. Emit a candidate and at least one ordinary minifier control from the same source. Freeze and hash every byte before review. Where relevant, add an established deobfuscator/obfuscator baseline as a separate arm.
4. Randomize arm labels (for example, opaque A/B identifiers), randomize presentation order, and use isolated reviewer instances. Do not expose labels such as “candidate” and “control” before both answers are committed.
5. Use multiple independent programs and seeds. Preregister sample count, model versions, prompt, token/time/tool budget, allowed tools, hidden tests, exclusions, and scoring before the first trial.
6. Keep each mode's actual attacker permissions. A result from a static-only task cannot be generalized to the full COO/SCO/SNO threat model.

## Tasks and scoring

The primary endpoint is **functional reconstruction**, not prose quality. Run the same downstream task against four inputs: original (Plain), same-source esbuild/Terser minified control, emitted candidate (Obfuscated), and an independently produced restored version of the candidate (Deobfuscated). The minified control is a baseline arm, not a restoration stage. Do not assume restoration is beneficial. Report pass rates for all four and:
- **Direct obfuscated pass rate:** the attacker's functional success without any restoration step.
- **Rescue count/rate:** count cases where Plain passes, Obfuscated fails, and Deobfuscated passes; report both the conditional rate among Obfuscated failures and the count divided by the common Plain-pass denominator.
- **Degradation count/rate:** count cases where Plain passes, Obfuscated passes, and Deobfuscated fails; report both the conditional rate among Obfuscated successes and the count divided by the same Plain-pass denominator.
- **Net restoration effect:** (rescue count − degradation count) / number of Plain-pass cases. Using the common denominator makes the difference interpretable; report the two conditional rates separately.

The recent protected-code study uses these conditional metrics and finds that strong models can operate directly on protected input; its 164-instance function-level setup does not replace this project's multi-file/host API corpus.

- **Clone pass@1 / pass@k:** the submitted replacement passes hidden differential/property tests against the original across held-out inputs and relevant host environments.
- **Behavior recovery:** exact predictions for a preregistered hidden query set; score separately from a code clone.
- **Source/structure recovery:** identifier mapping, property-key recovery, call/data-flow edge recovery, and AST similarity. These are diagnostic endpoints, not substitutes for behavior.
- **Time and resources:** wall time, tokens, tool calls, execution count, network/server requests, and monetary cost where available.
- **Refusal:** separate rate; never count refusal alone as successful protection.
- **Correctness of the attacker's answer:** retain raw outputs and independently run the verifier. Do not use an LLM judge as the primary oracle.

Report per-sample and aggregate results, confidence intervals, failures, and candidate-minus-minifier differences. Treat the same source seed/model snapshot as a paired unit: report the paired risk difference `(candidate-only successes - control-only successes) / N`, the discordant-pair counts, and an exact McNemar test for binary pass/fail outcomes. If several samples share a project or seed, use a cluster bootstrap at the project/seed level rather than treating them as independent. Choose the final sample count with a preregistered power calculation based on pilot discordance and a meaningful target risk difference; do not select N after seeing the treatment results. Counterbalance opaque arm assignment across isolated reviewer instances, model snapshots, source seeds and presentation order. Never let one reviewer see both arms if that can contaminate the comparison.

A syntactically valid but semantically wrong clone is a failed reconstruction, even if it is shorter or more readable. A source-similar but behaviorally wrong clone also fails the primary endpoint.

## Existing repository apparatus and current limits

- `sims/llm-blind-affine-challenge.js` creates three random affine ESM leaves, supports COO/SNO, asks for three signed-Int32 offsets, and verifies each answer over 1,024 deterministic held-out inputs. It is a useful sealed known-family control, not a general JS cloning benchmark.
- `im-results/blind-affine-model-challenge-design-2026-11-17.md` records that the known-family AST recoverer reconstructs every sample in that bounded grammar. This is a negative static-secrecy control, not an LLM result.
- `im-results/llm-deobfuscation-probe-synthesis-2026-11-22.md` records two GPT-6 source-only probes: a partial affine reconstruction with one consequential error, and exact decoding of a six-instruction expression VM in 21.594 seconds. They are qualitative, same-model-family observations on public artifacts, not a paired benchmark.
- `im-results/llm-expression-vm-matched-esbuild-control-2026-11-23.md` now pins an esbuild 0.28.2 minifier control and 2,067-input semantic equivalence check, but both independent worker attempts failed before any model answer (SSE/HTTP 404). It contains **zero** new paired LLM completions.

- `im-results/heldout-object-flow-attack-2026-11-15.md` and `sims/heldout-object-flow-attack.js` provide a useful **functional/property-flow fixture**: 30 deterministic ESM graphs (3–5 files each, 96 files), 60 candidate private keys, 18 renamed, nine positive graphs and 21 refusal graphs. The source-only Acorn normalizer neutralizes all 18 hashed labels and native/transformed/neutralized outputs match on fixed observations (30/30), but this is label neutralization, not original-name recovery. **Do not use it as a blind LLM name-recovery corpus:** the generator is public, keys are deterministic (`privateMetric{seed}` / `weightedFactor{seed}`), and numeric values leak the small seed. A future blind corpus needs fresh cryptographic randomness kept outside the repository and a private original-name/object-identity mapping in the verifier.

A related hybrid attacker worth tracking is **CASCADE** (ICSE-SEIP 2026): it uses Gemini to recognize Obfuscator.IO string-prelude patterns, then a compiler IR pipeline for constant propagation/inlining. Its scope is narrow (Obfuscator.IO string obfuscation), so treat it as a targeted baseline rather than a general LLM deobfuscator. [Paper](https://doi.org/10.1145/3786583.3786873).

The repository also has `.github/workflows/manual-jsdeobsbench.yml`, which downloads a hash-pinned public JsDeObsBench corpus, audits it without executing samples, and runs a networkless Docker public-source static-recovery/differential path for selected SNO cases. This is a useful deterministic non-LLM attacker baseline and corpus adapter; it is **not** an LLM trial, and its workflow matrix does not give the same full static-attack path to every mode. Preserve it as a separate baseline rather than reporting its results as model resistance.

Agent 13's opaque-arm delivery adapter now exists as an unmerged prototype on `agent13/opaque-blind-arm-delivery-20261123` (head `887e54cf8eedf4d21721187f101ae203c663ef99`, focused validation [45167720403](https://github.com/FlareZ123/obfs/actions/runs/45167720403) green on Ubuntu/Windows). It provides opaque 96-bit IDs, randomized order, frozen packets, one-shot JSON snapshots and deferred verdicts, but only wraps the affine helper. Agent 13 explicitly declined to send a packet in this invocation because only public repository/mailbox delivery is available and no private isolated reviewer channel or live verifier exists. The old trial remains **ABANDONED / NO LLM RESULT**; no new arm or self-scored substitute was created.

The current matched affine helper returns arms labelled `candidate` and `control`; the prototype masks those labels for the coordinator but the coordinator still holds both packets. A real trial must deliver exactly one packet to each separate isolated reviewer, keep the mapping/verifier private, and prevent repository/coordinator access. The adapter does not itself provide private isolation.

## Recommended next experiment

Do not add another obfuscation transform first. Reuse one frozen, multi-file JavaScript workload and its exact esbuild control; create a sealed A/B delivery adapter; and run T0 and T1 against at least two independent model families. If a worker/reviewer service is unavailable, preserve the failure and report **no result** rather than substituting self-evaluation. Only after a candidate shows a reproducible advantage over minification in T0/T1 should T2 be expanded. The separate 2.5× runtime, semantic-parity, integrity and environment-lock gates remain mandatory.

## Decision boundary

This protocol is a research proposal. It establishes no measured LLM resistance, no security gain, and no change to the repository's **RELEASE-BLOCKED** decision.
