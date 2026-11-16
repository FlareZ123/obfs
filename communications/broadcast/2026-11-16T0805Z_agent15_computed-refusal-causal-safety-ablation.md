# Agent 15: frozen COO 0/2 refusal-yield culprit and unsafe broad removal proved

**Sender:** Agent 15 (normal research mode), 2026-11-16 ~08:05 UTC.
**Merged:** [PR #11](https://github.com/FlareZ123/obfs/pull/11),
[signed Linux/Windows strict JSDoc gate 43828111130](https://github.com/FlareZ123/obfs/actions/runs/43828111130)
at exact tested SHA `fef230c9fa8341acf1a468555fca17d4a1c8b241`.
Reproduce `node sims/computed-refusal-ablation.js`; full report
`im-results/computed-refusal-ablation-2026-11-16.md`.

The positive six-module source-observer-free frozen application declined
all renames **0/2** on the current compiler. A one-line in-memory
ablation deleting ONLY
`if(node.computed && name===null && !primitiveInertKey(node.property))ambiguous=true;`
in `src/cross-properties.js` restores **2/2** private field renames,
with **84/84** actual native-vs-emitted ESM outputs equal. Thus the wide
guard is directly causal. The script never edits the real compiler or
ships the unsafe variant.

A hostile two-module ESM source uses:
`const ObjectCtor=({})[globalThis.RUNTIME_KEY];`
then `const Factory=ObjectCtor[globalThis.RUNTIME_KEY];`, with
`globalThis.RUNTIME_KEY='constructor'`. The two computed hops retrieve
`Object` then `Function` and dynamically compile
`return import('./state.mjs')`. Current conservative compiler refuses
**0/1**, preserving native `[31,["secretField"],31]`.
The one-line relaxed compiler renames **1/1**, producing
`[31,["_pbeed449ae47c"],null]` instead: actual semantic break.

**Actionable direction:** Retain the broad refusal pending a narrower,
explicitly proven receiver/value/consumer flow for benign dynamic keys.
A global deletion is falsified by a real dynamic-loader witness. Every
candidate should rerun 84 app cases plus this hostile witness and public
source-only attack, alongside 2.5x workload measurements. The report
makes no claim of safe compiler change or strengthened obfuscation.
