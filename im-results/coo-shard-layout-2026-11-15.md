# Experimental public multi-file COO string sharding

Researcher: Agent 31. Date: 2026-11-15. **Status: prototype, intermediate evidence**.

## Hypothesis and implemented technique

`workplace/coo-shard-strings.js` lowers explicitly selected top-level
ESM `const` string literal initializers to imports from a generated ESM
decoder. Encoded UTF-16 code units and 16-bit masks reside in two separate
public ESM modules. A SHA-256-seeded coprime affine permutation redistributes
each code unit within the flattened set, and a fixed position-dependent
16-bit mask adds a second reversible layer. The seed affects the generated
layout and is **not secret**. The decoder is third module, so the output is
four files including the transformed original.

The real checked-in [before/after pair](../examples/coo-shards/README.md)
exercises a 31-code-unit, two-export example. The checked-in builder
reproduces the emitted files byte for byte using seed
`agent31-coo-sample-v1`. The opt-in transform leaves other declarations
untouched. This supplies a concrete multi-file method within the COO
architecture envisaged by the primary objective.

## Scope and falsifiable boundaries

- Input is exactly one `.mjs` module with explicitly named, nonempty
  top-level `const` string literals. It accepts multiple such literals.
- The compiler refuses known syntactic function-source observers within
  its input and malformed source paths.
- It does not prove a whole-world module graph, filename collisions,
  integrity of `String.fromCharCode`, or absence of imported-side-effect
  observations. Unsupported named initializers are left unchanged.
- Compilation creates no runtime network service. All resulting code,
  encoded data, masks, and decoder arithmetic are available to a COO attacker.

## Evidence and security finding

`test/coo-shard-strings.test.js` compares native and transformed ESM
exports in independent Node module roots, including isolated surrogate
code units, NUL, and Unicode, and tests deterministic seed changes and
conservative refusals. It also implements a source-only attacker that
reads the three emitted module texts as data, recovers the XOR/permutation,
and reconstructs the selected strings **without running the generated code
or knowing the build seed**. This is an explicit negative security control.

This technique complicates single-file source inspection but provides
no demonstrated resistance to the stated attacker, who obtains all files.
It adds no verifiable authorization or tamper resistance. It should remain
experimental pending independent browser tests, cold/hot runtime measurements,
and a meaningful reconstruction-resistance improvement beyond layout changes.

Cross-platform CI and precise benchmark evidence should be appended here
only when a pinned successful run has been observed.

## Pinned Linux/Windows verification and runtime cost

The focused, manually dispatched [run 43723084489](https://github.com/FlareZ123/obfs/actions/runs/43723084489) passed five semantic and offline-recovery tests, committed example regeneration, and strict JSDoc on Ubuntu and Windows, pinned at `e4312d8f4eee9f2ce1987e4e06bc2bd60b2e034f`.

The later [run 43723669443](https://github.com/FlareZ123/obfs/actions/runs/43723669443) passed the **same checks plus a paired cost profile** on both systems at exact commit `a4e7701cc88325d34c6a49010ed05b75a95dffb4`. Reproduce using `node sims/coo-shard-profile.js` after installing dependencies. The profile independently loads 40 new original and sharded ESM graphs from prepared files, alternating order, and then calls the already-loaded `get()` 750,000 times per sample across 16 alternating paired trials after warmup.

| Node.js 22 runner | Original graph-load median | Sharded graph-load median | Graph-load ratio | Original hot median | Sharded hot median | Hot ratio |
|---|---:|---:|---:|---:|---:|---:|
| Ubuntu | 0.227147 ms | 0.819372 ms | **3.6072×** | 7.559583 ms | 7.585762 ms | **1.0035×** |
| Windows | 0.612300 ms | 2.321200 ms | **3.7910×** | 7.564000 ms | 7.528400 ms | **0.9953×** |

The output grew from 145 bytes to 1,079 bytes (**7.441×**) for two constants spanning 31 UTF-16 code units. The **hot access** matches the native function, but the tested **graph loading** exceeds 2.5× on both operating systems. Graph-load time includes filesystem, ESM parsing, module graph resolution and caches, and is wall time rather than isolated compute. The experiment does not claim a 2.5× COO initialization/whole-program runtime guarantee. Because COO has no initialization deduction, deployment needs a workload-based complete budget check; this short module graph is a negative launch-cost witness.

The source-only attacker recovered **2/2 protected strings**, so the technique provides layout diversification without demonstrated code secrecy. This is a useful completed baseline for comparing a future fused, lazy, or fewer-module layout and should stay outside the production COO default.
