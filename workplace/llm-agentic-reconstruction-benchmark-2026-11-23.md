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

2. **Repository context and retrieval — “More Context, Mixed Results” (14 Nov 2026 preprint).** Across 51 Java projects, three obfuscators, four traditional baselines, three LLMs and six context/retrieval settings, the authors report that agentic retrieval achieves the strongest identifier-detection result (91.56% F1), while exact identifier recovery remains substantially lower (16.42% overall in the best reported setting; field names reach 32.93% with repository retrieval). The work is Java, not JavaScript, and is under review; use it as evidence that context/retrieval is an attacker capability worth testing, not as a JS performance claim. [Preprint](https://arcxiv.org/abs/2611.19043).

3. **Adversarial prompting/obfuscation — Acoda (June 2026).** Acoda reports eight semantics-preserving transforms and up to 70% attack success against seven models. Its score includes model refusal or misinterpretation, so it measures a different objective from exact source reconstruction or functional cloning. Refusal must be recorded separately; comments, alarming identifiers, dead-code decoys, or token tricks that trigger a safety refusal are not a durable confidentiality result. [Preprint](https://arxiv.org/abs/2606.11755).

4. **Vulnerability detection is not reconstruction — AntiAgent (19 Nov 2026).** The existing repository note reports the authors' 52.0–60.7% reduction in vulnerabilities found by LLM agents on 40 applications. That is a vulnerability-discovery metric, not source recovery, cloning, extraction, or the project's runtime budget. Keep the scope distinction in `im-results/antiagent-2026-external-evidence-scope-2026-11-22.md`.

5. **LLM-assisted JavaScript deobfuscation tooling — JSIMPLIFIER (NDSS 2026).** This multi-stage static-analysis, dynamic-tracing and LLM-assisted tool is a useful candidate attacker baseline, not a defense result. Its reported 44,421-sample corpus and broad transformation support motivate including deterministic and hybrid recovery tools alongside LLM agents. [Paper](https://doi.org/10.14722/ndss.2026.242198).

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

A candidate that survives T0 but fails T1/T2 is not LLM-resistant under the stronger tier.

## Corpus and controls

1. Use hidden, non-public, multi-file applications with meaningful cross-file behavior, exported APIs, dynamic property access, reflection, external/browser APIs, and realistic data/control flow. Do not use a public sample whose source or emitted artifact is already in the repository as the primary blind trial.
2. Generate fresh private seeds and source variants after the reviewer/model snapshot and prompts are fixed. Keep the original source and verifier outside the reviewer's filesystem and conversation.
3. Emit a candidate and at least one ordinary minifier control from the same source. Freeze and hash every byte before review. Where relevant, add an established deobfuscator/obfuscator baseline as a separate arm.
4. Randomize arm labels (for example, opaque A/B identifiers), randomize presentation order, and use isolated reviewer instances. Do not expose labels such as “candidate” and “control” before both answers are committed.
5. Use multiple independent programs and seeds. Preregister sample count, model versions, prompt, token/time/tool budget, allowed tools, hidden tests, exclusions, and scoring before the first trial.
6. Keep each mode's actual attacker permissions. A result from a static-only task cannot be generalized to the full COO/SCO/SNO threat model.

## Tasks and scoring

The primary endpoint is **functional reconstruction**, not prose quality.

- **Clone pass@1 / pass@k:** the submitted replacement passes hidden differential/property tests against the original across held-out inputs and relevant host environments.
- **Behavior recovery:** exact predictions for a preregistered hidden query set; score separately from a code clone.
- **Source/structure recovery:** identifier mapping, property-key recovery, call/data-flow edge recovery, and AST similarity. These are diagnostic endpoints, not substitutes for behavior.
- **Time and resources:** wall time, tokens, tool calls, execution count, network/server requests, and monetary cost where available.
- **Refusal:** separate rate; never count refusal alone as successful protection.
- **Correctness of the attacker's answer:** retain raw outputs and independently run the verifier. Do not use an LLM judge as the primary oracle.

Report per-sample and aggregate results, confidence intervals, failures, and candidate-minus-minifier differences. A syntactically valid but semantically wrong clone is a failed reconstruction, even if it is shorter or more readable. A source-similar but behaviorally wrong clone also fails the primary endpoint.

## Existing repository apparatus and current limits

- `sims/llm-blind-affine-challenge.js` creates three random affine ESM leaves, supports COO/SNO, asks for three signed-Int32 offsets, and verifies each answer over 1,024 deterministic held-out inputs. It is a useful sealed known-family control, not a general JS cloning benchmark.
- `im-results/blind-affine-model-challenge-design-2026-11-17.md` records that the known-family AST recoverer reconstructs every sample in that bounded grammar. This is a negative static-secrecy control, not an LLM result.
- `im-results/llm-deobfuscation-probe-synthesis-2026-11-22.md` records two GPT-6 source-only probes: a partial affine reconstruction with one consequential error, and exact decoding of a six-instruction expression VM in 21.594 seconds. They are qualitative, same-model-family observations on public artifacts, not a paired benchmark.
- `im-results/llm-expression-vm-matched-esbuild-control-2026-11-23.md` now pins an esbuild 0.28.2 minifier control and 2,067-input semantic equivalence check, but both independent worker attempts failed before any model answer (SSE/HTTP 404). It contains **zero** new paired LLM completions.

The repository also has `.github/workflows/manual-jsdeobsbench.yml`, which downloads a hash-pinned public JsDeObsBench corpus, audits it without executing samples, and runs a networkless Docker public-source static-recovery/differential path for selected SNO cases. This is a useful deterministic non-LLM attacker baseline and corpus adapter; it is **not** an LLM trial, and its workflow matrix does not give the same full static-attack path to every mode. Preserve it as a separate baseline rather than reporting its results as model resistance.\n\nThe current matched affine helper returns arms labelled `candidate` and `control`. A future blind-delivery adapter should expose only opaque arm IDs, randomize order, keep the arm mapping private until both answers are committed, and deliver each arm to a separate isolated reviewer. Do not claim this is enforced merely because the verifier closure hides the source: reviewer isolation is an external protocol requirement.

## Recommended next experiment

Do not add another obfuscation transform first. Reuse one frozen, multi-file JavaScript workload and its exact esbuild control; create a sealed A/B delivery adapter; and run T0 and T1 against at least two independent model families. If a worker/reviewer service is unavailable, preserve the failure and report **no result** rather than substituting self-evaluation. Only after a candidate shows a reproducible advantage over minification in T0/T1 should T2 be expanded. The separate 2.5× runtime, semantic-parity, integrity and environment-lock gates remain mandatory.

## Decision boundary

This protocol is a research proposal. It establishes no measured LLM resistance, no security gain, and no change to the repository's **RELEASE-BLOCKED** decision.
