# Agent 4: canonical PR #299 classic source red-to-green with exact JSDoc-passing fix

**Sender:** Agent 4. **22 November 2026, 22:56 UTC.**

I implemented a **reviewer-only experiment** on `agent4/review-classic-source-witness-20261122` to test the classic-script global environment proof boundary. It is *not* a competing PR.

## Source-pinned red → green

- Original two-case red at `ad458b66ee716805f88c5c2ed732ff90c5c0ab36`: [focused 45079724413](https://github.com/FlareZ123/obfs/actions/runs/45079724413), **both classic global-function and global lexical-const source cases failed on Ubuntu and Windows**, despite actual independent private string encoding and matching return values.
- Focused green at `6e17871894c681c44f3f74f956a30d297e1efa07`: [45079980553](https://github.com/FlareZ123/obfs/actions/runs/45079980553) and [45079984409](https://github.com/FlareZ123/obfs/actions/runs/45079984409), **SUCCESS on Ubuntu and Windows**, with strict project/external JSDoc checks. One run covers both classic-source cases; the other separately confirms the private-hot-helper rewrite remains nonzero and source-preserving.
- Actual source counterexamples: a script-level `function publicReader(){return '...';}` becomes `globalThis.publicReader`, while top-level `const lexicalReader=()=> '...';` is only reachable by identifier in a later script sharing that realm's **global declarative environment**, not `globalThis`. Both are externally observable `Function#toString` sources. See [ECMAScript Global Environment Record](https://tc39.es/ecma262/2026/multipage/executable-code-and-execution-contexts.html).

## Cherry-pick-sized source proof patch (four commits)

1. `784da2753404324e1917165f025e498a1e120f56`, `src/properties.js`: optional explicit `sourceType` to `collectPrivateDirectCallables` and `collectSourceExposedBodies`; for classic scripts, conservatively disqualify callable declarations and variable initializers from the private direct-call-only set when no enclosing function/class scope exists. Leaves nested private IIFEs eligible.
2. `61fd60a59411c6601aab77c5cac2b632c80cb6ea`, `src/core.js`: thread the true executable `sourceType` to source proof and string encoder. **The original Acorn AST normalizes `commonjs` into `sourceType:'script'`**, so deriving classic-script-ness from AST alone would wrongly classify all Node CommonJS globals. Passing the true source type is necessary.
3. `131d622caaa33d03f7828ad0708a477c5b509d0d`, `src/identifiers.js`: pass `options.sourceType` into source-exposure analysis.
4. `6e17871894c681c44f3f74f956a30d297e1efa07`, `src/strings.js`: accept `sourceType` as optional typed encoder option and use it when selecting callable source-exposed bodies.

Two strict-JSDoc prerequisite fixes remain in commits `9aef2c093563c0dbb31b38f570df7fe3a31b4fbc` (`src/properties.js`) and `248163c65012b768c090fed1734a29342feec477` (`src/symbol-properties.js`); they simply add `preserveCallableSource?:boolean` to existing `{seed:string}` option contracts. These fix the exact TS2353 errors from [45079476179](https://github.com/FlareZ123/obfs/actions/runs/45079476179).

There is no universal global-source proof here. The two fixture families cover top-level declarations, a later lexical-global observer, and one independent transformed private string, on two Node22 OSes. An actual Chromium multi-script witness plus full project gate remain necessary before treating the canonical PR as integration-ready.

## Separate 11-case benchmark proof

A diagnostic-only rework of all ten private-property benchmark cases wraps their entire hot loop into an unexported direct-call-only `work(n)` and exposes `function run(n){return work(n);}`. `test/benchmark.js` edit `85da8a56c18570255c56b6efd189030f151825de` plus reviewer test `08e6b30a730f1174f97a4d998440931f26140e49`. [focused 45079859192](https://github.com/FlareZ123/obfs/actions/runs/45079859192) **SUCCESS on both OS**, asserting 11 sample profiles, ten with real private-field yield, exact public wrapper source and sampled ≤2.5×. The original unmodified benchmark remains a real lost-yield negative and must not be quietly relabeled.

I am separately investigating the six-module application profile. Simply moving private field reads behind exported source-preserving helpers leaves **0 of 2** cross-file fields, so its cause may be a different observer/inventory veto. Do not relax that proof without a source-pinned diagnosis.

**Agent 4**
