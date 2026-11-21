# Opaque CommonJS require resolution preserves parity at a coverage cost

**21 November 2026, Agent 3. Intermediate research and test-only evidence.** The finding is a measured **conservative optimization shortfall**, with **no observed native/emitted behavioral mismatch** in the studied graph. It is not a new strong-obfuscation result.

## Trial design

The four-module CommonJS graph executes `mutator.cjs` before `target.cjs`, which exports a 2,049-character literal. The mutator resolves a factory through one of two statically opaque Node `require` expressions:

```js
const candidate=['./factory.cjs'];
const {make}=require(candidate[0]);
// Alternative:
const {make}=require(require.resolve('./factory.cjs'));
```

The factory exports `module.exports.make=()=>({ref:{get(){return String.prototype}}})`. The mutator installs this descriptor with native `Object.create` or `Object.defineProperties` and overwrites `box.ref.charCodeAt`. The matched harmless control returns `Number.prototype` instead and changes an unrelated property.

The 16-case test-only matrix `test/decoder-dynamic-require-descriptor.test.js` crosses two dynamic resolution forms × two native sinks × COO/SNO × harmful String vs harmless Number. Each case executes native and emitted CommonJS in isolated Node processes and checks exit status, stdout, stderr and `target.metrics.literals`.

## Source-pinned result

[Full Ubuntu/Windows manual run 44939183717](https://github.com/FlareZ123/obfs/actions/runs/44939183717), immutable source `11bba50e136904ab15c5856fd0d74b32c05734ad`:

| OS | Node tests | Pass | Fail | Skipped | New-case breakdown |
| --- | ---: | ---: | ---: | ---: | --- |
| Ubuntu 22 | 4,126 | 4,117 | 8 | 1 | Eight **Number positive-yield expectations** only |
| Windows 22 | 4,126 | 4,113 | 8 | 5 | The **same** eight Number positive-yield expectations |

**All 16 native/emitted process outcomes matched.** Every harmful-String case was conservatively left untransformed and passed; no String decoding corruption was observed. Every harmless-Number case also left the long literal untransformed, violating the test's explicit positive transformation yield criterion (`1` expected versus `0` observed), but still preserving native behavior exactly.

Dynamic CommonJS source loading is intentionally outside the established static module-edge proof. The [closed-world property proof contract](../docs/CLOSED_WORLD_PROPERTY_PROOF.md) explicitly treats unresolved module consumers and imported values as opaque. These observations support retaining the conservative refusal as **correct** until a narrow interprocedural/module-resolution proof can recover demonstrably safe Number positives without admitting harmful String getter exports.

The unmodified, source-pinned red branch `agent3/dynamic-require-descriptor-20261121` remains available for future **coverage** optimization research. It was intentionally not copied into draft [PR #217](https://github.com/FlareZ123/obfs/pull/217), because requiring positive yield on unresolved imports is not presently justified by the proof contract. No security-performance or 2.5× claim follows from these cases.
