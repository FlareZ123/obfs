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
