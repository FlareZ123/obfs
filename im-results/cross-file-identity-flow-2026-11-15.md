# Closed-world ESM pure-identity flow: reproducible property-renaming extension

Date: 2026-11-15. Agent 6. Status: intermediate engineering result with manual CI evidence; no general ownership proof.

## Objective

Extend the conservative property-renaming proof beyond direct named ESM imports of object literals to one class of imported interprocedural wrappers. Source property renaming must preserve execution output and remain disabled when a wrapper can inspect, mutate or escape a tracked object.

## Accepted summary

An ESM function is summarized as a pure identity only when all of the following hold:

- A source module directly declares `export function f(x) { return x; }` with exactly one plain identifier parameter, one `return` statement, and no asynchronous or generator behavior.
- The exported function has one declared binding and no other identifier references in its source module, excluding its own declaration. Reassignment and other indirect uses are therefore refused.
- Another supplied ESM module imports this function via a canonical named static import. The imported binding is unique and used only as a direct call.
- The tracked object enters only as argument 0. Its return value is consumed by an analyzed constant alias or discarded, with unknown use/escape rejected.
- All existing object-own-field proof constraints, global graph ambiguity gates, and reflection checks still apply.

Summaries are compile-time-only and introduce no new runtime code. The extension recognizes `import {identity as relay}` with a renamed local binding. As an example:

```js
// state.mjs
export const state = { secretField: 17 };

// util.mjs
export function identity(x) { return x; }

// main.mjs
import {state} from './state.mjs';
import {identity as relay} from './util.mjs';
const alias = relay(state);
console.log(alias.secretField);
```

The compiler now consistently renames the definition and the caller's statically proven access. The program still prints `17`. Previously this graph was declined because the imported call looked like a potential escape.

## Counterexamples and exclusions

`test/cross-file-identity-return.test.js` contains three positive native-ESM cases (plain identity, renamed import, discarded identity return). Negative fixtures include an impure `Object.keys(x)` wrapper, asynchronous return, boxed result escaping the alias set, a reassigned exported function, a default-parameter wrapper, and a function passed through an opaque identifier. These negative fixtures must show zero cross-file property renames.

The proof does not recognize general closures, return-object builders, method calls, rest/default parameters, optional invocation, reexports through aggregators, namespace imports, generators or any function whose stable implementation has not been established.

## Reproduction and validation

Relevant source commits: `93bf9bef3280eff8fb24a78a90b601a616c6c40b` in `src/properties.js` and `a67bd6f6e7da9638bf5411a77b30b320c3fb0098` in `src/cross-properties.js`. Primary regression file was added in commit `adf6eb2e6df2f57752de606cd9efeaa7e9a5727a`.

Manual workflow [43681813023](https://github.com/FlareZ123/obfs/actions/runs/43681813023) ran against head `cba5b7a75aa8fd889bf98edb9c1511f54c9d63e9`, a verified descendant of `a67bd6f6...`. Both Node22 Ubuntu and Windows jobs passed `npm test`, `npm run typecheck`, and `npm run benchmark`. Ubuntu also passed Chromium integration. This is finite reproducible coverage, not a general JavaScript semantic-equivalence proof.

The additional three negative tests in commit `05dc10660bef6ab98040582a8d6bfffe7c061b1a` were added after this successful run and must be verified in a subsequent manual validation.

## Implications

A minimal cross-module function contract can enable additional property obfuscation without adding client runtime work. Soundness of a larger set of summaries requires precise alias and mutation tracking, complete loader-resolution assumptions, and an explicit accounting of JavaScript reflection. Expansion should be conditional on differential test coverage and credible ownership proofs.
