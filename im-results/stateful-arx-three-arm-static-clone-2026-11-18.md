# Stateful three-file ARX application: byte-frozen Wasm candidate, equal-trust control, source-only clone

**Agent 47, 18 November 2026 UTC. Status: intermediate negative security decision with bounded positive runtime measurements.** This document describes an implemented COO candidate at a known frozen native graph, not a candidate for release. It implements the first full-application instance of the [batch-Wasm charter](../workplace/batched-wasm-stateful-arx-candidate-charter-2026-11-18.md) and explicitly rejects promotion on demonstrated functional code lifting.

## Frozen application and artifacts

The native source graph is [kernel/state/entry](../examples/stateful-arx-app/native/), using four mutable Uint32 state words, a global UTF-16 code-unit serial index, a genuinely nonlinear ARX transition and a per-record external host callback. Four input seeds (0, -1, 2147483647 and -2147483648) and 12,288 deterministic records per seed include surrogate and coercion cases. The reference, control and candidate each process **448,188 code-unit transitions** in the full four-seed comparison and emit exactly **49,152 host events**. The native source digests at the experiment pin are:

| File | SHA-256 |
| --- | --- |
| kernel.mjs | 55fa95837cd592b732926c823742a78c064b1018b0be42c9b9e1ba8419706d0f |
| state.mjs | 1507ee5f3f35d02746c9fb9ecb22ee34dd5adefb50c64cc80e43d302a33a79b7 |
| entry.mjs | 0934b29f296d901b638cd77b6e1449c34a111912cfd75156ffd501626abf063d |

The ordinary control is an actual checked-in [841-byte minified ESM file](../examples/stateful-arx-app/minified/entry.mjs), emitted with **esbuild 0.28.2**, bundled ESM, target ES2022, minify enabled, no source map. Its SHA-256 is **aba8e80d8b22452d70004417b04c6859acf7c61bfb7b5022662878a5422eafed**. The lockfile digest was **d001e958a211f4864428a7f740f14dcca438f2c06e80be9b903f36c227a8ead7**. The exact source text came from the source-pinned two-OS [workflow 44335852943](https://github.com/FlareZ123/obfs/actions/runs/44335852943). The current [baseline regression](../test/stateful-arx-minifier-control.test.js) recomputes the same esbuild bytes and fails if even one byte differs from the frozen checked-in control.

The experiment's [Wasm candidate](../examples/stateful-arx-app/wasm/) is a real three-file ESM application, with a fixed, eager-compiled, fully public **228-byte WebAssembly binary** in its kernel wrapper. SHA-256 **820810c29949179df5e2cc2d7246b15efe1267fe898390703fc77e3df4f9a96f**. [A fixed-source lowerer](../sims/stateful-arx-wasm-build.js) generates that exact binary from declared seven-i32 inputs: four prior state words, UTF-16 buffer pointer, buffer length and global serial start. A single Wasm call handles one full record. Input and output use public linear memory; the unchanged state/entry contract emits one original-order host callback per record. The [binary artifact regression](../test/stateful-arx-wasm-artifact.test.js) compares exact generated and distributed bytes and calls the native engine's binary validator. The lowerer admits the known pure transition only; this is **not a general, source-analysis-backed JS-to-Wasm compiler**. It does not provide domain locking, trusted integrity enforcement or nondisclosed keys.

## Full-application differential and independent static reconstruction

The [three-arm differential](../sims/stateful-arx-minifier-control.js) compares original, ordinary minified control and emitted Wasm application. Outputs, final state and externally observed callback JSON are byte-identical for all 49,152 per-arm events in the four-seed held-out corpus.

The [source-only attacker](../sims/stateful-arx-static-clone.js) reads the literal shipped Wasm hex from the **published** kernel ESM. It statically decodes 95 instructions including blocks, loops, branch depths, memory accesses, arithmetic and rotates through [an independent JS opcode interpreter](../sims/fused-arx-static-lift.js). It reconstructs the public client state and callback contract, then runs the full application without executing any WebAssembly instruction. The [regression](../test/stateful-arx-static-clone.test.js) disables the global WebAssembly object during the complete clone, compares identical JSON and host-callback sequences across all 49,152 events, and checks the exact public binary hash. The source-pinned [Ubuntu/Windows workflow 44333723917](https://github.com/FlareZ123/obfs/actions/runs/44333723917) at commit **2d61b2595783de50398813c2289835c99d33ec18** passed this reconstruction and its strict-JSDoc gate; it predates the subsequently frozen ordinary ESM file.

**Attack conclusion:** public WebAssembly instructions in this fixed application do not prevent standalone functional reconstruction. The source-only clone does not recover native comments or original variable spellings. It was built with knowledge of the candidate ABI and is unblinded. There is no measured human/agent attacker-time comparison to the same-trust minifier, so the study does **not** support a quantified source-recovery disadvantage or advantage. It does provide a reproducible failure of executable confidentiality against a static-lift attacker for this concrete application. No evidence here supports bypassing independent server-controlled authorization or cryptographic integrity, because this candidate has neither.

## Real CPU and cold-start evidence (Node 22, Windows and Ubuntu)

Two-OS [workflow 44335713885](https://github.com/FlareZ123/obfs/actions/runs/44335713885) at commit **12de9f66994a7314e5d417c73f40ffcd13c53b74** ran the source-coincident [fresh-process comparison](../sims/stateful-arx-three-way-cold.js) and [warmed session comparison](../sims/stateful-arx-three-way-warm.js). All source outputs and callback counts matched across arms; exactly the same inputs and source-level output contract were timed. Results below are **median Wasm/native paired ratios**, rounded for display:

| Records/session | Ubuntu cold real-clock import + first session | Windows cold real-clock import + first session | Ubuntu warmed whole-session CPU | Windows warmed whole-session CPU |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1.1174× | 1.1197× | 1.0277× | 1.0872× |
| 50 | 1.0501× | 1.0275× | 1.0464× | 1.0000× |
| 1,000 | 0.9482× | 0.9450× | 1.0363× | 1.0000× |
| 10,000 | 1.1687× | 1.0534× | 1.0372× | 1.2381× |

The cold measurement executes each arm in a **distinct Node process** and clocks ESM import plus first actual session using \`process.hrtime.bigint\`; Node executable startup is excluded for all arms. Seven paired independent processes were sampled at each size. The separate repeatedly invoked CPU measurement runs 50,000/600/50/5 sessions per process respectively to exceed Windows timer quantization. The warm whole-application test uses 50,000/600/30/3 repeated sessions per size, 9 alternating balanced pairs on each OS. Every timed iteration returns and constructs the actual JSON output and host callback contract.

In these specific finite tests, no recorded Wasm/native cold-wall, repeated-CPU or warm-CPU pair exceeded the strict 2.5× cap on either platform. Raw per-pair arrays and the minified/native arm are in the pinned workflow logs. An earlier unamplified Windows process-CPU pilot produced zero-length samples, \`NaN\` and \`Infinity\` ratios; **those measurements are invalid and excluded**. A revised, source-pinned run addressed that clock-resolution error rather than interpreting zero denominators as security or performance failures.

These measurements support **bounded Node performance feasibility** only. They exclude true Chrome first-use graph CPU; the other repository Chromium test exercises the distinct, prior 196-byte standalone kernel. They also exclude unbounded host input sizes, reactive property getters, debugger hooks, hostile WebAssembly implementations and real multi-origin deployment. Any strict budget breach in future workloads remains a workload-specific veto.

## Selection and next gate

The three-file candidate reached exact native semantics in the declared corpus and measured the required Node workloads without an observed runtime-budget violation. **It is rejected as an established security improvement over minification** because a known fixed-layout attacker recovered the full application without WebAssembly. This attack measures functional code lifting, separate from complete readable source recovery. In addition, the charter's blinded equal-effort static attacker comparison, independent dynamic attacker on this full graph, actual cold Chrome timings and source-coincident transformed CPU attribution remain uncompleted.

The published overall **RELEASE-BLOCKED** verdict in [results/README.md](../results/README.md) is unchanged. Further cosmetic reshuffling of this same public layout has no demonstrated reason to reverse the negative result. A new candidate should identify a distinct independently enforceable trust boundary or pass a genuinely different preregistered attack-resistance test before expensive broader promotion.
