# Testing and attacker-evaluation references (22 November 2026)

Scope: literature and methodological implications for the existing JavaScript
obfuscator project. These notes are planning material, not a new security claim.

## 1. Obfuscator-specific differential program generation

Shan Jiang, Chenguang Zhu, and Sarfraz Khurshid,
**OBsmith: Testing JavaScript Obfuscator using LLM-powered sketching**,
arXiv 2510.10066, 11 October 2025.
https://arxiv.org/abs/2510.10066

OBsmith combines language-feature sketches, template filling, original-versus-
obfuscated execution, and observable-host-effect checking. The authors report
11 newly identified correctness bugs in evaluated third-party obfuscators.
Their stated ablation found generic metamorphic relations comparatively weak,
which motivates transformation-specific witness families with explicit positive
rewrite yield and explicitly refused unsafe properties.

Suggested project-specific input sketch for property renaming:

1. Choose an exported owner with two named keys and an immutable imported key.
2. Compose 1 to 3 functions transporting its identity through return values,
   arrays, records, iterable holders, Promise continuations, or ESM reexports.
3. Choose a consumer from direct proven reads, own-key enumeration, descriptor
   reflection, structured clone, serializing callbacks, or opaque host effects.
4. Run exactly the same Node/Chromium source graph without transformation and
   with COO output; compare return/output, error spelling, side effects, and
   the actual number of rewritten owner fields.
5. Store random seed, generated JS sources, compiled source bytes, runtime
   versions, and a minimized counterexample when parity fails.

The 22 November source-pinned [8x5 Node transport matrix](../im-results/cross-file-opaque-api-parity-2026-11-22.md)
already supplies a small independent example. A useful extension must explore
new interacting feature *compositions* or expose a failing case, not merely
multiply pass counts on existing deterministic grammars.

## 2. Attacker capabilities and baseline parity

Guoqiang Chen, Xin Jin, and Zhiqiang Lin,
**JsDeObsBench: Measuring and Benchmarking LLMs for JavaScript
Deobfuscation**, ACM CCS 2025.
https://jsdeobf.github.io/
https://github.com/Ch3nYe/JsDeObsBench

Its leaderboard separates single-transformation and combined-transform
tasks, uses multiple metrics, and explicitly discusses model contamination.
This is a candidate reference for a *controlled* offline deobfuscation
evaluation, not evidence that this repository resists any specific model.

A defensible experiment should publish the exact COO emitted files and
an equal-trust esbuild-minified control of the same underlying graph.
An independent attacker sees only those output artifacts and a fixed budget.
Before revealing originals, precommit reconstruction and functional-clone
outputs, including held-out predictions. After revelation, score at least:

- executable held-out input/output equivalence;
- original source/function structure reconstruction separately from behavior;
- actual runtime extraction success;
- elapsed attack effort, model/tool versions and call/query counts;
- code-simplification/size with the same scoring protocol for both arms.

For SCO, keep private-source services and authorized online oracle queries
separate; for SNO, give the attacker filesystem, loader, and process-memory
control as the actual prompt threat model requires. Never compare a server-
private SCO graph against a publicly shipped minifier. A model scoring high
on a benchmark might have memorized public evaluation programs. Hold out
fresh application fixtures and disclose possible contamination.

## 3. Admission and release consequence

A new transform belongs in the preferred candidate only when it preserves
a meaningful executable *application*, demonstrates a material independent
attacker-cost gain over an equal-trust control, and survives the **strict**
2.5x actual-protected-compute veto. Passing compatibility fuzzing alone
cannot establish resilience, and empty/no-op property renaming cannot
establish a protection gain. The [release decision index](../results/README.md)
contains existing negative controls that still block strong protection.

The methodological contribution here is a test-design and source-evaluation
agenda; no new algorithmic theorem or attack success is asserted.


## 4. Hybrid static-plus-LLM adversary in 2026

Shan Jiang et al., **CASCADE: LLM-Powered JavaScript Deobfuscator at
Google**, ICSE-SEIP 2026:
https://conf.researchr.org/details/icse-2026/icse-2026-software-engineering-in-practice/21/CASCADE-LLM-powered-JavaScript-Deobfuscator-at-Google
and https://arxiv.org/abs/2507.17691

The published description combines LLM identification of prelude routines
with deterministic compiler-IR transforms and reports production deployment.
Its *architecture* is a direct methodological challenge to schemes that
assume human difficulty in identifying a hashed-name decoder is sufficient.
A fair benchmark should give the attacker a composable static-normalization
tool plus model access, recording both tool and model budgets. An LLM-only
test is less capable than this documented hybrid adversary.

**JSIMPLIFIER: From Obfuscated to Obvious**, NDSS 2026,
https://arxiv.org/abs/2512.14070,
reports a related multi-stage deobfuscator combining AST static analysis,
dynamic traces and LLM-enhanced identifier recovery, with a real-world
obfuscated JS corpus. Its dataset includes malicious samples; use only
lawfully sourced, safely executed benchmarks and never ship unreviewed
external JavaScript into ordinary trusted project CI.

**Human-effort methodology**: Regano et al.,
Empirical assessment of the code comprehension effort needed to attack
programs protected with obfuscation, Computers & Security 2026,
https://www.sciencedirect.com/science/article/pii/S016740482600057X
reports a controlled student comprehension experiment. That measurement
construct is distinct from automated functional cloning and should not
be inferred from source-byte growth, compile time or query counts alone.

These references justify a measurable, equal-effort *hybrid* attacker
evaluation; they do not establish that any particular current project
variant is broken by these external tools without a source-pinned run.


## 5. Additional LLM-deobfuscation evidence available by 23 November 2026

### JavaScript benchmark: syntax, execution, simplification and similarity

The JsDeObsBench paper provides more detail than the original pointer above:
https://jsdeobf.github.io/ccs2025a-JsDeObsBench.pdf

It reports a generated, execution-verifiable dataset of 36,260 obfuscated JS programs plus 4,515 obfuscated malicious samples, with seven transformation types and combinations. Its evaluator is staged: parse/syntax validation, isolated execution against source test cases (or behavior traces for malware), Halstead-length simplification, then AST/data-flow similarity using CodeBLEU. In its general-JS experiments it reports 97.23% average syntactic correctness but 60.93% average semantic execution correctness; GPT-4o's reported execution correctness is 93.42%. The study also identifies training-data leakage as a threat and therefore constructs a fresh dataset rather than relying on publicly collected obfuscated samples. These are the paper's own results, not measurements of this repository.

**Methodological consequence:** an LLM explanation or plausible recovered formula is not a successful deobfuscation. Require exact hidden-test behavior, and report syntax, semantics, simplification, and source similarity as separate dimensions. Fresh source generation is important, but publishing the challenge source and alternate control in a public repository defeats technical blinding even if reviewers are asked not to search.

### Recent identifier-recovery study (preprint; not JavaScript)

Simon Queyrut, Valerio Schiavoni, Giuseppe Antonio Di Luna, Daniele Cono D'Elia, Leonardo Querzoni, and Pascal Felber, **More Context, Mixed Results: Evaluating LLMs for Identifier Recovery and Code Deobfuscation**, arXiv:2611.19043, submitted 14 November 2026:
https://arxiv.org/abs/2611.19043

The abstract reports four traditional baselines and three LLMs (Qwen, OLMo, DeepSeek) across 51 Java projects, three obfuscators and six context/retrieval settings. Agentic retrieval reaches 91.56% F1 for identifier detection, but exact recovery peaks at 16.42% overall and 32.93% for field names under repository retrieval. The authors also report that control-flow obfuscation degrades the tasks more than string encryption and that larger method context can reduce semantic recovery. This is a preprint under review and studies identifier recovery in Java, not exact function equivalence in JS.

**Methodological consequence:** distinguish identifier detection, semantic naming, source reconstruction and functional cloning. They are different attacker objectives and should not be collapsed into one success score. More context and repository retrieval should be explicit experimental conditions rather than assumed to help.

### Binary-code deobfuscation benchmark (adjacent domain)

Li Hu et al., **Can LLMs Deobfuscate Binary Code? A Systematic Analysis of Large Language Models into Pseudocode Deobfuscation**, arXiv:2604.08083, 9 April 2026:
https://arxiv.org/abs/2604.08083

BinDeObfBench evaluates nine models across six transformations at pre-compilation, compile-time and post-compilation stages, with multiple ISAs and optimization levels. It reports four dimensions: lexical consistency, semantic preservation, code simplicity and readability. The authors report that reasoning capability and domain expertise can matter more than model scale; task-specific fine-tuning outperforms broad domain pre-training; in-context examples help standard models but can offer limited or negative gains for reasoning models. This is binary/pseudocode evidence, not a direct JS result.

**Methodological consequence:** do not assume that more demonstrations or larger context improve the same model in every setting. Compare zero-shot, few-shot and tool-enabled modes separately, with fixed budgets and exact model/version records.

### Attacker-oriented OLLVM study (abstract-level source)

Anton Tkachenko and Gencer Erdogan, **An Attacker-Oriented Evaluation of OLLVM Obfuscation Resilience Against LLM Deobfuscation**, IEEE CSR 2026, DOI 10.1109/CSR69374.2026.11759946:
https://ieeexplore.ieee.org/abstract/document/11759946

The publisher abstract describes 200 C programs, x86-64 and ARM64, ten LLMs, and oracle-based functional validation. It reports material differences by architecture and by whether the model receives assembly or pseudocode. Only the publisher abstract was accessible during this update; treat the detailed percentages as abstract-level reported claims, not independently inspected evidence. The work is about native-code obfuscation, not JavaScript.

### JavaScript LLM deobfuscation paper (abstract-level source)

Giacomo Benedetti, Luca Caviglione, Carmela Comito, Alberto Falcone, and Massimo Guarascio, **Deobfuscation of JavaScript code and identification of security weaknesses through large language models**, Future Generation Computer Systems 179 (June 2026), article 108318, DOI 10.1016/j.future.2025.108318:
https://doi.org/10.1016/j.future.2025.108318

The accessible abstract describes a pipeline comparing two general-purpose LLMs (ChatGPT and Gemini) with JSNice and js-deobfuscator, measuring readability and preservation of CWE-relevant information. The publisher page returned access denied during this update, so details beyond the abstract remain unverified here.

## 6. Implications for the current blind affine probe

The current three-function challenge is a **qualitative one-shot probe**, not a benchmark. It tests one narrow arithmetic reconstruction task, one model family and one fresh seed. It cannot establish resistance to LLMs generally, especially not to agentic retrieval, multi-stage reasoning, symbolic tools or hybrid static-plus-LLM attackers.

Specific caveats and next steps:

1. The current candidate/control messages are stored in a public repository. This means the challenge is procedurally blinded and self-reported, not technically isolated. Future strict blind trials need a private channel and reviewers without access to the other arm or ground-truth repository.
2. The current compact control is custom whitespace compaction and parameter mangling, not esbuild. A follow-up should use an actual pinned esbuild version on the exact same original source.
3. Repeat across many independently generated source seeds and several function shapes; counterbalance candidate/control assignment across independent model contexts. Record model ID/version, reasoning setting if exposed, prompt, context, tool policy, answer, time, and token/call budgets.
4. Separate no-tool, static-tool, and agentic-retrieval conditions. The strongest practical attacker is a hybrid pipeline; an LLM-only result is a lower-bound condition, not the complete threat model.
5. Score exact semantic recovery with hidden inputs/outputs, syntax, source reconstruction, code simplification and runtime extraction separately. For this affine offset task, exact signed Int32 equality is the primary outcome; source similarity is secondary.
6. Preserve every seed, source hash, artifact hash, compiler/backend pin, and hidden verifier result. Do not put private source, salt, expected answers, or the other arm into a public mailbox before the attempt.


### Existing repository minification control to reuse

A pinned real-esbuild full-application control already exists in this repository:
- `.github/workflows/manual-minified-control.yml`
- `sims/polyvariant-app-four-way-control.js`
- `sims/polyvariant-app-minified-static-attacker.js`
- `test/minified-control-static-attacker.test.js`

The runner uses the declared `esbuild@0.28.2` dependency and `esbuild.transform` with ESM format, ES2022 target, minification and no legal comments. It compares native, minified, published and statically reconstructed ESM graphs, and runs a pinned JSIMPLIFIER static-only configuration. This is a full-application attacker/control experiment, not a matched LLM trial on a private fresh source. Reuse it as the implementation template for a future true-esbuild LLM control instead of building a second unrelated minification harness. The separate `manual-esbuild-mangle-control.yml` workflow concerns cross-file property mangling.


## 7. Direct inference on protected code (distinct from reconstruction)

Jin Wen, Yuejun Guo, Yujie Ma, Qiang Hu, and Maxime Cordy, **Robustness and Trade-offs for Code LLMs on Protected Code**, arXiv:2609.04220, submitted 3 July 2026:
https://arxiv.org/abs/2609.04220

This execution-based study evaluates seven code LLMs across four source languages (C++, Go, Java, JavaScript), five protection methods, and three inference protocols: plain, obfuscated, and deobfuscated. It uses 164 HumanEval-style instances per dataset setting. Translation is the primary task: the model receives a source-language function and produces a functionally equivalent Python implementation; code completion is supporting evidence. The evaluated protections include identifier renaming, dead-branch injection, symbol removal, randomized identifiers, and CodeCipher.

The paper's translation Pass@1 table reports:

| Model | Plain | Obfuscated | Deobfuscated |
|---|---:|---:|---:|
| GPT-4.1 | 92.9% | 90.0% | 86.8% |
| Qwen3-Coder-30B | 88.3% | 90.5% | 88.3% |

For these two higher-capability models, direct inference on protected code is close to the plain baseline; the obfuscated-to-plain ratios are reported as 96.9% and 97.1%. Six of seven models lose accuracy after same-model deobfuscation; the only exception is Qwen2.5-Coder-14B, which improves from 59.6% to 61.8%. The paper defines conditional rescue as (plain pass, obfuscated fail, deobfuscated pass) divided by (plain pass, obfuscated fail), and conditional degradation as (plain pass, obfuscated pass, deobfuscated fail) divided by (plain pass, obfuscated pass). GPT-4.1 reports 69.8% rescue / 8.4% degradation; Qwen3-Coder-30B reports 64.0% / 5.7%.

**Methodological consequence:** downstream semantic use of protected code is a separate attacker outcome from exact source reconstruction or producing a replacement clone. A model may translate, complete, or otherwise use obfuscated code without ever restoring its source. A future evaluation should therefore report at least (1) direct task success on obfuscated code, (2) exact source/structure reconstruction, (3) hidden-test functional-clone success, and (4) rescue/degradation if a restoration stage is inserted. Do not collapse these into a single "deobfuscation" score.

**Scope limits:** the study is function-level rather than repository-scale; its main translation task produces Python, not reconstructed JavaScript; and its deobfuscation stage uses the same model as the downstream task. It does not establish that this repository's transformations are secure or insecure, and its results should not be read as a reverse-engineering or source-confidentiality measurement. It is evidence that model-aware downstream-use tests belong beside, not in place of, source-reconstruction tests.


## 8. CodeCipher is an LLM-facing privacy transform, not an executable JS obfuscator

Yalan Lin, Chengcheng Wan, Yixiong Fang, and Xiaodong Gu, **CodeCipher: Learning to Obfuscate Source Code Against LLMs**, arXiv:2410.05797, submitted 8 October 2024:
https://arxiv.org/abs/2410.05797

CodeCipher is materially different from a runtime source-to-source obfuscator. It starts from a white-box code LLM's embedding matrix (the proof of concept uses CodeLlama-7B), learns a token-to-token confusion mapping by perturbing embeddings and projecting each step to the nearest valid vocabulary token, and optimizes a task-specific loss so a downstream LLM can still complete, summarize, or translate the transformed input. The paper also tests transfer of the mapping to other models, including black-box APIs. Its target is privacy when submitting code to an LLM service, not a distributable JavaScript artifact that must execute unchanged in Node.js or a browser.

The paper's code-completion table reports CodeCipher Pass@1 of 47.56% versus 50.60% on original code, while identifier renaming and random perturbation score 42.68% and 40.24%. Its separate CodeSearchNet privacy table reports **0% compilation rate** for CodeCipher, a 34% token-recall deobfuscation rate, and 43.18% post-deobfuscation edit distance. The token-recall metric is not exact source recovery or functional-clone success. The 0% compilation result is decisive for this project's runtime requirement: do not shortlist CodeCipher itself as a Node/browser obfuscation backend.

The later protected-code study (Section 7 above) includes CodeCipher in its Java-slice comparison and reports 53.7% direct obfuscated Pass@1, 52.4% after same-model deobfuscation, 31.2% conditional rescue, and 24.6% conditional degradation. These are downstream task and same-model restoration measurements, not evidence of runtime compatibility or source-reconstruction resistance.

**Disposition:** retain CodeCipher as an adjacent model-facing privacy transformation and a useful reference for direct protected-code inference. Exclude its published token-substitution artifact from the executable COO/SCO/SNO candidate set unless a separate semantics-preserving runtime adaptation is demonstrated with exact Node/browser parity. Do not conflate “hard to restore for one LLM” with “tamper-resistant executable obfuscation.”


## 9. Identifier-recovery benchmark: distinguish detection, oracle naming, and end-to-end recovery

Simon Queyrut, Valerio Schiavoni, Giuseppe Antonio Di Luna, Daniele Cono D'Elia, Leonardo Querzoni, and Pascal Felber, **More Context, Mixed Results: Evaluating LLMs for Identifier Recovery and Code Deobfuscation**, arXiv:2611.19043v1, submitted 14 November 2026 (under review):
https://arxiv.org/abs/2611.19043

The full paper evaluates three open-weight models (Qwen3-30B-A3B, OLMo 3.1-32B-Instruct, DeepSeek-V4-Flash-0731) and four traditional baselines on 175,864 focal methods from 51 Java projects and three obfuscators (Allatori, ProGuard, yGuard). It separates two tasks that should not be collapsed:

1. **Detection:** identify which visible identifier occurrences are genuinely obfuscated, given a public inventory of candidate occurrences. Agentic retrieval reaches 91.56% macro F1 in this task.
2. **Semantic name recovery:** suggest original names for a supplied inventory of known-obfuscated occurrences. This is a *semi-oracle* task: the model receives the ground-truth occurrence inventory (U(m)), so it does not have to detect the targets itself. It is also not required to produce a compilable program. Exact recovery peaks at 16.42% overall (one-hop context) and 32.93% for field names (repository retrieval); these are naming metrics, not functional-clone scores.

The end-to-end ablation replaces the oracle inventory with the model's own detections. Detection F1 is 63.17% for Qwen and 57.04% for OLMo; method-macro end-to-end BERTScore F1 falls to 44.14% and 42.92%, compared with 52.58% and 47.62% for oracle-target recovery on the same identities. The authors report that both models lose roughly half their exact matches. This demonstrates why the 91.56% detection F1 must not be reported as end-to-end deobfuscation or source reconstruction.

The paper's "agentic" retrieval is deliberately bounded: the model may request at most two read-only inspections, selected together before any evidence is returned, for a combined 700-token evidence budget. The harness exposes definitions, owners, callers, callees, and field uses, but no arbitrary command execution or file modification. It is a useful retrieval experiment, not a full agentic coding agent with iterative tool feedback. Richer repository retrieval uses BM25 plus UniXcoder/FAISS with an 8k-token budget. More context is not monotonically better; larger methods can hinder semantic recovery.

In a 100-method Allatori factorial ablation, adding string encryption to renaming changes little, while control-flow obfuscation causes larger reductions in detection and semantic recovery. For example, Qwen detection F1 falls from 38.40% on renaming alone to 33.89% with control-flow obfuscation and 29.46% with both control flow and string encryption; OLMo falls from 57.86% to 46.08% and 46.58%, respectively. These are bounded Java/Allatori results, not JavaScript or cross-mode guarantees.

**Methodological consequence for this repository:** report at least (a) candidate-use detection, (b) recovery of a supplied true property/identifier target inventory, and (c) end-to-end detection-plus-recovery as separate outcomes. Then separately require executable hidden-test equivalence for any claimed functional clone. Never use detection F1, semantic-name similarity, or exact identifier spelling as a substitute for executable behavior. Our property-renaming benchmark should also distinguish owner/property-key identities from mere textual spellings, because shadowed and same-spelling members can refer to different declarations.

**Scope limits:** this is Java bytecode/decompiled-source identifier renaming, not JavaScript property-key transformation; semantic recovery is primarily a name-suggestion task, not program reconstruction; and the agentic harness is one-shot read-only retrieval rather than unrestricted T1/T2 execution. Use it as a task-design reference, not as a direct score prediction for this project.
