# Proven imported identity through a local immutable alias (21 November 2026)

## Scope and claim

This is a **bounded semantic-coverage extension** to the experimental
`closedWorld:true` ESM field renamer. A pure identity helper already
proven through the existing cross-file signature analysis can be assigned
directly to a unique top-level immutable `const` and invoked directly
on a proved record. The compiler now tracks the return alias and can
consistently rename private fields across the importing module.

No arbitrary higher-order JavaScript, source secrecy, hostile-runtime
integrity, or universal 2.5× compute bound is implied. The declared
closed-world host/loader assumptions in
[`docs/CLOSED_WORLD_PROPERTY_PROOF.md`](../docs/CLOSED_WORLD_PROPERTY_PROOF.md)
remain essential.

## Before / after grammar

Existing cross-module direct-call proof already accepted:

```js
// state.mjs
export const state={secretField:17,otherField:5};
// identity.mjs
export function identity(x){return x;}
// entry.mjs
import {state} from './state.mjs';
import {identity} from './identity.mjs';
const result=identity(state);
console.log(result.secretField);
```

The new grammar additionally accepts a single immutable local relay:

```js
// entry.mjs
import {state} from './state.mjs';
import {identity} from './identity.mjs';
const forward=identity;
const result=forward(state);
console.log(JSON.stringify([result.secretField,result.otherField]));
```

The proof also handles a directly imported immutable exported arrow
(`export const identity=x=>x`) and two distinct top-level immutable aliases
of the same proven imported identity, including mixed direct calls.

The transformation is **only** admitted when the complete existing
object-owner proof establishes that the relevant object fields are
private, the imported identity is a uniquely bound stable pure one-parameter
identity, and the alias is a directly initialized, uniquely bound
top-level immutable local `const`. All other identifier uses remain
subject to the pre-existing function-value escape and scope analysis.
The import origin and relay may only appear in supported direct calls.
No arbitrary member-call adapters, accessors or new functions are summarized.

## Immutable red/green reproduction

**Pre-change red:** [manual proof run 44944368263](https://github.com/FlareZ123/obfs/actions/runs/44944368263)
at commit `a7f5fe14ce378d9d69a73f6beaceaa8aa269d1cc` on
Ubuntu/Windows Node 22.23.4. Both OS produced **22 passes / 3 expected
positive-yield failures** in 25 targeted tests; strict core and test JSDoc
checks passed. The three positives had zero actual protected field
rewrites (`0 !== 2`), rather than original/emitted behavioral mismatches.
All six independently authored unsafe-relay negatives already retained
the original spelling.

**Post-change green:** [manual proof run 44944530186](https://github.com/FlareZ123/obfs/actions/runs/44944530186)
at source commit `b1080f2e209d5cace472628a9202beb471315a25`,
with both Ubuntu and Windows jobs successful, **26/26 tests passing**
per OS and zero skipped/failed. The post-change suite includes the
original 17 cross-file identity cases and nine additional cases in
`test/cross-file-imported-identity-alias.test.js`, with:

- Three nonvacuous positive fixtures (each **2/2 fields actually
  renamed**, **1/1 candidate object**, and exact original/transformed
  native Node ESM output equality).
- Six refusal fixtures with zero renames and exact output parity:
  mutable local relay, exported function value, arbitrary higher-order
  consumption, function `.toString()` observation, `Object.keys`
  reflection, native `.call` invocation adapter.
- Additional negative for an imported helper escaping through an opaque
  object holder in `test/cross-file-identity-return.test.js`.

Reproduce locally:

```text
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npx tsc -p jsconfig.cross-identity.json
node --test test/cross-file-identity-return.test.js test/cross-file-imported-identity-alias.test.js
```

The exact main commit includes the changes in
`src/properties.js` and the two targeted test files. The
manual workflow `.github/workflows/manual-imported-identity-alias.yml`
pins the same steps on Ubuntu and Windows. Full-suite release gating
and independent hostile-browser scenarios remain separate evidence
obligations.

## Source-pinned real Chromium compatibility

[Source-pinned full targeted run 44944930019](https://github.com/FlareZ123/obfs/actions/runs/44944930019)
at commit `362fbc9c4e97d0f94fec9b7c308656492720e1f1` completed successfully on
**both Ubuntu and Windows** for all 26 Node identity-alias tests plus strict
core/targeted JSDoc. Ubuntu additionally passed
`test/cross-file-imported-identity-browser.js` under actual
Chrome 157.0.8103.78, serving the distributed `state.mjs`,
`identity.mjs` and `entry.mjs` modules over localhost HTTP.

The browser positive actually rewrites **2/2 private fields**; the
`Object.keys` reflective-owner negative refuses all rewrites.
Both native and protected variants returned identical values for
**4,096** typed inputs under each case. The separate test host
accepted 384 primitive callbacks without receiving the owner object.

Twelve alternated-order, 100,000-call real-browser work comparisons
reported a protected/native ratio of measured medians of about
**1.000×**, with **0/12** observed >2.5× protected/native pairs.
It is a browser- and workload-specific microbenchmark of property
access and arithmetic, not a cold startup test or a universal
performance bound. No private owner was transferred to the public
callback. A new unknown host callback that can inspect the private
object must invalidate the closed-world assumption.

The initially dispatched browser-extended gate
[44944855303](https://github.com/FlareZ123/obfs/actions/runs/44944855303)
was **red in strict JSDoc** due to the newly introduced browser
test's implicit callback parameter types and `unknown` recorded
callback count. They were corrected in the target test without
changing the compiler, and the green run above validates those
corrections. This earlier red run is a harness typing failure,
not a behavioral compiler regression.

## Transitive immutable relay fixed-point (source-pinned)

The first bounded extension admitted direct `const invoke=identity`.
The next experiment asked whether an *acyclic source-ordered chain* of
immutable local aliases can be admitted with the same conservative
function-value escape proof:

```js
const one=identity;
const two=one;
const three=two;
const record=three(state);
console.log(record.secretField);
```

**Red evidence:** [44945100969](https://github.com/FlareZ123/obfs/actions/runs/44945100969)
at immutable source `beb4cf693d233dff40ce61ff8ef8d7c1ad829534`
produced **32 passing / two positive-yield failures** among 34
targeted tests on Ubuntu and Windows. Both new positives had zero
protected fields renamed, while all 12 prior/new unsafe-use negatives
retained their refusal behavior. Browser and strict JSDoc steps stayed
green except the expected positive test failures.

**Green evidence:** [44945175055](https://github.com/FlareZ123/obfs/actions/runs/44945175055)
at source `a6faf54d3395a3a693f277fb42663dd672bed2da` passed
**34/34** targeted regression tests on Ubuntu and Windows, strict core
and targeted JSDoc, and Ubuntu real Chromium 157 semantics/CPU
comparison. Two new transitive positives each rewrite both proven
fields and match original Node ESM stdout. Six transitive unsafe
variants refuse all rewrites and preserve stdout: mutable leaf alias,
function-source observation, owner reflection, `.call` adaptation,
opaque holder invocation and `new` construction.

The implementation walks top-level immutable declarators in source
execution order, so an alias is added only when its initializer
already references an admitted identity or prior immutable alias.
It uses the original direct-call function-summary checker and
removes a descendant alias if any intermediate source summary
becomes inadmissible, repeating until no unsupported descendants
remain. This bounded acyclic dataflow is reproducible and avoids
rewriting arbitrary higher-order function graphs.

The three-module cross-file source model, host assumptions, and
source-only recoverability limitations remain unchanged. A targeted
34/34 pass is not a general property-proof theorem. The broader source-pinned
integration below supplies independent repository-scale compatibility evidence.

## Three-graph Chrome extension and deterministic owner-flow corpus

[Targeted full Chrome/Windows/Linux run 44945684002](https://github.com/FlareZ123/obfs/actions/runs/44945684002)
at source `5ee83d3507aba17188bfead1f56ecab3d202b185`
completed successfully for strict core/test JSDoc, **36/36**
top-level Node focused tests (including two loops of 64 distinct
native/emitted ESM runs), and real Ubuntu Chrome 157.

The real-browser harness now loads *three* independent variants of
the same state and imported-identity modules: the original one-hop
positive, a **three-hop source-ordered immutable** positive, and
a reflective `Object.keys` negative. Both positive graphs rewrite
**2/2** protected keys each; the reflective graph remains unchanged.
All three native/emitted pairs matched on **4,096** input values
per graph. The host callback receives primitive outputs only, with
384 observed callback invocations. The 12-pair, 100,000-call
one-hop protected/native runtime-work ratio of medians was
**0.9167×**, with **0/12** sampled strict >2.5× breaches.

The last number is a workload-specific browser sample, with
fast integer/record reads near runtime-timer granularity. It does
not certify arbitrary cold starts, broader applications, or an
attacker-resilient secret. The graphs are only correct under the
declared closed-world exposure model.

A prior [36/36 targeted cross-OS run 44945351340](https://github.com/FlareZ123/obfs/actions/runs/44945351340)
at source `e84ff7970b7c4644e9d47bcc62181c21fd6928e2`
already validated 64 deterministic positive alias chains of
depth 1–8, exact Node stdout parity and 2/2 renames each,
plus 64 independently varied negative chains requiring unchanged
fields. The single-pass source-order invalidation refactor
[44945519088](https://github.com/FlareZ123/obfs/actions/runs/44945519088)
at `d913f8584df685e901311ac80475e2d15588554b`
also passed 36/36 on both OS plus strict JSDoc and Chrome.
No second broad manual source-pin was needed until the transitive
revision had passed those targeted gates.

## Full integration and ordinary-minifier cost control

[Full Linux/Windows 4,152-case integration 44945630288](https://github.com/FlareZ123/obfs/actions/runs/44945630288)
at frozen source `5c7d66371eeb218772f5b2780692708dd1300a38`
passed with no failures: Ubuntu **4,151 pass, one skip**,
Windows **4,147 pass, five skips**. Both JSDoc suites, adversarial
tests and benchmarking steps succeeded; Ubuntu's three existing
Chromium cross-module/host-lock integrations succeeded.
This pin includes the source-ordered transitive fix, linear descendant
invalidation and the 128-case deterministic ESM corpus. It predates
the additional ancestor-observation and esbuild comparator assertions,
which are covered by later targeted immutable pins.

[Source-pinned equal-trust Chrome 157 comparison 44946047157](https://github.com/FlareZ123/obfs/actions/runs/44946047157)
at `33766e1f602347068351addbfad6cce62cb13acf`
ran the **exact same three-file graph** in native ESM, ordinary
esbuild `minify:true` ES2022 (unbundled, no property mangling),
and the compiler's closed-world private-property output.
It tested both one-hop and three-hop private relays, plus the
reflected-owner refusal. The original/minified/protected positive
functions matched on 4,096 browser inputs and all benchmark
checksums; the reflective refusal preserved its native keys.

Across 12 rotating-order 100,000-call Chrome trials, the
protected/native and protected/ordinary-minified ratios of
measured medians were approximately **1.000×** each, with
**0/12** strict >2.5× matched pairs against both controls.
The browser timer returned medians around **0.9 ms** for all three
variants. This small-app, microsecond-scale measurement can
show absence of a large measured cost in these pairs; the
0.1 ms coarsened timer resolution makes small differences
poorly resolved.

The newer
[source-pinned public label-surface check 44946388865](https://github.com/FlareZ123/obfs/actions/runs/44946388865)
at `e7c5342a4c9984398e9b3397b6f3e841f44da453`
passed on both OS (strict JSDoc, 39/39 focused Node tests
and real Chrome 157). It requires both original semantic private
field names to remain visible in default unbundled esbuild minification
and verifies that **neither label survives** in the positive
one-hop or transitive protected output. In the reflective-owner
negative, the renamer refuses and **both labels remain**.
This is a precisely bounded *syntactic source-label reduction*;
ordinary esbuild can optionally mangle properties when configured,
and field-label removal cannot establish semantic-program secrecy.

Official language references for the dataflow restriction:
[ECMAScript 2026 lexical declarations](https://tc39.es/ecma262/2026/multipage/ecmascript-language-statements-and-declarations.html)
and [MDN static ESM imports](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import).
They support immutable local `const` binding and read-only
import semantics; they do **not** validate arbitrary application
closed-world assumptions.

## Proof mechanism and limitations

`proveLocalObject` already receives `importedIdentityFunctions`
verified against the declared ESM graph by `src/cross-properties.js`.
The extension examines top-level `const` declarators whose initializer
is an identifier with an existing proved pure identity signature.
It adds the new local alias as an external, argument-zero forwarding
summary, while recording the exact initializer association.
The existing use scanner grants one narrow initialization read from
the imported helper and continues rejecting every other unsupported
function-value reference. Root aliases and returned object fields
still undergo all the original source-observation, reflection,
escape, duplicate binding and field-ownership checks.

This is a conservative syntactic proof, and it cannot establish the
behavior of unknown host consumers or runtime mutations of global
intrinsics, loaders, Proxies or callbacks. A public obfuscated
property name remains statically or dynamically recoverable in the
COO threat model, as the already published own-key attacker
baselines demonstrate. Treat the additional protected-work yield
as usability progress, with **no established anti-analyst advantage**.

**Primary strong-obfuscation release status remains RELEASE-BLOCKED.**
