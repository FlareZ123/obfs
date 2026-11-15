# Deterministic 40-bit local property-key collision and fail-closed repair

Date: 2026-11-15  
Researcher: Agent 2  
Reproduction: `test/property-hash-collision.test.js`  
Affected compiler path: `src/properties.js::renameLocalProperties`  
Repair: collision-free check before editing any candidate object

## Setup and construction

Before the repair, the local property renamer independently derived each new key as:

```js
const salt = sha256('collision-proof/entry.cjs');
const generated = '_p' + sha256(salt + '/state/12/' + originalKey).slice(0, 10);
```

The generated names contain only 40 bits of a hexadecimal digest. The main source filename, public seed, object binding name and object-literal offset determine the entire mapping.

The research script searched candidate property names of the form `f<integer>` and retained the first observed duplicate 40-bit hash prefix, using Python's `hashlib.sha256` on the corresponding UTF-8 strings. The collision was found after 2,018,181 candidate hashes in approximately 2.27 seconds in the initial local experiment. It is deterministic for the specified inputs.

| Original property name | Generated key |
|---|---|
| `f1846430` | `_p2b622f8ab7` |
| `f2018180` | `_p2b622f8ab7` |

Independent local recomputation confirmed that `sha256('collision-proof/entry.cjs')` produces `90906edc352ad58af572cea5eae7cf016a151d6971251d93470be39589d24045` and that both supplied property names map to the exact same 10-digit digest prefix.

## Regression case and predicted original behavior

```js
const state={f1846430:1,f2018180:2};
module.exports=[state.f1846430,state.f2018180];
```

For a file named `entry.cjs`, the object opening brace is at source offset 12. Requesting `obfuscateFiles` with `{mode:'sno',seed:'collision-proof',strings:false,identifiers:false}` before the patch generated two occurrences of the same object-literal key; the second overwrites the first. The original output is `[1,2]`; the pre-repair rename would produce `[2,2]`. This is a **semantic correctness violation**, since the renamer claimed both keys were private and safe.

The fix creates the complete mapping first and refuses to rewrite that object when `new Set(mapping.values()).size !== mapping.size`. This retains the original keys, and a noncolliding sibling still remains eligible for renaming. A corresponding conservative check was added for 48-bit cross-file generated names. A concrete cross-file collision was subsequently found and has a dedicated native-Node ESM graph test.

## Security and performance implications

This is a concrete demonstration that deterministic digest truncation needs explicit collision handling before syntax rewriting. Birthday collisions for a key family are more accessible than finding a collision of the underlying full SHA-256 digest. The previous mapping included no retry or uniqueness guard.

A conservative skip is cheap and preserves semantics, although it yields lower obfuscation on adversarially colliding objects. Deterministic names remain recoverable as opaque labels by an offline static observer; the repair does not confer cryptographic confidentiality or runtime tamper resistance.

The findings belong in `im-results/` pending broader collision/range benchmarks and real-world corpus evaluation.


## Concrete 48-bit cross-file collision

The cross-module compiler computes names with `sha256(`${seed}/${exporterName}/${exportName}/${originalKey}`).slice(0,12)`. For `seed='cross-collision'`, exporter path `state.mjs`, and export binding `state`, the distinct keys `p787915` and `p3853476` both produce `_p2c3f50efcbd4`. An optimized C++ search using OpenSSL SHA-256 found the match after 3,853,477 candidate hashes in approximately 2.22 seconds on the local runtime; the two SHA-256 prefix values were independently recomputed using Python hashlib.

Before the 48-bit collision check, the source below would merge both keys and change output from `13,29` to `29,29`. The guard preserves the object unchanged when either generated name repeats. `test/cross-file-hash-collision.test.js` runs both the original and obfuscated files under a native Node ESM loader with a negative collision case and a positive noncolliding case.

```js
// state.mjs
export const state={p787915:13,p3853476:29};
// main.mjs
import {state} from './state.mjs';
console.log([state.p787915,state.p3853476].join(','));
```

The example reinforces that even a 48-bit truncated digest requires collision rejection for correctness.
