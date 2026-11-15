# Closed-world ESM pure-identity flow: reproducible property-renaming extension

Date: 2026-11-15. Agent 6. Status: intermediate engineering result with manual CI evidence; no general ownership proof.

## Objective

Extend the conservative property-renaming proof beyond direct named ESM imports of object literals to one class of imported interprocedural wrappers. Source property renaming must preserve execution output and remain disabled when a wrapper can inspect, mutate or escape a tracked object.

## Accepted summary

An ESM function is summarized as a pure identity only when all of the following hold:

- A source module directly declares `export function f(x) { return x; }`, `export const f=x=>x`, an immutable block-body arrow identity, or an immutable function-expression identity. Each has exactly one plain identifier parameter, a single unchanged return of that parameter, and synchronous nongenerator behavior.
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

`test/cross-file-identity-return.test.js` contains three positive native-ESM cases (plain identity, renamed import, discarded identity return). Negative fixtures include an impure `Object.keys(x)` wrapper, asynchronous return, boxed result escaping the alias set, a reassigned exported function, a default-parameter wrapper, and a function passed through an opaque identifier. These negative fixtures must show zero cross-file property renames. Additional positives cover anonymous/named immutable function expressions and block-body arrow identities, while a generator wrapper remains excluded.

The proof does not recognize general closures, return-object builders, method calls, rest/default parameters, optional invocation, reexports through aggregators, namespace imports, generators or any function whose stable implementation has not been established. It recognizes constant-computed own keys constructed from literal string concatenation or a no-interpolation template; arbitrary runtime-computed keys still block the proof.

## Reproduction and validation

Relevant source commits: `93bf9bef3280eff8fb24a78a90b601a616c6c40b` in `src/properties.js` and `a67bd6f6e7da9638bf5411a77b30b320c3fb0098` in `src/cross-properties.js`. Primary regression file was added in commit `adf6eb2e6df2f57752de606cd9efeaa7e9a5727a`.

Manual workflow [43681813023](https://github.com/FlareZ123/obfs/actions/runs/43681813023) ran against head `cba5b7a75aa8fd889bf98edb9c1511f54c9d63e9`, a verified descendant of `a67bd6f6...`. Both Node22 Ubuntu and Windows jobs passed `npm test`, `npm run typecheck`, and `npm run benchmark`. Ubuntu also passed Chromium integration. This is finite reproducible coverage, not a general JavaScript semantic-equivalence proof.

The additional negatives and immutable arrow/function-expression cases were verified by subsequent manual validations, including [43683477452](https://github.com/FlareZ123/obfs/actions/runs/43683477452), which completed successfully on Node22 Ubuntu/Windows and Ubuntu Chromium. `test/cross-file-identity-grid.test.js` adds 48 generated real-ESM graphs with differing alias chains, destructuring, literal arrays and computed static reads. All expected transformed program outputs matched their originals; each fixture proved two own keys, yielding 96 independently checked rename sites. CI [43682859451](https://github.com/FlareZ123/obfs/actions/runs/43682859451) passed the generated grid across both operating systems.

## Implications

A minimal cross-module function contract can enable additional property obfuscation without adding client runtime work. Soundness of a larger set of summaries requires precise alias and mutation tracking, complete loader-resolution assumptions, and an explicit accounting of JavaScript reflection. Expansion should be conditional on differential test coverage and credible ownership proofs.


## Constant-computed own-property declarations

Static string expressions in a computed object key are eligible when they are literal strings, no-interpolation template literals, or bounded recursive concatenations of such strings, e.g. `{['secret'+'Field']:7}`. The `ownPropertyName` helper shared by local and ESM cross-file analyses resolves those keys at build time, rejects nonstatic values, duplicate resolved names and magic `__proto__`/`constructor`/`prototype`, and rewrites only the key expression while leaving surrounding computed brackets intact. Therefore the evaluation order and computed-property semantics remain unchanged. Runtime key construction and calls are rejected to protect side effects.

Regression `test/constant-computed-object-key.test.js` covers seven local adversarial positive/negative cases plus a native ESM exported definition and consumer. Manual validation [43683906727](https://github.com/FlareZ123/obfs/actions/runs/43683906727) ran against head `3294d99e1aa5440faaf3138982306acf55a7a7ac`: Node22 Ubuntu and Windows behavioral/adversarial tests, JSDoc typecheck, benchmark all passed; Ubuntu Chromium integration passed. Implementation commits `7125567c` and `8d94cc52`; test commit `3294d99e`.
