# SNO V8 bytecode: near-native runtime, current static decompilation

**Agent 8, 19 November 2026. Status: intermediate negative candidate result.**

## Question

Could source-free V8 cached bytecode provide a structurally different SNO backend from the
repository's JavaScript and WebAssembly candidates?

The attraction is real: a `.jsc` artifact can execute without distributing the original JavaScript
source text, and V8 has already paid the parse/compile cost. If this representation preserved
near-native runtime while materially raising reconstruction cost, it would be an interesting SNO
candidate under the 2.5x compute ceiling.

The retained experiment is:

- `sims/sno-v8-bytecode-jscd.js`

The final cross-platform validation is GitHub Actions run
[44473477227](https://github.com/FlareZ123/obfs/actions/runs/44473477227) at source commit
`a06eeb42dea3ce5c55d35c23f36713767773978c`.

The workflow pinned:

- Node 22.23.4 on the final Linux and Windows jobs;
- V8 12.4.254.21-node.57;
- Bytenode 2.1.0;
- `@ejfkdev/jscd` 0.3.3.

The packages were installed only for the manual validation job. They are not project
dependencies.

## Candidate

The fixture is a standalone branchy integer workload with nested loops, `Math.imul`, two
arithmetic paths, fixed constants, and a final mixing step. Input is supplied at runtime through
`process.argv`.

The original source intentionally contains:

- a comment canary,
  `AGENT8_V8_BYTECODE_SOURCE_CANARY_20261119`;
- a descriptive function name, `secretLedgerTransform`.

Bytenode compiles the source to a source-free `.jsc` artifact.

## Static attacker

The attacker is the current public `jscd` static V8 code-cache decompiler:

- https://github.com/ejfkdev/jscd
- https://www.npmjs.com/package/@ejfkdev/jscd

No patched Node or V8 runtime is used by the decompiler.

For Node 22+ on Linux and Windows, `jscd` documents that read-only-heap names may require a
same-build `ro-map`. The experiment therefore gives the attacker that documented calibration
path instead of treating unresolved names as resistance.

The attacker probe is generated without the candidate source. It combines a generic JavaScript
builtin/property vocabulary with identifier-like ASCII strings already visible in the public
`.jsc` bytes, then compiles eager probe functions in the published `p_<name>(o) { return
o.<name>; }` shape. That probe is passed to `jscd ro-map`, and the resulting map is used for
`jscd decompile --runtime --verify`.

This matters because an earlier underspecified probe left `Math` unresolved at read-only-heap
address `0/59376`. The upstream public table
`tables/ro_map_12_4_254_21.json` independently maps that exact address to `Math`. The final
probe uses the upstream association convention and resolves the program without target-source
knowledge.

## Raw artifact leakage

The source comment canary is absent from the `.jsc` bytes on both platforms.

The original function identifier `secretLedgerTransform` is present in the raw bytecode bytes on
both platforms.

So this fixture already leaks a useful source-level name before decompilation. The result does not
claim every original identifier survives V8 serialization; it records that this descriptive
identifier does.

## Functional static recovery

The decompiler emits 14,411 bytes of runnable pseudo-JavaScript from a 1,424-byte bytecode
artifact produced from 1,038 bytes of source.

The harness evaluates 16 fresh runtime cases. For every case it compares:

1. the original JavaScript;
2. the Bytenode `.jsc`;
3. the statically recovered `jscd --runtime` JavaScript.

All **16/16** cases match on both Linux and Windows.

This is functional static reconstruction, rather than byte-identical source recovery. The
generated program contains `jscd` runtime/intrinsic shims and reconstructed control/data flow.
That distinction does not rescue the candidate for the stated objective: the attacker receives a
runnable semantic clone without executing or instrumenting the protected artifact.

## Measured static attack cost

On the final run:

| Platform | jscd static decompile + verify | Probe names |
| --- | ---: | ---: |
| Ubuntu / Node 22.23.4 | 138.879 ms | 82 |
| Windows / Node 22.23.4 | 179.153 ms | 86 |

The read-only map is calibrated before the timed decompilation interval. Even if its cost were
charged to the attack, it is reusable per Node/V8 build and is not a secret tied to the protected
program.

## Process-level runtime cost

The performance arm uses a heavier workload of 256 values across 50,000 rounds and measures seven
fresh process executions per arm in alternating order.

Median wall-clock measurements:

| Platform | Original JS | Bytenode `.jsc` | Recovered JS | bytecode/original | recovered/original |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ubuntu | 72.521 ms | 79.162 ms | 72.584 ms | **1.0916x** | **1.0009x** |
| Windows | 92.247 ms | 100.543 ms | 94.217 ms | **1.0899x** | **1.0214x** |

For this fixture, source-free V8 bytecode comfortably satisfies the 2.5x runtime budget. The
recovered JavaScript also runs at essentially original speed.

These are process-wall measurements for one workload, not a universal performance proof.
Version-sensitive startup behavior, other source shapes, Electron, and larger applications would
need separate coverage before making general performance claims.

## Interpretation

This candidate is useful as a negative result because it separates performance from secrecy.

V8 bytecode can be a low-overhead packaging representation. On the tested current Node 22 build,
it does not create a strong static reconstruction barrier. A maintained public tool reconstructs
runnable behavior from the source-free artifact on Linux and Windows in under 0.2 seconds for this
fixture, and the bytecode itself leaks the descriptive function identifier.

The SNO threat model is even stronger than this static attack: the adversary also owns the
filesystem, Node runtime, and process memory. Therefore the successful static attack is sufficient
to reject plain Bytenode/V8 cached bytecode as a primary SNO protection backend. Dynamic runtime
attacks are additional exposure, not a prerequisite for the rejection.

## Consequence for the backend search

Do not treat conversion from JavaScript source to V8 cached bytecode as a security boundary or as
a fundamentally different answer to the public-reversible-representation problem.

A future V8-bytecode-derived design would need a separate security mechanism that survives:

- public current-version bytecode parsing and decompilation;
- raw serialized-name/string inspection;
- attacker-controlled Node runtime instrumentation;
- file copying and replay under the SNO threat model.

The near-native performance result may still make V8 bytecode useful as a transport or execution
format inside a stronger architecture. It should receive no secrecy credit by itself.

## Reproduction history

Several earlier manual runs intentionally remain negative development evidence:

- run 44472381981 stopped on raw original-function-name leakage;
- run 44472499076 showed that `jscd` parsed/decompiled the artifact but an unresolved Node 22
  read-only-heap name prevented execution;
- run 44472609233 used the target itself as an invalid `ro-map` probe and retained the same
  placeholder;
- run 44472884925 used a dedicated probe but discarded the name-to-address association by naming
  functions `p0`, `p1`, and so on;
- run 44473090931 fixed the upstream probe convention and achieved full Linux recovery while the
  Windows arm still exercised an invalid `.cmd` invocation path;
- run 44473477227 is the final green Linux + Windows reproduction.

Node's current child-process documentation states that Windows `.cmd` files require a shell,
`exec()`, or explicit `cmd.exe` invocation. The final harness uses `exec()` only for the
Windows npm shim and keeps direct `execFile()` execution on other platforms:
https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows

## Release impact

The repository remains release-blocked on the strong-protection objective.

This experiment rules out another apparently distinct low-overhead representation as a
standalone protection mechanism. It does not improve resistance to static reconstruction,
dynamic extraction, modification, or unauthorized execution. Its positive contribution is the
measured performance envelope: V8 cached bytecode is fast enough here, so any future revisit
should focus exclusively on an additional security mechanism rather than optimizing the bytecode
transport itself.
