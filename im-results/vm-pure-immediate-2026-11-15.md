# Experimental immediate-opcode VM: cost envelope and static recovery

Date: 2026-11-15. Author: Agent 18. **Intermediate evaluation**, not a production feature, compiler correctness theorem, or strong obfuscation result.

## Candidate

`workplace/experimental-vm-lower.js` accepts an opt-in named top-level JavaScript function with exactly one parameter and a single return expression of the form `(((x + c1) * c2) ^ c3)`, generalized to nine binary operators with small nonnegative integer right operands. It uses Acorn AST syntax evidence to reject anything outside this narrow subset, such as function calls, property reads, additional statements, or source observers in the same file. The lowerer replaces only the function body, preserving its declaration name and parameter count. It emits a register interpreter with a seed-rotated opcode table and immediate operands XOR-masked with a seed-derived byte. It avoids `eval` and an external code loader.

**Limits:** the generated interpreter allocates an array per call and changes observable `Function.prototype.toString`/stack source. The same-file direct source-observer check cannot prevent external observers, runtime mutation, or hostile host instruments. This must remain an experimental opt-in prototype, not a generally semantics-preserving production pass.

## Differential evaluation

`test/vm-immediate-lowering.test.js` exercises arithmetic/XOR, subtraction/shift/unsigned shift, and bitwise AND/OR chains on negative values, signed zero, large integers, `NaN`, infinities, strings, booleans, `null`, `undefined`, `BigInt`, `Symbol`, and a custom `Symbol.toPrimitive` with observable conversion count. It compares returned values/errors and function `.name`/`.length`. Unsupported structures fail closed and retain the exact input bytes. All tests passed in manual Windows+Ubuntu Node.js 22 [CI 43685080693](https://github.com/FlareZ123/obfs/actions/runs/43685080693).

## Steady-state performance under the 2.5× target

`sims/vm-hybrid-ratio.js` separately tests a hand-written minimal register bytecode kernel and four mixes with non-VM work. Each case uses a 400,000-iteration workload with eight warmups and 11 alternating original/virtualized timing trials. The measurements below are one CI sample, Node.js v22.23.4 [workflow 43684599611](https://github.com/FlareZ123/obfs/actions/runs/43684599611), not guaranteed bounds or browser measurements.

| Scenario | Ubuntu original / VM median | Ubuntu ratio | Windows original / VM median | Windows ratio |
|---|---:|---:|---:|---:|
| Pure numeric kernel | 1.854 / 3.722 ms | 2.007× | 1.864 / 3.618 ms | 1.941× |
| VM expression every iteration, 8 surrounding arithmetic steps | 3.604 / 7.099 ms | 1.970× | 3.622 / 7.087 ms | 1.957× |
| Once per 8 iterations | 2.569 / 3.128 ms | 1.218× | 2.572 / 3.106 ms | 1.208× |
| Once per 64 iterations | 2.466 / 2.551 ms | 1.034× | 2.471 / 2.569 ms | 1.040× |
| Once per 512 iterations | 2.410 / 2.413 ms | 1.001× | 2.415 / 2.424 ms | 1.004× |

Every measured ratio was below 2.5×. These results apply to the specific simple *hand-written* VM in the simulator and must not be conflated with a verified runtime bound for the AST-generated per-call-array VM or arbitrary programs. All timing samples are included in the simulator's raw JSON log. SCO/SNO permit amortizing selected initialization costs, while COO does not.

## Adversarial result: the VM's static secrecy is poor

`sims/vm-static-recover.js` parses the lowered source without knowing the seed, identifies the public interpreter case mappings and XOR mask, and recovers the original chain of binary operations and immediate constants. `test/vm-static-recovery.test.js` verifies full symbolic reconstruction for three formulas across two different seeds, with exact operation counts and bytecode length. The static attack passed on both operating systems in [CI 43685080693](https://github.com/FlareZ123/obfs/actions/runs/43685080693).

Thus opcode rotation and a code-resident XOR mask provide little defense against source-only static analysis, regardless of favorable interpreter timing. Even under the 2.5× budget, this candidate is currently a **negative security result**. Future work would require materially harder reconstruction, more flexible semantics proofs, browser timing validation, and a way to bound overhead without allowing the adversary to recover bytecode immediately. Protecting secret-dependent operations on the SCO server remains qualitatively stronger than packaging their entire interpreter and bytecode into COO/SNO files.
