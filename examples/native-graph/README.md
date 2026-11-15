# Opt-in native-register expression graph for hot JavaScript functions

This is a second execution backend for the same proven, bounded AST grammar as [the bytecode expression VM](../expression-vm/README.md). It uses normal JavaScript binary operations in one small helper instead of dispatching an interpreter case for every operation.

- [Original source](before.cjs)
- [Actual generated output](after.cjs)
- [Deterministic sample builder and byte-exact verification](build-sample.cjs)
- [Source-only AST reconstruction attacker](../../sims/native-graph-static-recover.js)
- [Behavior, CLI, and hot-loop performance tests](../../test/native-graph.test.js)
- [Integrated COO/SNO static attack tests](../../test/native-graph-static-recovery.test.js)

The original function calculates **((x + 7) * (x - 5)) ^ ((x + 3) & 255)**. The generated code replaces the original return expression with a private helper call and six dependent native operators across eleven seeded register names. Integer operands are written as XOR-masked literal expressions, constant-foldable by ordinary JavaScript engines.

Generate or byte-verify the sample by running the **build-sample.cjs** program using Node.js. The sample seed is **native-graph-example-v1**; the test suite validates its exact bytes. This is actual compiler output, with the same source parsing and instrumentation boundaries used in the public COO/SNO tools.

Programmatic opt-in: supply **experimentalNativeGraph** as a relative-filename to function-name mapping when calling obfuscateFiles. For COO/SNO CLI input, use **--native-graph relative-file:functionName**. The pass is off by default. The function cannot simultaneously opt into the interpreted expression VM. The experimental SCO command-line interface withholds both graph options from public served JavaScript.

This backend is intended for hot-loop cases where per-operator bytecode dispatch would violate the 2.5x runtime bound. Its deliberately simple native operator sequence may permit a much lower overhead. Measure your actual original and emitted workload; the test suite records a dense-call median on Ubuntu and Windows. Application-dependent runtime and startup remain separate requirements.

**Security:** The operation dataflow is directly visible to a source-analysis attacker. The independent implementation in **sims/native-graph-static-recover.js** follows masked constants and register definitions to reconstruct the original formula without original source or seed. Ordinary lexical identifier mangling across the full COO/SNO pipeline does not create a trusted confidentiality boundary. The backend provides no integrity check, domain lock or secret protection. It is valuable as a performance-conscious transformation with an explicit, testable static recovery limit.
