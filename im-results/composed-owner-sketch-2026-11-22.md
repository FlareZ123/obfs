# Multi-hop ESM owner transport and observable-key sketches

22 November 2026. **Intermediate differential compatibility evidence.**
Additional source-pinned regression corpus, no evidence of increased
source secrecy, anti-debug resilience or a stronger security-cost tradeoff.

## Design

The deterministic generator in
test/opaque-owner-compositional-sketch.test.js uses PRNG seed
0x05b52026 to create 64 independent ESM graphs. Each graph exports
a two-field owner, forwards it through 1 to 3 separately imported
asynchronous ESM relays and observes its key spelling or serialized
shape. Twelve grammars include identity returns, arrays/records,
Map, Set, Promise, WeakRef, Proxy, rest parameters, generators,
getters and Reflect.apply. Eight observer grammars include
Object.keys, Reflect.ownKeys, JSON, spread serialization,
Object.entries, own-property-name inspection, Object.assign,
and structuredClone.

The deterministic 64 include **42 multi-hop graphs** by explicit
assertion. They are a seeded sample, not the complete transport/observer
Cartesian product. Original and generated main.mjs programs run in
isolated Node ESM subprocesses with locked atomic source writes and
exact status/signal/stdout/stderr parity checks. All 64 exposed-owner
graphs require zero private property rewrites.

## Harness red, corrected exception behavior, focused green

Initial [two-platform run 45028424213](https://github.com/FlareZ123/obfs/actions/runs/45028424213)
at source 88f015f718a23d52b328af46e56c85faf0ac5812
failed on Ubuntu case 22 because the **native, unobfuscated**
program passed a Proxy to structuredClone and raised
DOMException [DataCloneError]. The original harness required
every native case terminate with status zero. This was a harness
admission error, not a demonstrated compiler miscompile.

The revised graph catches exceptions at the observation boundary
and prints name/message, comparing the full original/generated
process transcript. The Proxy-cloning case remains in scope and
its observable exception is checked.

The corrected focused
[Ubuntu/Windows run 45028484850](https://github.com/FlareZ123/obfs/actions/runs/45028484850)
passed both Node 22 jobs and project/external JSDoc at exact
source c78d768a0d57e6052fab62a0b887aeaf81dfee37.
Ubuntu recorded COMPOSED_OWNER_SKETCH with seed=0x5b52026,
cases=64, observations=8, transportGrammars=12, multiHop=42,
refused=64. The test process took 4,448.40 ms; this is harness
wall time, not protected-work CPU.

## Limits

All 64 composed owners were conservatively declined: evidence of
finite semantic-safety behavior, not a protection gain. The separate
[56-graph matrix](cross-file-opaque-api-parity-2026-11-22.md)
has 16 genuinely positive rewrites in a proved source family.
Do not combine that count into this 64-graph population.

This grammar is informed by the
[OBsmith test-design reference](../resources/obfuscator-testing-and-deobfuscation-benchmarks-2026-11-22.md).
Higher-value next work targets interacting features that change compiler
output, source-only independent attacker reconstruction against an
equal-trust esbuild control, and strict 2.5x application compute.
More zero-rewrite pass counts alone cannot establish secrecy.
