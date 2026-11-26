# WeakMap container-flow source-observation audit

**Date:** 2026-11-26  
**Researcher:** Agent 3  
**Status:** Intermediate adversarial evidence; not a production fix or release approval.

## Scope and source pin

This audit independently challenges the WeakMap prototype exposure detector in Agent 10's donor source at commit `c33773151acf0e8d5df1fb548085440ae4b84b76` (`src/ast.js` blob `87b0ae498f6928ccdb758b37ae14f19e22938bcb`). The test-only branch is `agent3/weakmap-container-alias-audit-20261126`; validated test commit is `30e946d4d73334d134031d8fa9c718e4cc447ca8`.

The audit isolates a source-observation false-safe: a WeakMap instance is stored in a local object/array container, recovered through a property/index or destructuring binding, and passed to a prototype getter. The prototype's `.set` method is replaced with a wrapper that converts a later stored function to a string through `document.title`. The Storage override's backing WeakMap remains local; the mutation reaches its shared prototype through the container-carried instance.

## Reproduction

Focused manual-validation run [45860451899](https://github.com/FlareZ123/obfs/actions/runs/45860451899) passed on Ubuntu, Windows, and macOS with Node 22.23.4. All 10 tests passed, including a direct-instance positive control. Strict project JSDoc, external JSDoc, and paired-budget JSDoc passed on all three platforms. The full Node 22 job was intentionally skipped by the focused-test workflow.

Nine container forms reproduce the false-safe:

1. `{ instance: new WeakMap() }` followed by `carrier.instance`.
2. `[new WeakMap()]` followed by `carrier[0]`.
3. Nested object member `carrier.nested.instance`.
4. Object destructuring `const { instance: map } = carrier`.
5. Array destructuring `const [map] = carrier`.
6. Member assignment `carrier.instance = new WeakMap()`.
7. Container alias `const alias = carrier`, then `alias.instance`.
8. Spread copy `const carrier = { ...inner }`.
9. Static computed member `carrier['instance']`.

For each negative case, the detector returned `observed=false`; the compiler renamed 5–7 bindings, including `privateLocal` in `inspect`. Native and emitted ordinary return values remained equal (`{ value: 29, independent: 7 }`), but the native captured function source contained `privateLocal` while emitted source contained the generated identifier (for example, `_vca34670a76d3`). This is a source-observation mismatch, not an ordinary return-value mismatch.

The direct-instance control uses `Object.getPrototypeOf(new WeakMap())` with the same Storage/DOMString source sink and is detected. This distinguishes the container-flow gap from a general inability to detect the direct-instance pattern.

## Mechanism and limitation

The donor's `isWeakMapInstance` recognizes a `NewExpression` or an identifier already placed in `weakMapInstances`. Identifier aliases are added when a variable initializer or assignment is itself recognized as a WeakMap instance. Object/array initializers are not summarized as containers, and member reads/destructuring do not resolve to the contained instance. The separate nested-`NewExpression` check only catches construction syntactically inside a call argument; a constructor stored in a preceding object/array initializer is outside that argument span.

Consequently, `getPrototype.call(carrier.instance)` is not recognized as receiving a WeakMap instance. The same failure occurs through nested members, destructuring, aliases, assignment, spread, and static computed access.

## Recommended proof boundary

Use a bounded abstract-value summary for WeakMap instances and containers, rather than extending identifier-only alias sets ad hoc:

- Track `WeakMapInstance`, object/array containers with known static property/index values, and aliases.
- Propagate through static member reads, destructuring, member writes, and object/array spread.
- Resolve the argument to `Object.getPrototypeOf`, `Reflect.getPrototypeOf`, or recognized prototype-getter aliases against that summary.
- Treat dynamic keys, unknown writes, opaque calls, or unresolved container mutation as unknown; fail closed when an unknown container may carry a WeakMap into a prototype-exposure path.
- Retain explicit precision controls for local private WeakMaps that neither expose their prototype nor escape.

The nine fixtures are research falsifiers, not an exhaustive JavaScript points-to proof. This run covers one-file COO under Node-host shims; it does not establish browser/Chromium, SCO, SNO, cross-file, or full-suite behavior. A separate cross-file COO/SCO/SNO mode matrix is in progress.

## Artifacts

- Test: `test/agent3-weakmap-container-alias-audit.test.js`
- Branch: `agent3/weakmap-container-alias-audit-20261126`
- Validated commit: `30e946d4d73334d134031d8fa9c718e4cc447ca8`
- Focused run: [45860451899](https://github.com/FlareZ123/obfs/actions/runs/45860451899)

## Cross-file and mode coverage

A second focused suite, `test/agent3-weakmap-container-crossfile-modes.test.js`, uses three ESM files: `mutate.mjs` creates and mutates the shared WeakMap prototype through an object-carried instance; `storage.mjs` owns the private Storage backing WeakMap and the source-observed function; `entry.mjs` imports the mutator before re-exporting the Storage entry. This checks the group-level scan rather than only a single AST.

Focused run [45860917341](https://github.com/FlareZ123/obfs/actions/runs/45860917341) passed 3/3 mode tests on Ubuntu, Windows, and macOS; strict project/external/paired-budget JSDoc passed on all three. The full Node 22 job was skipped by the focused workflow.

- COO: the Storage file received 4 identifier bindings. Runtime execution preserved ordinary return values but changed captured source from `privateLocal` to `_v3374bcfe8331`.
- SCO: the Storage file received identifier bindings; this run checked the compile-time metrics, not server execution.
- SNO: the Storage file received identifier bindings; this run checked the compile-time metrics, not server execution.

Thus the same group-level source-observer gate allowed the unsafe transformation in all three compile modes. The end-to-end source-capture witness is established here for COO only; SCO/SNO runtime execution remains untested.
