# Experimental nested-expression register VM

This is a real compiler-generated before/after example using the opt-in **virtualizeExpressionGraphs** pass in **src/expression-vm.js**.

- [Original one-argument CommonJS function](before.cjs)
- [Actual generated obfuscated output](after.cjs)
- [Deterministic sample generator and byte-exact verification](build-sample.cjs)
- [Independent seedless static attacker](../../sims/expression-vm-static-recover.js)
- [Behavior and performance tests](../../test/expression-vm.test.js)
- [Static reconstruction tests](../../test/expression-vm-static-recovery.test.js)

Generate the same output from before.cjs by running the provided build-sample.cjs script with Node. The test suite invokes **buildSample(true)** to verify that the checked-in after.cjs matches the actual compiler exactly. No hand-written output substitutions are used.

The example evaluates ((x + 7) * (x - 5)) ^ ((x + 3) & 255). The older single-register VM deliberately rejects this expression because both operands contain nested dependent computations. The new compiler allocates numbered registers, emits a postorder sequence of **six native-JavaScript binary operators**, and hides that sequence in a per-build byte tape with reversible opcode and literal encodings. Its helper is declaration-hoisted and caches the tape after first use.

The transform accepts only an explicitly named top-level function with one parameter and one return expression, where every expression leaf is the parameter or a numeric integer literal in 0..255 and operators are among + - * / % ^ & | << >> >>>. A graph must have at least two operations. Unsupported syntax or a detected function-source observer causes refusal. The tool also refuses direct eval and with. External type assumptions are unnecessary for these restricted expressions: the generated execution uses native JS operators in the same left-to-right order. The user must still rule out observable stack/source formatting changes and unknown cross-file source observers.

Use the **--expression-vm relative/file.cjs:mix** option with the COO/SNO CLIs, or programmatically supply an **experimentalExpressionVm** per-file function-name mapping to obfuscateFiles. It is off by default. The SCO CLI does not expose it, because the useful SCO security boundary is retaining sensitive logic server-side.

**Security result:** The checked-in attacker reconstructs the full expression (((x+7)*(x-5))^((x+3)&255)) from the distributed VM alone, without the seed or original source. Separate tests recover 48 independently diversified builds and replay 120 input values per build. A full-control COO or SNO attacker can also execute and instrument the distributed helper. The byte tape is a structure-hiding experiment and provides no demonstrated confidentiality, integrity, or environment authorization.

**Performance contract:** A bytecode dispatch runs per binary operator, so frequent VM calls can exceed the required 2.5x compute budget. The included mixed-workload test reports a reproducible sample ratio at one VM call per 512 outer-loop iterations. This ratio is workload-specific and is not a global assertion. Measure the actual deployed workload, and decline this transform if it exceeds the budget.
