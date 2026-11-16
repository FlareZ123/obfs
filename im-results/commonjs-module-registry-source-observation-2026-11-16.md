# Native CommonJS module-registry source-byte observation

**Status:** Intermediate semantic-safety evidence. **Date:** 2026-11-16.
**Agent:** 40. **Candidate source:** `0fc93c7757e132c3583e3034fd37c39c69ee252b`.

## Failure mechanism

Node's documented `require.cache` and `require.main` provide references
to the current and main CommonJS `Module` objects. Native `Module`
instances also expose parent/child relationships. In Node 22, the associated
constructor exposes an internal `_load` function, so a program can obtain
`node:fs` without an ordinary `require('node:fs')`, a static import, or
the previously handled `module.constructor` spelling. The original AST
source-byte preflight looked for several explicit loader methods but did
not recognize all those module-registry routes. This made unsafe source-byte
rewriting possible when a program independently compared its own file to an
exact property spelling.

Example tested in a real CommonJS child process:

```js
const io = require.cache[__filename].constructor._load('node:fs');
const privateObject = {secretField: 31};
const source = io.readFileSync(__filename, 'utf8');
console.log(privateObject.secretField, source.includes('secretField'));
```

The native output is `31 true`. Code that renames the own field or eagerly
encodes the comparison literal can change the source-byte observation even
when the value computation stays 31. The loader route is **not a way to hide
code from an attacker controlling SNO's runtime**. It is a semantic hazard
for the transformer's claimed byte-for-byte source-observer compatibility.

## Implemented mitigation

`src/ast.js::observesDistributedSource` now conservatively tracks simple
aliases of the `require`, `module`, and `process` CommonJS roots.
It declines transformations when the AST may read:

- `require.cache`, `require.main`, or `require.extensions`;
- `module.parent`, `module.children`, or `module.constructor`;
- `process.mainModule`;
- the corresponding reflective `Reflect.get` /
  `Object.getOwnPropertyDescriptor` access, or loader-root enumeration
  through `Object.getOwnPropertyDescriptors`, `Object.keys`,
  `Object.values`, `Object.entries`, or `Reflect.ownKeys`.

For computed unknown keys, this is intentionally conservative. `module.exports`
does not itself trigger the new refusal. Aliases are monotone overassignments,
so conflicting values can only increase refusals.

## Reproduction and bounded evidence

`test/module-registry-source-reader.test.js` uses independent real
Node child processes and fresh temporary directories. Nine variants
read their own file through alternate direct, aliased, and reflected
registry paths; a tenth case uses a `module.parent` reference in a child
module. Every fixture asserts the native observed value, the source
scanner's classification, exact compiler output preservation in COO or
SNO, and a native-versus-output differential. A separate positive
control checks that an unrelated CommonJS object remains eligible for
private-field renaming.

The same nine registry expressions were executed locally under Node
22.16.0 before the compiler change and each successfully read the file
with a `true` source-spelling check. This local check establishes native
route feasibility, not pre-patch obfuscator failure rates.

The [pinned full validation 43814630774](https://github.com/FlareZ123/obfs/actions/runs/43814630774)
**passed** at source `0fc93c7757e132c3583e3034fd37c39c69ee252b`.
The Node 22 suites recorded **1,415 passes / one skip / zero failures**
on Ubuntu and **1,414 passes / two skips / zero failures** on Windows,
out of 1,416 tests per OS. Both strict JSDoc suites, all sampled benchmarks,
and **15 real Ubuntu Chromium fixtures** passed. This is end-to-end regression
coverage for the pinned source, not proof of general JavaScript equivalence.

## Interpretation

This is a correctness fix that intentionally sacrifices transformation
coverage for source-observable code. The refusal itself provides no
confidentiality, integrity enforcement, host authorization, or 2.5×
performance guarantee for arbitrary programs. Other loader aliases,
native bindings, indirect function calls, custom file readers, and
unrecognized source observations still require validation. Under SNO's
full-control threat model, an attacker can inspect and change the
obfuscated files and Node runtime regardless of this guard.

Node's public `require.cache` documentation:
https://nodejs.org/download/release/latest-jod/docs/api/modules.html#requirecache
