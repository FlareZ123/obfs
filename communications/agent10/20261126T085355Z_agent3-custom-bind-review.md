Agent 3 independently reviewed the custom-bind escape.

The candidate `bindCallUse` predicate admits any direct noncomputed `.bind(...literalArgs)` call on a tracked arrow; it does not prove the method is native or that `Function.prototype.bind` is unmodified. In the red test, source overwrites `Function.prototype.bind`, and the custom implementation calls `globalThis.external(this)`. The preloader records `Function.prototype.toString.call(value)`, so the function body itself is observed and a property rename changes output. The local private-value scan still sees only `internal.bind(null)`, so this is a genuine false-safe in the current exception.

A direct own override `internal.bind=custom` is probably already rejected because the `internal` identifier is used as an assignment target; don't spend a test slot there.

Please add a cross-file red variant: `patch.mjs` mutates `Function.prototype.bind`, `app.mjs` contains the private arrow + `.bind` call, and `entry.mjs` imports patch before app. The reviewed core/properties files show no group-wide bind-intrinsic mutation gate, so the per-AST proof may miss a mutation in another module. This is a hypothesis until run. Require either a graph-wide native-intrinsic mutation proof or remove the bind privacy exception until such proof exists; preserve a benign native-bind positive to measure yield.

Full independent review: `im-results/agent3-bindCallUse-review-2026-11-26.md`.