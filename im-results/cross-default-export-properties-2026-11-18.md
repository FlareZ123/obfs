# Anonymous default-export object property proof

**Agent:** Agent 38  
**Date:** 18 November 2026  
**Classification:** intermediate compiler-semantics and positive-yield evidence. This does not establish strong obfuscation security.

## Gap

The closed-world ESM property pass could prove named exported literal-record owners, but a direct anonymous default owner such as

```js
export default {secretField: 41};
```

had no local binding for the cross-file owner pass to claim. Direct importers therefore retained stable field spellings even when every relevant use was already within the existing `proveLocalObject` grammar.

## Implemented proof

At validated source `782e3fe037f59193b80a9cd4a0db68700a0981d4`, `src/cross-properties.js` admits exactly one anonymous default owner when its value is either:

- an object literal with ordinary, unique, literal-valued own fields; or
- an object literal returned by the existing `singleUseFactoryObject` proof, covering pure zero-argument IIFEs and private single-use zero-argument factories.

Every direct default-import alias is then checked by the existing local ownership proof. The lane reuses its alias, immutable identity, member, destructuring, `in` operator, reflection, escape, source-observation and opaque-consumer checks rather than defining a weaker consumer grammar.

Computed string keys are admitted only under the repository's existing immutable-string evidence. A key exported by the owner module must be initialized before the default-export statement. That ordering matters for cyclic ESM initialization. Verified immutable keys from another module are accepted only when the static import graph is acyclic.

The owner module's field keys and every proved consumer key are rewritten to the same deterministic hash-derived spelling. This adds no runtime decoder or per-access wrapper.

## Conservative boundaries

The lane declines:

- namespace imports of the owner module;
- source reexports from the owner module;
- owner shape observations such as `Object.keys`;
- opaque imported consumers;
- effectful or otherwise unproved factories;
- unsafe field forms, duplicate names and reserved prototype-sensitive names;
- same-producer computed keys initialized after the default owner.

An attempted relaxation for source reexports was tested and retired. ECMAScript plain export-star excludes the default binding, but the repository's broader cross-file closure policy intentionally treats source-reexport graphs as outside this owner's proof envelope. A focused experiment that expected positive rewrites through plain and unrelated named source reexports observed zero rewrites. The final implementation preserves the conservative graph policy.

A fixture that exported a primitive expression derived from the owner in each direct importer also received zero rewrites. That exported-result context remains outside the bounded positive grammar. The positive multi-importer control instead keeps each owner use inside a directly proved local read.

## Executable evidence

`test/cross-default-export-properties.test.js` contains 14 real Node ESM differential tests. Positive cases exercise:

- direct anonymous default object literals;
- `import {default as local}`;
- multiple direct importers;
- local alias plus imported pure-identity forwarding;
- an earlier same-module immutable key;
- an immutable key imported from another acyclic module;
- a pure anonymous IIFE object factory;
- a pure private single-use named factory.

Negative cases exercise namespace access, source default reexport, own-key reflection, opaque imported consumption, a later same-module key and an effectful factory.

The focused cross-file gate [44420377288](https://github.com/FlareZ123/obfs/actions/runs/44420377288) completed successfully on Ubuntu and Windows at the exact source above, including the cross-file behavioral tests and both strict JSDoc checks. The broader [manual validation 44420384051](https://github.com/FlareZ123/obfs/actions/runs/44420384051) also completed successfully on Ubuntu and Windows at the same source. Ubuntu completed the workflow's prescribed real Chromium checks.

The validated source was merged through PR #153 as `ad2393e976f64ac81c4dceaac70b7ffdc51e0db5`. The merge preserved concurrent Agent 5 coordination commits.

## Security and performance interpretation

This closes a concrete protected-work yield gap for a common ESM ownership form while retaining the existing semantic refusal boundary. It removes stable source field spellings from eligible producer and consumer files.

The transformation itself adds no runtime operations, but no universal 2.5x conclusion follows from that observation. Whole-program parsing, startup and unrelated transforms still require workload-specific measurement.

A full-control COO attacker still receives the rewritten files and can instrument execution or normalize hashed keys. This work supplies compiler correctness and additional static readability resistance on eligible graphs. It does not establish source secrecy, hostile-runtime tamper resistance, environment authorization or a comparative attacker-cost advantage over ordinary minification.
