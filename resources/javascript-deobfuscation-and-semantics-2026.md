# 2026 external evidence on JavaScript reverse engineering and semantic correctness

Status: external literature pointers, **not findings produced or independently reproduced by this repository**. Sources accessed 2026-11-15.

## NDSS 2026: JSIMPLIFIER

Dongchao Zhou, Lingyun Ying, Huajun Chai, and Dongbin Wang, "From Obfuscated to Obvious: A Comprehensive JavaScript Deobfuscation Tool for Security Analysis," NDSS 2026, https://www.ndss-symposium.org/ndss-paper/from-obfuscated-to-obvious-a-comprehensive-javascript-deobfuscation-tool-for-security-analysis/.

The published abstract describes a pipeline combining preprocessing, AST static analysis, dynamic execution tracing, and LLM-enhanced identifier renaming. It reports a 44,421-sample obfuscated JS dataset spanning 20 techniques, 100% processing capability and correctness on evaluation subsets, 88.2% code complexity reduction, and an assessed >4x readability improvement. These are the authors' reported numbers; they are not guarantees for any new obfuscation technique or for this repository.

Research consequence: protect against a combined static/dynamic/LLM attacker, rather than only source-text scanners or keyword-based heuristics. Simple XOR strings, randomized names, flat control flow and syntactic polymorphism must be scored against tracer recovery and source reconstruction. If the client can run an instrumented program, values materialized in its address space remain visible.

## OOPSLA 2026: OBsmith

Shan Jiang, Chenguang Zhu, and Sarfraz Khurshid, "OBsmith: LLM-Powered JavaScript Obfuscator Testing," OOPSLA 2026, https://2026.splashcon.org/details/oopsla-2026/5/OBsmith-LLM-Powered-JavaScript-Obfuscator-Testing, DOI 10.1145/3798204.

The authors report LLM-generated and skeleton-extracted program sketches, original-vs-obfuscated equivalence and metamorphic tests, >3,000 candidate programs from 600 sketches over seven obfuscation configurations, and eleven newly found correctness bugs in two popular JavaScript obfuscators. Five general-purpose fuzzers did not find those issues under the authors' equal-budget comparison. The paper illustrates why complex scope, cross-file, reflection and failure semantics deserve independent test oracles.

Research consequence: develop reproducible, source-specific, metamorphic program families. Require exact behavior agreement, including exception categories, property descriptors, function names/length, import graph effects, context receivers, Node/browser globals and top-level initialization order. A transformation that cannot prove a usage safe should decline it. Record any counterexample with a seed and an executable regression.

## Local project synthesis and unresolved tasks

The project has small syntax-level transforms and optional SCO server-resident code. Against a fully instrumented client, the only genuine confidentiality boundary is data and execution retained on a trusted SCO server. The new SCO RPC facade and dedicated async ESM partition demonstrate this boundary for explicitly selected JSON-compatible APIs. Their limitations include unlimited black-box requests and network-time overhead. The Node/browser semantic test suite and independent SNO/COO cold-start measurements are more useful for rigorous progress than visual complexity alone.

Future adversarial testing should evaluate separately:
1. Static reconstruction and recovery of original property/identifier/string semantics.
2. Dynamic extraction with script instrumentation and network interception.
3. Unauthorized modification and whether a trusted server rejects requests.
4. Per-workload 2.5x performance and behavior equivalence across browser/Node versions.

Avoid calling any security-performance composite score established without specifying weights, workloads, attacker capabilities and how missing dimensions were handled.
