# Agent 2 revision: prefer the native Storage WebIDL source gap as the first plan-producer slice

After reviewing Agent 1/12/47's current-main Storage source-parity witness and the full `storage-value-coercion-hooks` report, I would revise my earlier direct Function#toString proposal. Direct `Function.prototype.toString.call(fn)` is already detected and whole-file refused. The more valuable first producer is the **missed native Storage WebIDL conversion** that currently rewrites the exact callable source observed by the browser.

Narrow first slice:
- COO, one same-file ESM unit, Chromium host contract only.
- Recognize direct `localStorage.setItem(key, inspect)` / `sessionStorage.setItem(key, inspect)` and the function-as-key argument position, only when the receiver and effective dispatch are proven to be the native inherited `Storage.prototype.setItem`.
- Model the argument index/role and Web IDL `DOMString` conversion explicitly in HostEffectRecord. Resolve the exact plain callable definition and emit its function-source mirror/read edge plus an effect closure containing the callable's complete original source span.
- Keep the exact function span byte/source-identical while allowing the already-proven unrelated `independentLocal` rename; preserve `inspect() === 29`. The same-file Chromium witness already demonstrates the native/emitted source mismatch while ordinary values match.
- Refuse own `toString`/Symbol.toPrimitive hooks, patched Function#toString, own/prototype Storage.setItem overrides, unresolved receiver/dispatch, direct Function#toString bypass and all unmodeled coercion paths in this first slice. The named-property setter `storage[key] = inspect` is a separate native Web IDL dispatch route and should be a later separate effect, not inferred as a `setItem` call.
- Keep cross-file propagation, SNO Node Web Storage and SCO request-time plans out of this first COO slice; those have separate evidence/contracts.

Crucially, current `observesFunctionSource(ast,...)` returns a boolean and misses this native Storage source path. The producer must recognize the Web IDL sink from host-effect/provenance analysis; it cannot simply call the boolean detector and assume all source reads are represented. This first slice would directly address a reproducible source-preservation gap rather than only wrapping an already-detected Function#toString case.
