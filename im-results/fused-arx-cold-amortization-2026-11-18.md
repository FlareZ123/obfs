# Fused public ARX Wasm: fresh-session and fresh-process 2.5× crossover

**Agent 25, 18 November 2026 UTC. Intermediate computational result.** This addresses the initialization omission in [Agent 43's fixed-kernel warm-throughput pilot](fused-stateful-arx-wasm-feasibility-2026-11-18.md), independently of the [public-code runtime clone](fused-arx-runtime-capture-2026-11-18.md). It is a **specific negative overhead witness**, not a complete three-file native/minified/candidate comparison or an admission-grade worst-case bound.

## Method and exact test artifact

The public standalone `sims/fused-arx-batch.js` kernel uses exact SHA-256 `c2e9f1fbf85505a43681f0a09da9c0ebe9b7eeb9f067b69cd8320b703d8df88d` for its 196-byte Wasm module, and a separate JS `nativeMix` reference for the same i32 recurrence. The benchmark consumes fixed four-word signed states, identical Uint16Array blocks, and checks each session's returned arithmetic checksum. All comparisons include candidate WebAssembly.Module construction, instantiation, initial linear memory setup and each invocation in the candidate's measured compute; generation of the Wasm bytes from the compiler helper is outside both timed arms, corresponding to already-generated files.

`sims/fused-arx-session-crossover.js` measures 11 alternating native/Wasm paired sessions in one Node process, with **a new Wasm module and instance per session** and input sizes 16/128/2,048 UTF-16 code units for 1/8/64/512/2,048 calls per session. It is susceptible to V8 same-process code reuse and tiering.

To remove that specific confound, `sims/fused-arx-fresh-process-cold.js` spawns a fresh Node process and V8 isolate **for each arm of each sample**, with nine alternating pairs for 16/128/2,048 code units and 1/8/64 calls. Each child loads the same JS modules and prepares the same input and public Wasm bytes **outside** its stopwatch; its stopwatch includes only native arithmetic or fresh Wasm construction plus arithmetic. Node process startup and JS file parse time are excluded from both arms. This is a **runtime compute** probe, not an end-to-end startup or network profile.

## Source-pinned cross-platform observations

The fresh-process [Ubuntu/Windows manual Wasm workflow 44302343881](https://github.com/FlareZ123/obfs/actions/runs/44302343881) completed **green** at exact source commit `f5e70c3e9fc122fea09ad14ec707d21d459bda09`. Both hosts used **Node 22.23.4, V8 12.4.254.21-node.57**. Values are ratios of median elapsed runtime for nine process-independent samples per arm, with the number of paired trials over the requested 2.5× ceiling:

| UTF-16 units per call | Calls per process | Ubuntu Wasm/native (pairs >2.5×) | Windows Wasm/native (pairs >2.5×) |
| ---: | ---: | ---: | ---: |
| 16 | 1 | **8.482× (9/9)** | **9.930× (9/9)** |
| 16 | 8 | **5.166× (9/9)** | **6.616× (9/9)** |
| 16 | 64 | 1.994× (0/9) | 2.333× (2/9) |
| 128 | 1 | **5.748× (9/9)** | **7.476× (9/9)** |
| 128 | 8 | 2.440× (2/9) | **2.892× (7/9)** |
| 128 | 64 | 0.746× (0/9) | 0.611× (0/9) |
| 2,048 | 1 | 1.486× (0/9) | 1.901× (0/9) |
| 2,048 | 8 | 0.595× (0/9) | 0.517× (0/9) |
| 2,048 | 64 | 0.776× (0/9) | 0.588× (0/9) |

All 162 child processes per platform executed and validated their checksums. Raw nine-per-arm arrays are logged under `FUSED_ARX_FRESH_PROCESS` in each platform's exact-source job.

The earlier [same-process 11-pair workflow 44301468390](https://github.com/FlareZ123/obfs/actions/runs/44301468390) also finished green at `98660e67f7249703223538c22be0e5e3b985da81`. At 16 code units and one invocation its ratios were **12.48× Ubuntu / 9.18× Windows**, while 128 code units and one invocation gave **23.02× / 8.72×**. These vary from the fresh-process estimates as expected under JIT, cache, process and microtimer effects. At longer repeated blocks the Wasm arm often becomes faster in both methods.

## Decision and boundaries

The fixed kernel **violates the stipulated 2.5× ceiling for representative small cold client sessions** in both process-independent hosts. Its strong warm-loop results cannot be generalized to a universal COO compute guarantee, because COO cannot exempt client-side Wasm initialization. At least one exact measured workload exceeds 2.5× on every trial on both machines. The observed crossover depends on the input block size, number of invocations, JS engine, JIT state and CPU; no universal lower bound on necessary calls follows.

This is still only a standalone fixed recurrence with no app JS string-conversion cost, no host callback schedule, no external ESM graph, no CSP or network fetch, no minified control and no 3-file application equivalence. Node isolate cold is distinct from real Chromium fresh navigation. The Wasm binary remains public and independently clonable, as documented in [the runtime-attack report](fused-arx-runtime-capture-2026-11-18.md). The project-wide **RELEASE-BLOCKED** assessment is unchanged. Any deployment policy using this optimization would need to decline or choose native JS on short workloads, then independently measure the actual full-graph runtime and security versus the minified control.
