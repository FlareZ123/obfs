# Three dynamic observations of public COO affine exports

**Date:** 2026-11-17. **Classification:** Intermediate adversarial test design, awaiting Linux/Windows execution. No claim of arbitrary JS reconstruction, anti-tamper protection, or academic novelty.

## Distinct attack question

Can an attacker holding the actual published three-module stateful COO application construct an executable equivalent of its three protected integer functions with one observed runtime output per exported function? This complements the existing source-only AST interpreter. The latter walks compiler-emitted switch/affine instructions; the new attacker does not import the compiler or source-only affine decompiler and learns each offset from a call to its public runtime.

The fixed original program lives in [the native three-file ESM example](../examples/polyvariant-app/native/). Its distributed math module uses two opt-in polyvariant cases for each of three exported integer-normalized affine chains. The downstream stateful application uses Unicode payloads, repeated digest invocations, reflection on state keys, and host callback tracing. The scope of the protection is the three arithmetic leaves; the rest of the graph remains publicly distributed.

## Reconstruction protocol

The [attacker](../sims/coo-runtime-one-query-reconstruct.js) receives a single string containing only distributed public math source. It imports that exact string as a Node data module; for each advertised round1, round2, round3 export, it queries the public function once at numeric input zero and records the signed 32-bit output. Before seeing any native ground truth or held-out result, it commits to the restricted model f(value) = ((value | 0) + offset) | 0. It replaces the corresponding exported function bodies in the distributed source with those expressions, using Acorn solely to locate the original body spans. One invocation per target is counted as one runtime observation; source parsing and module evaluation are separately included in an attacker-duration sample.

The inference needs the declared numeric family. One zero-input observation cannot identify a general JavaScript function, its side effects, or its behavior under arbitrary operands. An adversary able to inspect the publicly executed code can verify this family separately. This experiment deliberately restricts its proof to the compiler's selected affine grammar.

The [held-out regression](../test/coo-runtime-one-query-reconstruct.test.js) creates actual compiler output, commits the attack code, and only then loads the trusted native math reference. It checks 4,096 deterministic signed-Int32 inputs per function, representative special primitive inputs and single-call-to-primitive objects, together with complete JSON and external host traces for 1, 50, 1,000 and 10,000 event sessions in fresh clone/public ESM directories. A separate refusal checks that non-Int32 public outputs cannot accidentally be sold as affine recovery. All three reconstructed leaves must actually have been protected in the generated baseline.

## Runtime and resistance interpretation

This is a dynamic execution/observable-export capability test for a fully controlling client. Successful reconstruction would demonstrate that selected published arithmetic functions do not become behaviorally opaque to an attacker allowed to run them, even if their static switch cases become visually cumbersome. It would not necessarily recover original source spelling or compiled private construction details, and would not establish ability to evade unrelated authorization checks.

The attack does not measure wall-clock difficulty for a fresh human or independent model attacker. An arithmetic model is supplied in advance, the toy leaves are structurally homogeneous, and the attacker must be able to run the distributed module. Different protected behavior requires a new adversarial model. Cold/browser and 2.5x application budget evidence remains the subject of separate pinned controls, including draft [PR 49](https://github.com/FlareZ123/obfs/pull/49).

## Reproduction and provisional status

The source is [the runtime attacker](../sims/coo-runtime-one-query-reconstruct.js) and [its held-out test](../test/coo-runtime-one-query-reconstruct.test.js), checked by [strict JSDoc configuration](../jsconfig.coo-runtime-probe.json) and [dispatch-only Linux/Windows Node 22 workflow](../.github/workflows/manual-coo-runtime-probe.yml).

The branch has been committed and syntax-parsed, but no successful two-platform runtime execution has yet been recorded. Fix concrete CI failures, preserve exact test source and run SHA, and report only verified outcomes after the gate completes.
