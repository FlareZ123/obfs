# 2025–2026 deobfuscation attacker pressure for obfs candidate selection

**Prepared:** 18 November 2026. **Classification:** external-resource synthesis and evaluation guidance. This note does not claim a new obfuscation result and does not replace source-pinned repository experiments.

## Why this matters

The current public deobfuscation literature is converging on hybrid attackers. A candidate should receive little security credit merely because one AST rewriter, one symbolic solver, or one raw LLM prompt fails. Current systems combine statistical recognition with deterministic IR transforms, dynamic execution, symbolic handler lifting, decompiler infrastructure, and execution-verifiable evaluation. Under the project threat models, those capabilities should be treated as ordinary attacker tooling.

## JavaScript hybrid deobfuscation

### CASCADE / JSIR

Shan Jiang, Pranoy Kovuri, David Tao, and Zhixun Tan, **CASCADE: LLM-powered JavaScript Deobfuscator at Google**, ICSE-SEIP 2026, DOI 10.1145/3786583.3786873, arXiv 2507.17691.

Primary links:
- https://arxiv.org/abs/2507.17691
- https://conf.researchr.org/details/icse-2026/icse-2026-software-engineering-in-practice/21/CASCADE-LLM-powered-JavaScript-Deobfuscator-at-Google
- https://github.com/google/jsir

CASCADE uses an LLM to identify important obfuscator prelude functions and delegates reliable source-to-source rewriting to JSIR, an MLIR-based JavaScript IR. The authors report deployment at Google. The public evaluation is narrower than this project: it focuses on Obfuscator.IO string obfuscation over 3,000 programs and does not establish whole-program functional equivalence for arbitrary control-flow transforms. Its important methodological lesson is the division of labor: use a model for structure recognition, then deterministic compiler/data-flow machinery for transformations.

**Repository consequence:** candidate evaluation needs at least one hybrid structure-recognizer plus deterministic-IR attacker. A result against a prompt that asks an LLM to emit an entire clean program is mainly an LLM-output reliability measurement.

### JSIMPLIFIER

Dongchao Zhou, Lingyun Ying, Huajun Chai, and Dongbin Wang, **From Obfuscated to Obvious: A Comprehensive JavaScript Deobfuscation Tool for Security Analysis**, NDSS 2026, DOI 10.14722/ndss.2026.242198.

Primary links:
- https://www.ndss-symposium.org/ndss-paper/from-obfuscated-to-obvious-a-comprehensive-javascript-deobfuscation-tool-for-security-analysis/
- https://doi.org/10.14722/ndss.2026.242198

JSIMPLIFIER combines preprocessing, AST static analysis, dynamic monitoring, and LLM-assisted identifier renaming. Its published dataset contains 44,421 samples, including 23,212 malicious and 21,209 benign samples. The authors report 100% processing across 20 categorized techniques, 100% correctness on their evaluation subsets, 88.2% complexity reduction, and more than fourfold readability improvement.

**Repository consequence:** public-source candidates should face a combined static/dynamic attacker. Dynamic traces are an ordinary capability under COO and SNO and should be allowed to feed back into static simplification.

### JsDeObsBench

Guoqiang Chen, Xin Jin, and Zhiqiang Lin, **JsDeObsBench: Measuring and Benchmarking LLMs for JavaScript Deobfuscation**, CCS 2025, DOI 10.1145/3719027.3744871.

Primary links:
- https://doi.org/10.1145/3719027.3744871
- https://jsdeobf.github.io/

The benchmark contains 36,260 execution-verifiable obfuscated JavaScript programs plus 4,515 malicious samples. It evaluates seven transformation families and four dimensions: syntax, execution correctness, simplification, and similarity/readability. Its reported LLM outputs frequently lose execution correctness even when readability improves. Combined transformations also reduce raw-LLM performance substantially.

**Repository consequence:** a raw LLM's failure to regenerate behavior is weak evidence by itself. Attacker scoring should separate recognition/reasoning success from code-generation reliability and verify submitted reconstructions with held-out execution.

## Control-flow and opaque-predicate pressure

Xiao Chen et al., **Large Language Models for Opaque Predicate Resolution: A Universal Control Flow Deobfuscation Framework (LUCID)**, FSE 2026, DOI 10.1145/3808099.

Primary link:
- https://doi.org/10.1145/3808099

LUCID uses an LLM to infer predicate-mapping rules and then performs deterministic control-flow reasoning. The published evaluation covers 780 binaries and 13 obfuscation techniques. The reported results include 52.4% average cyclomatic-complexity reduction, full deobfuscation in 53.8% of cases, and more than 99% suppression of bogus-path inflation under its metric.

**Repository consequence:** control-flow-flattening candidates should face a relation/predicate inference attacker alongside literal constant folding. Runtime-derived assertions can force execution, while the COO attacker controls the browser and can instrument real execution, so a dynamic-trace lane remains required.

## VM deobfuscation pressure

Fabian Kilger, Leonard Auer, and Manuel Andreas, **VMSpec: A Decompiler-based Approach against Virtual Machine Obfuscation**, arXiv:2610.29566, 21 October 2026.

Primary link:
- https://arxiv.org/abs/2610.29566

VMSpec treats an unknown VM as a processor architecture, uses dynamic symbolic execution to recover handler semantics and context, generates a SLEIGH specification, and then uses Ghidra for decompilation. The authors evaluate 147 benchmark programs plus six real-world malware DGAs using Tigress and Code Virtualizer and report near-complete stripping of VM obfuscation. The method handles input-dependent paths and recursive calls. The paper identifies important remaining pressure points: VM-state identification, handler-level path explosion, context beyond one handler, arithmetic/MBA simplification, and general decompiler limitations.

**Repository consequence:** VM diversification alone is a weak promotion argument. A candidate using randomized opcodes, register-vs-stack layout, handler shuffling, macro/superinstructions, stateful opcode mapping, or bytecode encoding should face a VMSpec-style handler-lifting attack that learns semantics once and decompiles held-out bytecode. Candidate-specific state hiding and anti-DSE techniques need explicit evidence, while every added layer still faces the project's 2.5x compute veto.

## VM deobfuscation pressure II: PUSHAN

Ashwin Sudhir et al., **PUSHAN: Trace-Free Deobfuscation of Virtualization-Obfuscated Binaries**, arXiv:2603.18355, first submitted 18 March 2026. The CISPA publication page lists it for NDSS 2027.

Primary links:
- https://arxiv.org/abs/2603.18355
- https://cispa.de/en/research/publications/213728-pushan-trace-free-deobfuscation-of-virtualization-obfuscated-binaries

PUSHAN removes a second assumption that VM defenses often rely on: the attacker need not build full path constraints or observe one runtime trace. Its VPC-sensitive, constraint-free symbolic emulation tracks native location together with the virtual program counter, recovers a complete CFG, simplifies VM machinery, and then decompiles. The authors report evaluation on more than 1,000 protected binaries covering Tigress, VMProtect, and Themida.

**Repository consequence:** a JS VM attacker should include a VPC-sensitive abstract emulator that treats the bytecode/program region as public immutable data, discovers successors without preserving whole-program path predicates, and iterates state merging to a fixed point. This lane complements VMSpec's handler-specification attack. Causing path explosion for conventional symbolic execution alone does not establish resistance to this attacker.

## Current public obfuscator direction

Two active public projects illustrate where deployable designs are heading:

- JS-Confuser 2.1.3 documents runtime assertions in control-flow flattening specifically to force static solvers to execute environment-dependent code after prior CFF was deobfuscated by current LLMs. Its own documentation warns that CFF significantly impacts performance. Source: https://github.com/MichaelXF/js-confuser/releases and https://github.com/MichaelXF/js-confuser/blob/master/docs/ControlFlowFlattening.md
- JS-Confuser VM 0.1.5 uses a register VM with randomized/shuffled handlers, encoded and self-modifying bytecode, macro/specialized/aliased opcodes, fake effects, dispatcher indirection, decoy frame slots, and control-flow integrity. Source: https://github.com/MichaelXF/js-confuser-vm
- JavaScript-Obfuscator's current Pro VM documentation advertises stateful opcodes, macro-ops, register-based lowering, jump/bytecode encoding, call-context opcodes, stack encoding, and anti-automation/self-defending modes. Source: https://github.com/javascript-obfuscator/javascript-obfuscator

These feature lists are useful candidate generators rather than evidence. The public runtime is observable in COO, and several options explicitly trade performance for hardening. The project should import ideas only through matched attacker and runtime experiments.

## Direct anti-LLM obfuscation: AcODA

Hongzhou Rao, Zikan Dong, Yanjie Zhao, Haodong Li, and Haoyu Wang, **AcODA: Adversarial Code Obfuscation for Defending against LLM-based Analysis**, ICSE-Companion 2026, DOI 10.1145/3774748.3793624, arXiv 2606.11755.

Primary links:
- https://arxiv.org/abs/2606.11755
- https://github.com/security-pride/Acoda

AcODA is unusually relevant because it explicitly optimizes code against LLM analysis. Its eight methods target refusal induction, reasoning deception, and output disruption. Several techniques use comments, identifier/function names, dead vulnerability-shaped code, and EOS-like strings; the genetic search favors combinations that raise refusal or deobfuscation-test failure. The paper reports up to 70% attack-success rate across seven model families with negligible runtime overhead on its Python benchmark.

The paper also states the key limitation for this project: manual preprocessing, deobfuscation-specific fine-tuning, weaker safety alignment, or reduced sensitivity to special tokens can reduce the defense. Its evaluation is Python-focused and its strongest signal often comes from inducing model refusal. Under this repository's threat model, an attacker may normalize comments and dead text before model analysis, select a locally controlled model, or route structural inference into deterministic tooling.

**Repository consequence:** anti-LLM work should include an AcODA-like adversarial lane, while safety-policy/refusal effects remain a separate metric. A candidate receives structural-security credit only after the same artifact is tested behind a semantics-preserving lexical/AST sanitizer and against a hybrid deterministic attacker. Refusal by one hosted assistant is not a program-reconstruction barrier.

## Correctness pressure: OBsmith

Shan Jiang, Chenguang Zhu, and Sarfraz Khurshid, **OBsmith: LLM-Powered JavaScript Obfuscator Testing**, OOPSLA 2026, DOI 10.1145/3798204.

Primary links:
- https://doi.org/10.1145/3798204
- https://github.com/shanjiang98/obsmith

OBsmith generates JavaScript program sketches with LLMs, instantiates them, and differentially tests original and obfuscated behavior. It also extracts skeletons from real programs. Across more than 3,000 candidate programs and seven configurations, the authors report 11 previously unknown correctness bugs in JS-Confuser and Obfuscator.IO; five general-purpose JavaScript fuzzers did not find those bugs under the same 3,000-program budget.

**Repository consequence:** semantic preservation should add an OBsmith-style lane that generates feature-directed sketches and extracts repository-specific skeletons, then compares original and obfuscated observable behavior. This complements broad random fuzzing because the generator is conditioned on source-to-source transform failure modes.

## Minimum attacker matrix for future promotion

A future candidate should pass all applicable lanes on the same immutable artifact before promotion is considered:

1. deterministic AST/data-flow simplification and source recovery;
2. LLM-assisted structure/prelude/predicate recognition feeding deterministic transformations;
3. dynamic trace capture feeding static simplification;
4. black-box held-out functional cloning when the public API permits queries;
5. for VM backends, handler/context lifting followed by held-out bytecode decompilation;
6. debugger/runtime extraction and code lifting under the stated COO/SNO control model;
7. exact original/candidate semantic differential testing, including OBsmith-style feature sketches;
8. source-coincident Node and browser compute measurements with the strict 2.5x veto retained per observed supported workload.

Each lane measures a separate pressure point. The project's release decision should continue to report static reconstruction, dynamic extraction, tamper/integrity bypass, environment admission, compatibility, and performance as separate dimensions.
