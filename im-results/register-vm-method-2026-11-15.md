# Opt-in register VM research with executable before/after source

**Date:** 2026-11-15. **Author:** Agent 30. **Status:** experimental source-transform capability, not a certified protective security boundary.

## Construction and target

`src/register-vm.js` implements `virtualizeRegisterChains(source,sourceType,{seed,names})`, a CommonJS/JSDoc Acorn-backed AST compiler. It proves a narrow single-register expression shape comprising a lone function formal and a linear chain of binary operations with unsigned 8-bit literal immediate RHS operands. It declines dynamic `eval`/with, syntactic function-source observations, unsupported operators and multi-statement bodies. Each accepted expression is lowered to a bytecoded register VM, with seed-derived opcode rotation and XOR-masked operand bytes. Generated helpers are declaration-scoped and bytecode arrays are lazily cached. The explicit `experimentalRegisterVm` file-to-target configuration works in `obfuscateFiles` and the COO/SNO CLI `--register-vm file:functionName`. The ordinary/default compiler pipeline remains unchanged.

A committed real before/after executable sample is in `examples/register-vm/{before.cjs,after.cjs,build-sample.cjs,README.md}`. Output was generated, logged and artifact-uploaded by pinned [GitHub Actions run 43720842213](https://github.com/FlareZ123/obfs/actions/runs/43720842213). Example: `function mix(x){return ((((x+7)*3)^90)-5);}` becomes `function mix(x){return (_rvm_4e0b19e34e742226(x));}` with a private interpreter and nine bytecode entries. The checked-in `after.cjs` is generated output, never an illustrative manual reconstruction.

## Differential and performance observation

At candidate commit `c3fc3e214c811a20dd126574182f028029e80ff0`, [manual Linux/Windows full run 43720564800](https://github.com/FlareZ123/obfs/actions/runs/43720564800) passed all new `test/register-vm.test.js` tests, including coercion of strings, numeric edge cases, BigInt and Symbol errors, custom `Symbol.toPrimitive` order, hoisting, `.name`/`.length`, Array.prototype mutation, unsupported syntax refusal and COO/SNO integration. Measured mixed steady-state compute with one call per 256 iterations, alternating nine trials and warmup: **Ubuntu 1.479×**, **Windows 1.714×** relative to the baseline. These are one-workload diagnostic samples, not a universal 2.5× bound, especially for a VM-dominated hot function.

The **full run 43720564800 was not green**: a concurrently added SCO example test had an async-nullability JSDoc error; Agent 30 fixed that on main (`59913a9c`). On Windows, Agent 17's MBA sample exact snapshot differed under CRLF and operator-alternative generation. Agent 17 was notified. This VM's own tests passed on both runners; revalidate the latest integrated snapshot before promoting the branch.

## Resistance and trust assumptions

Opcodes and immediates are lightly transformed and structurally split from the original expression, raising the cost of casual source reading. The public interpreter exposes both opcode semantics and decoding constants, making seedless static reconstruction plausible. This technique offers diversification against naive source inspection, **without evidence of resistance** to serious static reconstruction, runtime instrumentation, integrity bypass or full-control client/server attackers. The caller must prove that cross-file source observers and stack observations do not matter and that the actual runtime profile fits the budget. COO and SNO have no trusted secrecy barrier under the project's threat models. SCO's trusted server boundary is conceptually different and receives no extra secrecy from this local VM.

The result advances a concrete advanced obfuscation prototype with generated output and repeatable tests, while retaining its negative security and performance limits.
