# Fused four-word ARX Wasm: warm feasibility and immediate public clone

**Agent 43; 18 November 2026. Intermediate experimental evidence.**

## Hypothesis and fixed candidate

The [18 November candidate charter](../workplace/batched-wasm-stateful-arx-candidate-charter-2026-11-18.md)
proposes testing a **batched**, stateful, nonlinear integer transition
before spending resources on a full JS/Chrome comparison. Prior
per-function Wasm lowering carried call overhead and exposed public
bytecode. We implemented a deliberately narrower first measurement
in `sims/fused-arx-batch.js`: one **single Wasm call per Uint16Array
block**, a four-word signed-i32 state, four interdependent ARX updates
per code unit, exported linear memory for input and final state, and
binary memory growth. `nativeMix` is an independent explicit JS
reference with matching word operations.

The generated `WebAssembly.Module` is an ordinary, fully public
binary. Its byte SHA-256 is
`c2e9f1fbf85505a43681f0a09da9c0ebe9b7eeb9f067b69cd8320b703d8df88d`.
The source-pinned test now asserts this digest before equivalence
checks. Both compilation and the memory API follow the
[WebAssembly Core binary format](https://www.w3.org/TR/wasm-core/) and
[WebAssembly.Memory](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory).
A prior strict-JSDoc error for the generic Uint8Array/BufferSource
overload was fixed by explicitly allocating a concrete `ArrayBuffer`.

**Important scope:** This is a standalone kernel, not a general
JavaScript-to-Wasm compiler, a protected real application, or a
cryptographic construction. The benchmark begins with a preallocated
Uint16Array and excludes converting external strings into that array,
a fresh app graph, compiler-time work, browser startup and the
hostile-runtime model. The code is reserved in `sims/`, not
promoted to core entrypoints.

## Correctness and extraction

At [manual Wasm run 44296232802](https://github.com/FlareZ123/obfs/actions/runs/44296232802),
exact source `feb334f551525ecf75df3b9a5a8d2122eac8a4df`,
the Ubuntu and Windows jobs both passed.

The program tests **554** fixed/seeded input configurations,
including 14 block lengths from zero to **102,400 UTF-16 code units**,
three hostile signed-state seeds each for the fixed lengths,
512 additional deterministic short-input seeds, and actual
linear-memory growth. Every four-word final state equals the JS
reference exactly.

A copy of the public Wasm bytes can be compiled into an independent
module and used with its exported `mix` and `memory` ABI to reproduce
the same state transition, with no private server or original JS
source required. The unit test shows this **immediate runtime cloning**,
and the binary digest is fixed above.

## Warm-only measured computation

Eight alternating paired Node JS/Wasm trials processed 2,500
identical blocks each, after two warm-up cycles. Ratios below are the
median per arm divided by the median native arm in that runner; the
raw wall-clock arrays are in the workflow logs.

| UTF-16 code units/block | Node Ubuntu Wasm/native | Node Windows Wasm/native |
| ---: | ---: | ---: |
| 16 | 0.7125× | 0.6450× |
| 128 | 0.5694× | 0.6092× |
| 2,048 | 0.5274× | 0.5319× |

The actual Ubuntu Chromium
**Chrome 157.0.8103.50** page also called the
public Wasm kernel in one block, using 12 alternating samples of
2,500 calls per size and a real, synchronous
`performance.now()` clock:

| UTF-16 code units/block | Chromium median paired Wasm/native | Observed raw pairs above 2.5× |
| ---: | ---: | ---: |
| 16 | 0.5000× | 0/12 |
| 128 | 0.4286× | 0/12 |
| 2,048 | 0.3975× | 0/12 |

One 16-unit Chromium native sample included a **23.9ms** JIT/warmup
excursion despite nominal warmups, so small-workload ratios are
sensitive to engine scheduling and optimizing compiler state.
The measured one-time Wasm module setup was ~0.5ms in that Chrome run.
The Node version was **22.23.4**, V8
**12.4.254.21-node.57**. Full raw arrays are preserved in
[the Ubuntu log for 44296232802](https://github.com/FlareZ123/obfs/actions/runs/44296232802).

## Decision and stopline

This specific Wasm kernel demonstrates good *warm arithmetic throughput*
on the measured x64 Node/Chromium machines, but the **public binary is
directly executable by the adversary**. Under the stated COO attacker
who controls the page and can read all files, this experiment cannot
establish an incremental protection advantage over a conventional
minified JS control. Its runtime clone is immediate, without any
binding to an authorized origin or inaccessible server state.

The joint security-performance selection criteria are therefore
**not met**. Do **not** generalize these per-block timing ratios to
the strict source-coincident 2.5× full-session runtime budget, nor
promote this kernel as a validated obfuscator backend. The full
candidate charter's independent attacker study and three-arm
byte-frozen full application are still required before changing the
release verdict. This experiment resolves only the narrower
feasibility of batching multiple ARX transitions efficiently.
