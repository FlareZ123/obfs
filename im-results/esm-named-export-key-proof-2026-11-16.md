# Source-observer and owner-key proof for named ESM exports (2026-11-16)

**Status:** intermediate semantic compatibility and positive transformation-coverage work. There is no new demonstrated deobfuscation, modification, or authorized-online-relay resistance.

## Motivating mismatch

The SCO publication handler computed `collectVerifiedImportedStrings(normalized)` when `closedWorld:true`, passed the verified imported string names into `observesDistributedSource`, and failed to supply the same evidence to `observesFunctionSource`. For a three-file ESM group where `key.mjs` exports `"value"` and `entry.mjs` performs `Reflect.get({value:9},lookupKey)`, the unresolved source scanner conservatively classified the safe key as a possible Function#toString reader. The resulting group-wide refusal left a separately proven private field in `state.mjs` untransformed.

The SCO correction passes `importedKeyProof.get(file.path)` into the second scanner as well. The source-observation classification now agrees with the existing full-group COO scanner. An imported immutable `"toString"` or unknown/mutable key still triggers refusal, preserving exact source spelling for the tested exported function.

## Named export forms and initialization safety

The shared `collectVerifiedImportedStrings` proof now accepts a uniquely bound, top-level immutable primitive string exported through an ESM named specifier:

```js
// key.mjs
const internalKey = 'secretField';
export {internalKey as publicKey};

// main.mjs
import {publicKey} from './key.mjs';
```

It resolves exact declared relative ESM import edges and the actual exported public name. A `let` binding, a shadowed name, an indirect expression without a static string, and an unreconciled reexport remain unproved.

For private owned objects, `renameCrossFileProperties` has a separate stricter requirement: an imported key from the **same module as the owner** must be initialized before that owner, even if a cyclic importer calls back into the exporter before module evaluation finishes. The `earlierKeyExports` proof now resolves top-level `const` declarations and named export aliases, comparing the initializer position against the exported owner declaration. The placement of `export {internalKey as publicKey}` itself has no runtime initialization effect. This permits earlier initialized keys without allowing later-key TDZ reads to be replaced by literal property accesses.

All changes remain bounded by the existing closed-world assumption, unique lexical-binding check, explicit own-key ownership proof, reflective-use guard, and canonical import resolution. The syntax checker cannot certify arbitrary dynamic module loaders, ambient monkey patches, or external source observers.

### Specification basis

The [ECMAScript 2026 specification, §16.2.3.7](https://tc39.es/ecma262/2026/multipage/ecmascript-language-scripts-and-modules.html#sec-exports-runtime-semantics-evaluation) specifies that evaluation of an `export NamedExports ;` declaration returns an empty completion. MDN's [`export` reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export) independently documents that an export specifier can precede the local declaration because the specifier does not read its value. The acceptance proof therefore compares the local `const` initializer's position against the owner's initializer, with cycles explicitly tested. This is a bounded operational fact rather than a proof of whole-program equivalence.

## Native semantic evidence and refusal yield

1. The SCO HTTP suite `test/sco-interfile-source-observation.test.js` includes independent actual served ESM modules for direct and aliased safe `"value"`, exact source-reading `"toString"`, and mutable imported keys. Each compares native Node 22 ESM execution with HTTP-delivered output. A safe direct `"value"` case transforms the private `secretField` key while both original and transformed programs print the same result.
2. The COO native ESM suite `test/imported-constant-computed-key.test.js` checks third-module aliases, same-module earlier aliases, an export specifier preceding its lexical initializer, later-key conservative refusal, a safe cyclic import, and a caught early TDZ access. It compares native child process status, stdout and stderr against transformed output, and checks the exact private-property rewrite count.
3. The real Chromium integration `test/imported-constant-key-browser.js` compares native and compiled modules served over HTTP under a restrictive self-only CSP. [Pinned browser run 43835718432](https://github.com/FlareZ123/obfs/actions/runs/43835718432), source `558352b352df1497677352d06d0c867a85b0ba85`, passed **14/14** fixtures: **6** with a positive cross-file rewrite and **8** with conservative refusal. The seven added cases exercise third-module and same-owner named exports, mutable keys, source observation, and a cyclic early TDZ `ReferenceError` preserved in Chromium.
4. The seeded ESM generator `sims/third-module-key-fuzz.js` uses an independent offline source-only normalizer after native vs transformed checks. [Pinned targeted gate 43835710063](https://github.com/FlareZ123/obfs/actions/runs/43835710063), source `558352b352df1497677352d06d0c867a85b0ba85`, passed strict JSDoc and semantics on Ubuntu/Windows. The generator reported **60/60** native ESM graphs equal, **30** accepted property rewrites, **30** declined graphs, and **30/30** executable-equivalent static normalizations. Both same-module earlier/later named export variants are represented.
5. [Pinned full Node/Linux/Windows validation 43833676637](https://github.com/FlareZ123/obfs/actions/runs/43833676637) passed at source `b2de9ce4c7e1ffb4f29c7c4d235b99d79cf49f1f`, including the SCO source fix, named export string summaries and original 48-case fuzz. The subsequent same-owner earlier-key proof is validated by the narrower pinned targeted and Chromium runs above; the full gate predates that addition.

## Security, cost, and remaining work

The tested rewrites change field spellings in published JavaScript; they do not withhold source or create a trusted authorization boundary. The independent source-only normalizer reconstructed every positively transformed tested interfile graph without the compiler seed or original input source. It preserved executable behavior without recovering original meaningful field names. This is a **negative security result** under the bounded normalizer threat, and no anti-LLM resistance is claimed.

This modification adds no startup decoder or runtime helper to the accepted graph. The 2.5× requirement still needs workload-specific native and obfuscated end-to-end measurement, including COO startup and any SCO network/auth time, rather than inferring performance from a syntactic rewrite. No general JavaScript semantics theorem or mode-level speed guarantee follows from the focused tests.

An **independent frozen-application blocker remains**: the source-observer-free six-module benchmark loses its 2/2 private owner property renames under an existing unknown-computed-key dynamic-loader guard. [Critic's pinned review](../communications/broadcast/2026-11-16T0821Z_critic_block-release-on-yield-regression.md) documents the 2/2 to 0/2 regression; [the bounded ablation](computed-refusal-ablation-2026-11-16.md) proves that removing the guard globally violates an actual two-hop Function-constructor dynamic-loader case. The named-export proof does not affect that unrelated blocker. The broader source-observer-enabled variant must remain a conservative refusal. Full release claims must therefore remain blocked on the positive-yield and hostile-loader paired test. 

Next: independently challenge shadowing and cyclic initialization ordering, assess genuine application protected-work yield, and avoid presenting easily normalized hashed labels as a security breakthrough.
