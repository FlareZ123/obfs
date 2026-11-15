# Expression VM experimental evaluation: correctness, overhead and selective use

Date: 2026-11-15  
Researcher: Agent 10  
Status: intermediate reproducible negative evaluation, experimental-only code

## Motivation and design

The existing COO/SNO transforms are readily normalized by source-only AST inspection, and SCO's cosmetic response variation also collapses under a canonicalizer (see `im-results/sco-seed-and-canonicalization-2026-11-15.md`). A selective VM can in principle raise the cost of direct source reading, provided real execution fits the specified 2.5× compute ceiling and the VM itself is not easily decoded.

`sims/expr-vm.js` is an **opt-in, offline experiment**. It parses strict JavaScript module/CommonJS source using Acorn, selects explicitly named top-level synchronous function declarations and lowers one return expression into postfix bytecode. Its supported expression nodes are formal-parameter references, primitive literal constants, selected unary operators and binary arithmetic/bitwise/comparison operators. Unsupported expressions, dynamic `eval`, and syntactic source observation cause conservative refusal. It retains the original declaration name and parameters. It appends a generated private bytecode interpreter and randomized opcode labels. The experiment was never wired into `src/core.js` or any shipped CLI.

`test/expr-vm.test.js` compares original and lowered CJS functions in actual V8 realms, checks native coercion and exception paths, `Symbol.toPrimitive` ordering, negative/large operands, real imported ESM exports, target name/arity, unsupported syntax refusal, and behavior after mutation of Array prototype methods. These VM-specific cases passed in [run 43685219343](https://github.com/FlareZ123/obfs/actions/runs/43685219343) and updated [run 43685448199](https://github.com/FlareZ123/obfs/actions/runs/43685448199). Neither establishes full JavaScript semantics, and source/stack introspection across unknown external files remains unproved.

## Hot-function overhead

The test's benchmark uses one tiny integer function `((a^b)+17)*3`, 75,000 repeated calls per trial, two warmups, five native/VM timing pairs and the sorted median of ratios. These are isolated steady-state CI observations, not a generally bounded cost or browser benchmark.

| Candidate | Windows Node22 | Ubuntu Node22 | CI evidence |
|---|---:|---:|---|
| Initial postfix VM with per-call bytecode arrays, `stack.push/pop` | 87.41× | 80.47× | [43685219343](https://github.com/FlareZ123/obfs/actions/runs/43685219343) |
| Revised VM with lazily cached program, native `arguments`, indexed stack | 81.58× | 64.00× | [43685448199](https://github.com/FlareZ123/obfs/actions/runs/43685448199) |
| Same revised VM, later independent CI sample | 67.57× | 64.14× | [43685598098](https://github.com/FlareZ123/obfs/actions/runs/43685598098) |

The revisions reduced several interpreter overhead sources and removed reliance on user-replaceable Array prototype operations. The optimized VM still violates the 2.5× target for a hot, tiny numeric function by a wide margin.

## Mixed native/VM workload sensitivity

Commit `3932ac9` added a bounded experiment in `test/expr-vm.test.js`: 120,000 iterations of a fixed integer computation with the virtualized `((a^b)+17)*3` expression called at a chosen frequency. Three warmups and seven alternating original/VM timing pairs are used per frequency. Each candidate must produce exactly the original checksum. Results from [43685598098](https://github.com/FlareZ123/obfs/actions/runs/43685598098):

| Virtualized calls per iterations | Ubuntu median overhead | Windows median overhead |
|---|---:|---:|
| 1 / 1 | 43.59× | 56.69× |
| 1 / 8 | 14.78× | 18.61× |
| 1 / 64 | 3.02× | 3.85× |
| 1 / 512 | 1.27× | 1.31× |

Under this **one workload**, only the last frequency meets the stated 2.5× target. Infrequent functions can hide a large interpreter cost behind other computation. This offers a candidate direction for profile-directed selective VM transforms, with a runtime cost model and continued differential testing. Selection from one sample cannot guarantee another workload's bound. Numbers differ from Agent 18's separate hand-written one-register immediate-only VM, which measured ~1.94–2.01× in its own microbenchmarks; see `im-results/vm-pure-immediate-2026-11-15.md`. These implementations must be evaluated independently.

## Static resistance and trust-boundary limitations

The published postfix opcode interpreter exposes instruction semantics through its switch-case code and carries encoded operations and operand values in client-accessible bytecode. Random opcode numbers are a cosmetic encoding. A source-only attacker should be able to reconstruct supported expressions by inspecting public tables. Agent 18 is developing an independent seedless AST extractor `sims/expr-vm-static-recover.js` and associated tests. Initial [CI 43685598098](https://github.com/FlareZ123/obfs/actions/runs/43685598098) showed the extractor failing to recognize the new cached-program output after commit `156294d`; it is a test-tool compatibility gap, **not evidence of improved security**. Verify a corrected independent extractor before stating a measured recovery result.

If the attacker fully controls the client in COO or the process and filesystem in SNO, a local interpreter does not restore a trusted integrity or authorization boundary. Server-resident, authenticated SCO operations can keep implementation bytes off the client, albeit with a callable behavior oracle and network cost.

## CI qualification

The manual runs above passed all VM-specific differential tests. Whole-repository validation remained red because a concurrent conservative `observesFunctionSource` change declined a previously expected local property-rename transform in `test/obfuscator.test.js`; this exact issue was reported to Agent 6. The latest extractor tests also need updating after the cached-bytecode representation change. Do not describe the whole head as green. The experimental VM is **not accepted as a production obfuscation technique** under the 2.5× condition.

## Suggested next experiment

Build a seedless, opcode-table-based static reconstructor for both the original and cached programs; require exact recovered expression values and native execution equality. Separately, measure a fixed multi-workload profile in Chrome and Node under varied VM call frequency and JIT warmup regimes. Selective virtualization should only be considered when it meaningfully increases reconstruction cost, preserves behavior against adversarial semantics, and remains within a measured application-wide overhead budget. 
