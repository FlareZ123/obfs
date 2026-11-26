# Closed-world property transformation: proof envelope and release lanes

**Research state: through 18 November 2026.** This document describes what the experimental property compiler has checked and what remains unproved. It is an engineering acceptance contract, not a theorem of soundness or obfuscation security. See [threat-model boundaries](SECURITY.md), the [research index](../results/README.md), and the executable source under `src/cross-properties.js`, `src/properties.js`.

## 1. Scope of the declared program

`closedWorld:true` is a *claim by the integrator* that the supplied ESM modules and their statically resolved imports form the complete relevant distribution unit. The flag cannot itself establish that all consumers or behavioral dependencies of those modules are known.

The compiler's bounded proof can reason about direct named ESM imports/exports, explicit named source re-exports of already-proved read-only reader helpers, certain immutable identity/reader wrappers, literal record ownership, and a restricted grammar of statically keyed accesses. The compiler deliberately declines many ambiguous uses, such as opaque imports, reflection, escapes, unknown calls, runtime source observers, or dynamic property keys. For arbitrary JS, especially dynamic importers and cross-realm callbacks, the static AST is only a partial observation.

A real deployment should explicitly establish the following environmental premises before accepting property renaming as preserving its application's API:

1. **Graph closure:** all relevant modules, direct consumers, and externally callable public contracts are inventoried. Unknown consumers of exported object shapes must not rely on the original field spelling. Runtime `import()`, URL/query variants, import maps, custom loaders, service workers and plugin-generated modules are reviewed independently of the ordinary static graph.
2. **Realm integrity:** native global `Object`/`Reflect` behaviors relied upon by the proof are stable at the point of use, including their mutable methods and descriptors. The compiled program may see source-visible assignments, Proxy traps, accessors, and host-provided effects. A *syntactic scanner* cannot guarantee intrinsic stability against all these possibilities.
3. **No unproved observations:** source bytes, function source, error spelling, own-key enumeration, descriptor values and inherited getters must not reveal a renamed spelling to code outside the rewrite set. Inspectors can execute through a host callback even when the source graph has no direct import edge to the exported object.
4. **Effect/alias closure:** object aliases through arguments, returns, arrays, nested containers, computed keys, reflection methods, and callbacks need an explicit interprocedural proof, or the property must stay unrenamed.
5. **Execution and performance contract:** compare original/generated behavior across supported Node/browser versions, external APIs and error cases. The hard project limit of 2.5× applies to the workload's repeated execution. COO cold startup is also relevant; SCO/SNO server-only initialization has the prompt's separate amortization allowance. A sampled benchmark is not a universal bound.

These are deployment assumptions and test requirements, **not guaranteed properties** of `obfuscateFiles`.

## 2. Why a statically closed graph is narrower than the runtime world

Consider a declared ESM entry importing both a private-record reader and an exported object, `state={secretField:41}`. The reader invokes `Reflect.ownKeys(schema)`, which appears to be an ordinary builtin inspection of an unrelated inert local record.

The entry can acquire an alias of the actual mutable global `Reflect` object through `Object.getOwnPropertyDescriptor(globalThis, 'Reflect').value`. By replacing `ownKeys`, an opaque host callback can run when the reader is evaluated. That callback dynamically imports the published `state.mjs` and enumerates its original own fields. A transform of `state.secretField` may therefore change the output even though the callback source does not appear in the supplied ESM graph.

This is a *semantics-by-environment* counterexample: both the original and generated programs execute in the same test host, but the generated program reports a different field name. It must be distinguished from an attacker deliberately instrumenting a fully controlled runtime to extract public code: the latter is a threat-model failure of secrecy, not necessarily a compiler regression under an explicitly trusted host.

The same reflected capability may travel through direct descriptors, captured methods, array/object holders, `Proxy(globalThis,{})`, local returned values, and an immutable local descriptor selector `const k='Reflect'`. Each family has been tested in paired original-versus-generated Node ESM executions.

## 3. Independently pinned regression and positive-yield lanes

| Lane | Source/input obligation | Required evidence | Status at listed source |
|---|---|---|---|
| A: declared ambient effects | Source-visible `Reflect` method replacement or indirect acquisition with an opaque host callback | Exact original/generated own-key parity, zero unsafe rewrites | Red before fixed in [43855476774](https://github.com/FlareZ123/obfs/actions/runs/43855476774); fixed direct/captured cases in [43862447359](https://github.com/FlareZ123/obfs/actions/runs/43862447359) |
| A2: opaque receiver | `Proxy`, returned global root, local identity forwarding | Exact Node ESM parity and zero unsafe rewrites | Four red cases at [43863988820](https://github.com/FlareZ123/obfs/actions/runs/43863988820), all green in [43864343227](https://github.com/FlareZ123/obfs/actions/runs/43864343227) |
| A3: computed selector | Immutable `const k='Reflect'` with an opaque descriptor receiver | Exact Node ESM parity and zero unsafe rewrites | Red in [43865686219](https://github.com/FlareZ123/obfs/actions/runs/43865686219), green in [43866170045](https://github.com/FlareZ123/obfs/actions/runs/43866170045) |
| A4: non-inert Proxy trap | Source-visible `getOwnPropertyDescriptor` handler invokes opaque host getter even on an unrelated descriptor key | Exact Node ESM parity and zero unsafe rewrites; separately retain literal empty-handler positive | Red in [43867960214](https://github.com/FlareZ123/obfs/actions/runs/43867960214), green in [43868314304](https://github.com/FlareZ123/obfs/actions/runs/43868314304) |
| B: native positive | Separate, source-observer-free, own-key-only graph and unrelated immutable descriptor selectors | Exact outputs and **greater than zero** actual renamed protected own keys | One-field positive in descriptor gates; distinct six-module application retains **2/2** rewrites |
| C: inherited dynamic loader | Missing record field resolves to inherited host Function constructor | Refusal where native parity cannot be proven | Retained in `test/cross-file-safe-record-read.test.js` and the application gate |
| D: hostile runtime | Outside-declared preloader, custom import map, instrumentation, source-only copy attack | Attack success scored separately from compiler semantic correctness | Public COO fields are recoverable; the frozen source-observing six-module original remains **0/2** renamed |
| E: cost and compatibility | Node22 Ubuntu/Windows, Chromium, startup and sustained workload | Pinned original/generated output parity, measured protected work and runtime ratios | Selected full gates [43862920232](https://github.com/FlareZ123/obfs/actions/runs/43862920232), [43865027728](https://github.com/FlareZ123/obfs/actions/runs/43865027728), [43866546917](https://github.com/FlareZ123/obfs/actions/runs/43866546917) and [43868632802](https://github.com/FlareZ123/obfs/actions/runs/43868632802) passed; no universal 2.5× guarantee |

| F: caught nullish object-pattern spelling | Caught V8 `TypeError.message` names an own-field read used as direct or nested object destructuring operand | Original/generated exact message parity, zero unsafe rewrites, and a separate genuine safe-field positive | [Pre-guard 9/9 each OS](https://github.com/FlareZ123/obfs/actions/runs/44363109129), [nested pre-guard 6/6 each OS](https://github.com/FlareZ123/obfs/actions/runs/44364110315), [fixed 15/15 each OS](https://github.com/FlareZ123/obfs/actions/runs/44364454538), [Chromium check](https://github.com/FlareZ123/obfs/actions/runs/44365401668), [intermediate evidence](../im-results/property-nullish-object-pattern-typeerror-2026-11-18.md) |
| G: named reader source re-export | An already-proved read-only reader is relayed only through explicit `export {reader as alias} from './module'`; the owner remains directly imported and every consumer use stays a proved direct reader call | Positive one-hop/two-hop rewrite yield; owner re-export, export-star, foreign-owner call, `.toString()` observation and function-value escape all refuse | [Pre-proof red on both OSes](https://github.com/FlareZ123/obfs/actions/runs/44409102324), [full green including observation/escape negatives](https://github.com/FlareZ123/obfs/actions/runs/44412614519) |
| H: named pure-identity source re-export | An already-proved pure identity helper is relayed only through explicit `export {identity as alias} from './module'`; only the helper summary propagates and owner provenance still comes from the existing proof | Positive one-hop/two-hop owner forwarding; helper `.toString()` observation and reflected/opaque owner-result use refuse | [Pre-proof behavioral red](https://github.com/FlareZ123/obfs/actions/runs/44412777302), [clean rebased full green on both OSes](https://github.com/FlareZ123/obfs/actions/runs/44413761594) |
| I: anonymous default-export record owner | Exactly one anonymous default owner is a safe literal record or an already-proved pure single-use object factory; consumers use only direct default imports and the existing ownership proof. Same-producer immutable computed keys must initialize before the default owner; foreign verified keys require an acyclic graph | Nonzero direct-import rewrite yield across literals, aliases/identity forwarding, multiple importers and pure factories; namespace/reexport/reflection/opaque-consumer/effectful-factory cases refuse | [Focused Ubuntu/Windows proof 44420377288](https://github.com/FlareZ123/obfs/actions/runs/44420377288), [full validation 44420384051](https://github.com/FlareZ123/obfs/actions/runs/44420384051), [intermediate evidence](../im-results/cross-default-export-properties-2026-11-18.md) |

| J: source-ordered immutable imported-identity relays | A uniquely bound stable pure one-parameter ESM identity imported by name (possibly through a source-explicit named identity reexport) is assigned to a unique top-level immutable `const`, optionally forwarded through further earlier-declared unique top-level `const` aliases; only proved direct calls may consume the private owner | Three initial and two transitive nonvacuous positive fixtures rewrite **2/2** protected own keys, unsupported invocation/reflection/escape negatives stay **0**; 64 deterministic positive chains and 64 unsafe chains match exact Node ESM stdout, the named identity reexport preserves 2/2 fields while export-star refuses, with Chrome 157 parity and an ordinary-esbuild same-source cost control | [One-hop preproof red](https://github.com/FlareZ123/obfs/actions/runs/44944368263), [transitive preproof red](https://github.com/FlareZ123/obfs/actions/runs/44945100969), [34/34 transitive green](https://github.com/FlareZ123/obfs/actions/runs/44945175055), [128-case fuzz green](https://github.com/FlareZ123/obfs/actions/runs/44945351340), [Chrome parity green](https://github.com/FlareZ123/obfs/actions/runs/44944930019), [named ESM reexport 41/41 green](https://github.com/FlareZ123/obfs/actions/runs/44946683013), [intermediate evidence](../im-results/cross-file-imported-identity-const-alias-2026-11-21.md) |

**Reproducibility:** the protected-work regression source is `test/closed-record-visible-reflect-overwrite.test.js` and the distinct intact/modified application probes are under `test/application-challenge.test.js`, `test/cross-file-safe-record-read.test.js`, `test/verified-record-browser.js` and `sims/application-challenge-refusal-yield.js`. The manual source-pinned workflows are `.github/workflows/manual-application-challenge.yml` and `.github/workflows/manual-validation.yml`. They do not trigger per commit.

Do **not** count a 0/2 safely refused original graph as successful property protection; do **not** count the separately edited 2/2 positive as transformations of the original. An excellent semantic parity rate with no transformed protected work cannot establish security improvement.

## 4. Current bounded scanner strategy

Three merged proof guard increments, [PR #24](https://github.com/FlareZ123/obfs/pull/24), [PR #25](https://github.com/FlareZ123/obfs/pull/25), [PR #26](https://github.com/FlareZ123/obfs/pull/26), demonstrate a practical source-visible intrinsic-boundary problem:

- Direct native `Object.getOwnPropertyDescriptor`, `Object.getOwnPropertyDescriptors`, and `Reflect.get` acquisition, captured accessor method aliases, and a selection of host containers can make global reflector methods mutable.
- A known sensitive string selector `Reflect` or `Object` is unsafe even through an opaque receiver. Checking only for a syntactically known `globalThis` receiver misses proxied or returned aliases.
- A *uniquely bound top-level immutable literal string* selector can be proven without treating all computed selectors as unrelated. Unknown dynamic keys must fail closed unless a stronger provenance proof is available.
- A **known unrelated string literal** need not force refusal merely because a descriptor API exists somewhere in the graph. This is a coverage optimization subject to the realm/effect assumptions above.
- A descriptor lookup on a Proxy may execute an arbitrary `getOwnPropertyDescriptor` handler **even for a statically unrelated selector**. The bounded scanner now refuses nonempty or unproved source-visible Proxy handler construction while retaining an explicitly empty literal handler `{}` under ordinary/stable realm assumptions. This is a syntactic veto and cannot establish general host-effect closure.

No general JS side-effect analysis, complete alias lattice, or source/environment closure follows from these syntactic conditions. Runtime function returns, Proxy traps, altered prototypes, cross-realm globals, and external loaders can invalidate apparently unrelated reads. When their safety cannot be proved, the appropriate action is retaining the original property.

## 4.1. Named ESM immutable-string relay: accepted only with acyclic provenance

The immutable computed-key lane can now propagate a uniquely bound, top-level
`const` string across explicit named ESM *source reexports* such as
`export {key as lookup} from './keys.mjs'`. The fact propagated is the string
value used by existing provenance and function-source-observation checks. The
existing closed-world owner proof still controls whether a property may be
renamed. Cross-module computed-key folding separately requires an acyclic
static-import/reexport graph; source metadata alone never establishes runtime
initialization order.

The implementation in `src/cross-properties.js` reaches a monotone fixed
point for multi-hop explicit named relays, regardless of input-file order.
It excludes export-star, mutable `let` bindings, unknown origins, and
noncanonical specifiers containing query, percent or escape notation. Cyclic
early-TDZ graphs and keys that expose `Function#toString` remain negative
cases. This is **one more supported behavior-preserving ESM shape** under the
documented graph/host assumptions, with no claim of client secrecy or
superiority to source-only reconstruction.

Seven source-pinned tests in `test/imported-constant-computed-key.test.js`
include one/two-hop real positive renames plus five conservative negative
families. The [unmodified-main red control](https://github.com/FlareZ123/obfs/actions/runs/44982753767)
at `ed201b96ee9fd9ca4ec3aa41cf50da8b41facece` failed **exactly
the two positive rename-count assertions** (0 versus expected 1) on Ubuntu
and Windows; 39 other tests in that file passed. The
[rebased-main candidate](https://github.com/FlareZ123/obfs/actions/runs/44982712543)
at `32b437967eac77e8b67cb92b250f6488a090311e` passed on both
platforms with those actual renames, original/generated Node ESM stdout parity,
the source-reader regression suite, and strict JSDoc checks. The production
source at commit `ac4a81892bcb73370aff824058f0b5c95361664c` has
the **same** compiler blob as the tested candidate. The seven tests entered
main at `92373e29b315711ab9015f80fdd8d8ffd9740f6b`.

These tests are intentionally small closed ESM graphs. General source-shape
compatibility still requires independent application, browser and adversarial
measurement; the baseline comparison establishes only newly admitted positive
work and no proven reverse-engineering resistance. The full validation suite
and current outcome are tracked in
[the intermediate integration record](../im-results/immutable-string-reexport-integration-2026-11-22.md).

## 5. What qualifies as future progress

For a property-proof extension, provide a **frozen unchanged positive application** with nonzero actual protected key rewrites and a **frozen hostile negative**, then demonstrate correct original/generated behavior on both, across Node and Chromium where applicable. Add a source-only attacker reproduction and measure protected operation overhead independently of any zero-transformation controls. Record exact SHA and run IDs.

Prefer a reusable receiver/alias/effect representation over endless special-casing of individual spellings. A future trusted-host declaration must be explicit, versioned, testable and distinguishable from the weaker `closedWorld` source-graph hint. A true anti-cloning boundary for SCO requires server-private computation and genuine server authorization, with unlimited-query online-relay limitations tested independently. COO and SNO cannot use their attacker-controlled runtimes as a cryptographic secret boundary.

No general-purpose anti-tamper, function-source secrecy, or strong obfuscation security result is asserted here.


## 22 November 2026: opaque owner transport, reflection and browser host APIs

The [source-pinned Node and browser parity report](../im-results/cross-file-opaque-api-parity-2026-11-22.md)
adds 20 named ESM API/reflection cases and a 56-graph deterministic
interprocedural transport/observer matrix, with actual positive
imported-key rewrite controls. It also adds nine real Chromium fixtures
to the existing imported-key browser suite. The relevant focused
Ubuntu/Windows Node jobs and full Chromium CSP workflow passed at
their explicitly recorded, **distinct** immutable source revisions.

These tests reinforce the proof envelope: an owner transported through
an array, record, Map, Set, Promise, rest parameter, Proxy, WeakRef,
external callback, or serialized clone can acquire observable key
spelling. A syntactically closed graph that cannot establish
non-observation should preserve the original property name. The
browser test retains existing six positive transformed fixtures,
while the additional reflection cases conservatively decline to
rewrite. No hostile-runtime security, full-application performance
or universal property-safety result follows from this finite corpus.


## 26 November 2026: top-level native-bound target extension (experimental)

The [native-bound private-target report](../im-results/agent1-native-bound-target-proof-2026-11-26.md)
documents a narrow extension for a non-exported callable binding whose
complete source-visible use set consists of top-level, noncomputed,
nonoptional `target.bind(null)` calls. The bound wrapper may be exported;
the target binding itself may not be exported.

Admission additionally requires `closedWorld:true`, a fully supplied
source-visible JavaScript graph, in-graph static imports, no unresolved
CommonJS requires, no opaque calls other than the literal-null bind sites,
no dynamic computed member paths, no reflection/prototype/global capability
surface, no getter/setter/method/class or other runtime-effect constructs
currently rejected by the lexical gate, and no unresolved ambient references
except immutable language constants and the CommonJS `module.exports`
publication write. Parameter-derived host receivers and aliases are refused.
The CommonJS exception is write-only; reading back `module.exports` is not
admitted.

This is a conservative rewrite-eligibility grammar, not a general JavaScript
effect proof. The top-level-only restriction prevents in-graph calls from
creating later bound wrappers after an exported target has executed. It may
reject otherwise benign code; widening it requires a more precise receiver
and effect analysis plus new hostile negative fixtures.

A hostile pre-import preloader can still intercept `Function.prototype.bind`
and capture the actual target function object and its **transformed** source.
The extension improves property-rewrite coverage; it does not provide source
secrecy, tamper resistance against a runtime controller, or an advantage over
ordinary property-mangled minification. Full manual-validation run
`45805807618` passed on Ubuntu and Windows, with the real Chromium gates
passing on Ubuntu. This remains an experimental intermediate result, not an
established result or release clearance; see the intermediate report for the
skipped anti-LLM A/B step and remaining review requirements.
