# Rolling-state superinstruction VM: VPC recovery and cache tradeoff

**Agent 5, 18 November 2026. Status: intermediate negative VM evidence.**

## Question

Recent public VM obfuscators emphasize stateful opcode mappings, encoded bytecode, register layouts, macro-operations, and self-modifying state. Recent VM deobfuscation research, especially VMSpec and PUSHAN, suggests that stateful public formats need to face handler/context lifting and virtual-program-counter-sensitive emulation rather than opcode-frequency or naive symbolic-execution baselines.

This experiment asks a narrow question: does a public rolling decoder state plus coarse superinstructions create a useful security/performance frontier in this JavaScript setting?

It does not implement arbitrary JavaScript lowering and is not a production backend.

## Candidate and attacker

The source-pinned experiment is:

- `sims/vm-stateful-superinstruction-negative.js`
- `test/vm-stateful-superinstruction.test.js`
- workflow source `5abc88e0560eb9b4d4eff9144b9b9493a9c6d6f5`
- cross-platform run https://github.com/FlareZ123/obfs/actions/runs/44424168579

The public program contains:

- an emitted initial decoder state;
- encoded opcode bytes;
- encoded 32-bit constants;
- two coarse arithmetic superinstruction families;
- aliases selected from rolling decoder state.

The build seed itself is absent from the runtime artifact.

The attacker `recoverPublicProgram` receives the published program only. It tracks virtual PC plus the public decoder state, decodes each instruction without path constraints, and emits a recovered `{variant, constant}` semantic stream. It does not receive a runtime oracle or the build seed.

The regression generated eight distinct seeds across six depths and checked seven fixed inputs per program: **336 exact candidate/native/recovered comparisons**. Both CI operating systems passed.

## Runtime profiles

The simulator measures two execution designs:

1. **decode every call**, where rolling opcode/constant decoding remains in the hot path;
2. **prepared/cache**, where the rolling stream is decoded once and later calls execute the recovered semantic stream.

The second design models the obvious runtime optimization for repeated use. It also makes the security consequence explicit: the cached form is exactly the attacker's recovered representation.

Nine alternating CPU samples were retained per depth.

| Rounds | Ubuntu decode/call ratio | Ubuntu strict >2.5 | Ubuntu prepared ratio | Windows decode/call ratio | Windows strict >2.5 | Windows prepared ratio |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1.87783x | 0/9 | 1.30035x | 2.00000x | 1/9 | 1.31915x |
| 2 | 2.52521x | 7/9 | 1.30553x | 3.00000x | 6/9 | 1.34043x |
| 4 | 3.23214x | 9/9 | 1.41357x | 3.71429x | 9/9 | 1.49206x |
| 8 | 3.96234x | 9/9 | 1.55591x | 4.65957x | 9/9 | 1.34043x |
| 16 | 4.57153x | 9/9 | 1.64840x | 4.80769x | 9/9 | 1.60256x |
| 32 | 4.64319x | 9/9 | 1.72403x | 5.69841x | 9/9 | 1.74603x |

The Windows process-CPU clock is visibly quantized in these short samples, so the isolated 1-round 1/9 decode-every-call breach should be retained as a strict observation without over-interpreting its exact ratio. The deeper decode-every-call failures are consistent across both operating systems. The prepared arm had **0/9 strict breaches at every tested depth on both runners**.

## Decision

This bounded design exhibits a direct tradeoff:

- keeping rolling decode state in the hot path becomes over budget almost immediately;
- moving decoding into a prepared/cache stage produces favorable repeated-call CPU ratios;
- the prepared representation is the same semantic stream recovered by the public VPC-state attacker.

For COO, the attacker controls the client and can inspect that prepared state directly. For SNO, the stated attacker controls process memory and can inspect it as well. The cache therefore improves runtime by materializing the very structure the defense was trying to obscure.

Stateful public opcode encoding, alias rotation, and coarse superinstructions do not establish a protection gain here. A future VM candidate needs hidden or input-dependent state that creates measured additional attacker cost under the stated runtime-control model, while still surviving the strict compute budget. Such a candidate should be preregistered against VPC-sensitive/context-lifting attacks before implementation.

Keep this result in `im-results/`; it is a negative design control rather than an established strong-obfuscation result.
