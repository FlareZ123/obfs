# Closed-world property transformation: proof envelope and release lanes

**Research state: 16 November 2026.** This document describes what the experimental property compiler has checked and what remains unproved. It is an engineering acceptance contract, not a theorem of soundness or obfuscation security. See [threat-model boundaries](SECURITY.md), the [research index](../results/README.md), and the executable source under `src/cross-properties.js`, `src/properties.js`.

## 1. Scope of the declared program

`closedWorld:true` is a *claim by the integrator* that the supplied ESM modules and their statically resolved imports form the complete relevant distribution unit. The flag cannot itself establish that all consumers or behavioral dependencies of those modules are known.

The compiler's bounded proof can reason about direct named ESM imports/exports, certain immutable identity/reader wrappers, literal record ownership, and a restricted grammar of statically keyed accesses. The compiler deliberately declines many ambiguous uses, such as opaque imports, reflection, escapes, unknown calls, runtime source observers, or dynamic property keys. For arbitrary JS, especially dynamic importers and cross-realm callbacks, the static AST is only a partial observation.

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
| B: native positive | Separate, source-observer-free, own-key-only graph and unrelated immutable descriptor selectors | Exact outputs and **greater than zero** actual renamed protected own keys | One-field positive in descriptor gates; distinct six-module application retains **2/2** rewrites |
| C: inherited dynamic loader | Missing record field resolves to inherited host Function constructor | Refusal where native parity cannot be proven | Retained in `test/cross-file-safe-record-read.test.js` and the application gate |
| D: hostile runtime | Outside-declared preloader, custom import map, instrumentation, source-only copy attack | Attack success scored separately from compiler semantic correctness | Public COO fields are recoverable; the frozen source-observing six-module original remains **0/2** renamed |
| E: cost and compatibility | Node22 Ubuntu/Windows, Chromium, startup and sustained workload | Pinned original/generated output parity, measured protected work and runtime ratios | Selected full gates [43862920232](https://github.com/FlareZ123/obfs/actions/runs/43862920232), [43865027728](https://github.com/FlareZ123/obfs/actions/runs/43865027728), [43866546917](https://github.com/FlareZ123/obfs/actions/runs/43866546917) passed; no universal 2.5× guarantee |

**Reproducibility:** the protected-work regression source is `test/closed-record-visible-reflect-overwrite.test.js` and the distinct intact/modified application probes are under `test/application-challenge.test.js`, `test/cross-file-safe-record-read.test.js`, `test/verified-record-browser.js` and `sims/application-challenge-refusal-yield.js`. The manual source-pinned workflows are `.github/workflows/manual-application-challenge.yml` and `.github/workflows/manual-validation.yml`. They do not trigger per commit.

Do **not** count a 0/2 safely refused original graph as successful property protection; do **not** count the separately edited 2/2 positive as transformations of the original. An excellent semantic parity rate with no transformed protected work cannot establish security improvement.

## 4. Current bounded scanner strategy

Three merged proof guard increments, [PR #24](https://github.com/FlareZ123/obfs/pull/24), [PR #25](https://github.com/FlareZ123/obfs/pull/25), [PR #26](https://github.com/FlareZ123/obfs/pull/26), demonstrate a practical source-visible intrinsic-boundary problem:

- Direct native `Object.getOwnPropertyDescriptor`, `Object.getOwnPropertyDescriptors`, and `Reflect.get` acquisition, captured accessor method aliases, and a selection of host containers can make global reflector methods mutable.
- A known sensitive string selector `Reflect` or `Object` is unsafe even through an opaque receiver. Checking only for a syntactically known `globalThis` receiver misses proxied or returned aliases.
- A *uniquely bound top-level immutable literal string* selector can be proven without treating all computed selectors as unrelated. Unknown dynamic keys must fail closed unless a stronger provenance proof is available.
- A **known unrelated string literal** need not force refusal merely because a descriptor API exists somewhere in the graph. This is a coverage optimization subject to the realm/effect assumptions above.

No general JS side-effect analysis, complete alias lattice, or source/environment closure follows from these syntactic conditions. Runtime function returns, Proxy traps, altered prototypes, cross-realm globals, and external loaders can invalidate apparently unrelated reads. When their safety cannot be proved, the appropriate action is retaining the original property.

## 5. What qualifies as future progress

For a property-proof extension, provide a **frozen unchanged positive application** with nonzero actual protected key rewrites and a **frozen hostile negative**, then demonstrate correct original/generated behavior on both, across Node and Chromium where applicable. Add a source-only attacker reproduction and measure protected operation overhead independently of any zero-transformation controls. Record exact SHA and run IDs.

Prefer a reusable receiver/alias/effect representation over endless special-casing of individual spellings. A future trusted-host declaration must be explicit, versioned, testable and distinguishable from the weaker `closedWorld` source-graph hint. A true anti-cloning boundary for SCO requires server-private computation and genuine server authorization, with unlimited-query online-relay limitations tested independently. COO and SNO cannot use their attacker-controlled runtimes as a cryptographic secret boundary.

No general-purpose anti-tamper, function-source secrecy, or strong obfuscation security result is asserted here.
