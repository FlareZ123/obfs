# Selected SCO private child function-object state: standalone admission repair candidate

**28 November 2026 · Agent 33 · intermediate correctness engineering, not a protection theorem.**

## Defect and retained baseline

The standalone `partitionScoSelectedAsyncExports` path admitted audited child source
`export function next(){next.count=(next.count??0)+1;return next.count;}`
while the composed selected graph refused it. A root selected private export
need only call `next()`, so the root's imported-identity guard had no reason
to reject the direct call. Yet each original browser ESM instance gives its
own function object, while server-side relocation uses a shared singleton.
The native three-tree ESM witness produces first-client-A 1, first-client-B 1,
then shared-server 1 and 2. Prior source-pinned Linux/Windows diagnostic
[45139207858](https://github.com/FlareZ123/obfs/actions/runs/45139207858)
at `b88473fd924f0c55964545584f228b1a2aaa1292` confirmed this was a
**passing diagnostic for an unsafe admission**, not a safety pass.

## Candidate change

A new reusable static checker `src/sco-private-child-function-identity.js`
identifies top-level named function declarations and immutable const
function-expression/arrow bindings. It also tracks the separate internal name
of a named function expression. Class identifiers are treated conservatively
as function-like module identities. It allows declaration sites and syntactically
direct calls of a known function; it refuses every other unproved reference,
including own-property reads/writes, aliases, first-class return/value
carriers and reflective calls. Shadowed names are overapproximated.

The composed graph now uses this shared function-identity checker in place
of its formerly inline function-object visitor, while retaining its
**additional**, stricter private-module top-level immutability requirement.
The standalone static private-source closure invokes the same checker on
each compiler-snapshotted, parseable child AST, and separately invokes the
already-shared `assertNoPrivateImportMemberState` on *each transitive child*
as well as on the directly selected root. This closes a second represented
path: child A imports `next` from child B and mutates `next.count` while
the root calls only A's `run()` directly.

Positive controls preserve a deterministic stateless exported function,
a stateless exported arrow, directly invoked transitive helper and a
transitive immutable primitive import. The rewritten own-function-state
probe now asserts refusal, rather than reproducing unsafe admission by
expecting acceptance. A second test supplies actual three-tree ESM
sources and asserts independent-versus-shared readings `[1,1,1,2]`
for the transitive case.

Source locations:
- `src/sco-private-child-function-identity.js`
- `src/sco-selected-graph.js`
- `src/sco-selective-partition.js`
- `test/sco-private-child-own-function-state-probe.test.js`
- `test/sco-private-child-transitive-identity.test.js`
- `test/sco-selective-private-import-identity.test.js`

Representative immutable source commits: initial shared checker
`137310e56d7673c91b2c4be97b4afb6e71d76411`, standalone invocation
`716503af33b3ff191c673d18640821317e13bd9e`, transitive private-import
audit `e90ce7b055053f17d542c7bf2a150b5f6d10fec1`, and extended
named-expression/class guard `9e4783dbd5868ea31eeac46f75302867388e7304`.
This report documents a **candidate**; a commit hash proves source identity,
not that the tests passed.

A pinned Linux/Windows SCO graph workflow
[46157991330](https://github.com/FlareZ123/obfs/actions/runs/46157991330)
was dispatched at source `427ff9841896a545396576082fbb81c247810b05`;
it **predates** the named-expression/class extension and does not validate
the final candidate. The earlier narrower run 46157806306 was cancelled
to conserve queued runner resources. Do not label either job green without
checking its actual conclusion and failed-job logs.

## Scope and unresolved risk

This is a compiler-time refusal guard for opted-in, supplied private-source
graphs. It adds no instructions to accepted clients or RPC handlers and
therefore no new steady-state obfuscated compute on those sources; it can
increase build-time analysis and reduce accepted coverage. The analysis
does **not** establish full per-client ESM state equivalence: mutable lexical
closures, host state, arbitrary higher-order carriers, dynamic loaders,
reflective prototypes, unprovided `privateModuleSources`, and a hostile
Node runtime remain outside its proof. A syntactically safe direct call
still cannot be called universally safe without a proved callee summary.
Graph composition has an additional strict module initializer gate that
standalone does not adopt in this candidate.

The server that withholds private child bytes still serves authenticated
operations to a legitimate caller. Such a caller can relay allowed outputs
or infer bounded functions; no static-reconstruction, integrity,
environment-locking, anti-relay or <=2.5x complete application claim follows.
Strong-protection release status remains **RELEASE-BLOCKED**.

Acceptance work: run source-pinned Linux and Windows Node tests plus project/
external strict JSDoc, verify expected refusals *and* positive direct-call
yield, inspect existing selected-SCO fixtures for newly declined safe
programs, then include any proven valid change only in a frozen complete
Node/Chromium/HTTP/performance gate. An existing full-suite red baseline
is not superseded by focused green. The [23 November root-alias and child
witness](sco-import-expression-identity-2026-11-23.md) remains the historical
prepatch evidence.


## 28 November follow-up: state owners, readonly tables and actual CI triage

The same cross-client counter witness generalizes beyond function-own properties:
`let counter=0`, `const state={count:0}`, `const history=[]` and
`const matcher=/a/g` all allocate independent mutable cells/objects in
distinct browser module maps, but one owner after server relocation. An
actual local Node **v22.16.0** three-tree experiment on 28 November produced
`[1,1,1,2]` for function-own, lexical, mutable-record, array and
transitive-import counters; a primitive `const salt=40` control returned
`[42,42,42,42]`. The repository's
`test/sco-private-child-lexical-state.test.js` executes native ECMAScript
modules for lexical, record, array, RegExp and constant-control variants
(the regex repeated-server readings should be `[true,true,true,false]`).
These are **original-runtime behavior observations**, not generated SCO
transport parity tests.

The shared child scanner now refuses direct module-level `let`/`var`
declarations and obvious object/array/RegExp state owners, including
conditionals, sequences, logical carriers and selected constructors.
Unknown constructors and opaque factory outputs are *not* proved pure.
For statically owned primitive record or array literals, the narrow
`src/sco-private-child-readonly-literal.js` proof can retain positive
coverage: it requires literal primitive own-property values, no getters,
computed keys, `__proto__` setter or spread, and every lexical owner
reference must be a static scalar own-key read with no mutation, nested
member access, calls, alias, reflection or first-class escape. Only such
nonescaping scalar reads are admitted, and neither compiler emitted byte
generation nor RPC was changed. The positive/negative 20+ case matrix
is `test/sco-private-child-readonly-literal.test.js` with an accepted-facade
byte-equivalence control. The unproved dynamic and reflective forms
are deliberately still declined or outside this proof, not silently assumed
equivalent.

**Source-pinned initial CI is RED**, not green:
[run 46157991330](https://github.com/FlareZ123/obfs/actions/runs/46157991330)
at exact `427ff9841896a545396576082fbb81c247810b05`
completed on Ubuntu and Windows with **104/105 passing, one failing on each**.
The sole failure was the existing
`static constructor key aliases must not hide runtime imports` diagnostic
in `test/sco-private-transitive-manifest.test.js`. The new child
function-identity refusal intercepted
`const fn=()=>0;const load=fn[key](...)` before the established
constructor-loader refusal. The unsafe module **was still rejected**;
the failure was an incorrect refusal classification against an
unchanged, useful assertion. At
`bb3ecb8f9a304596e6974ebc947af081392d15ed`, new child-state
checks were moved *after* the existing realm/host/dynamic-loader guards
to preserve their more specific diagnoses. No assertion was weakened.

[Follow-up run 46159150715](https://github.com/FlareZ123/obfs/actions/runs/46159150715)
pins exactly `bb3ecb8f9a304596e6974ebc947af081392d15ed`
and includes the newer readonly positive-yield and lexical-state matrix,
the prior state/alias/fuzz integration controls, and dedicated strict
JSDoc configuration. At dispatch it was **queued**; await its actual
job result before making any green or global-release assertion.

Security-performance status remains limited: these guards affect
source-audited compiler admission and compiler analysis, not the
hot path of accepted generated code. Their safe-refusal rate, available
positive applications and full integration impact have not been
comprehensively measured. SCO authorized-relay threats and
the complete 2.5x/application/Chromium acceptance gate remain unresolved.
