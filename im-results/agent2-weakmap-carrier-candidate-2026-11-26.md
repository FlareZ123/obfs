# WeakMap carrier candidate extension (intermediate)

**Status:** intermediate research only; not merged, not a release result.  
**Working branch:** `agent2/weakmap-carrier-fix-20261126`  
**Base:** Agent 1 candidate `agent1/weakmap-exported-container-review-20261126`, source head `dd9f5783`.  
**Primary implementation:** `src/ast.js`  
**Combined focused gate:** `test/agent2-weakmap-carrier-regression-suite.test.js`

## Motivation and reproduced gaps

The Agent 1 carrier candidate had a passing 11-case subset but broader challenge work identified paths where a WeakMap can reach a prototype-observing call without the group guard proving exposure. The reproduced gaps included:

- A dynamic computed read from an array/object that contains a WeakMap.
- Static class fields and static-block writes stored on a class constructor and then reached through a class alias.
- A class static or instance getter returning a WeakMap, an object-literal getter, and a Proxy `get` trap returning a WeakMap.
- A local class extending `globalThis.WeakMap`, where the native prototype is recovered through one or more `Object.getPrototypeOf` steps and identifier aliases.
- A private WeakMap passed only to a narrow, local read-only helper was over-tainted by the previous “any call argument” rule, suppressing otherwise-safe identifier rewrites.

## Candidate changes

The branch extends `hasWeakMapPrototypeExposure` in `src/ast.js`:

1. **Computed carrier reads:** if a member key is dynamic and the base carrier may contain a WeakMap, return a conservative maybe-WeakMap value rather than `carrierOther`.
2. **Class static carriers:** model static field values and static-block writes as properties on a class-owned carrier; preserve aliases to the class constructor. Unknown computed static writes fail closed.
3. **Accessor carriers:** summarize WeakMap-returning object/class getters and direct Proxy `get` handler methods as carrier owners. Alias resolution follows the owner.
4. **Subclass prototype ancestry:** map class names (including named class expressions and their variable binding) to their WeakMap-subclass parent. Track the exact prototype value through `Object.getPrototypeOf`/Reflect equivalents and simple identifier assignments. A read of an intermediate parent prototype is not itself mislabeled as native WeakMap.prototype; only the step that reaches the native prototype is treated as exposure.
5. **Bounded private-reader proof:** suppress the call-argument escape only for a top-level, non-exported FunctionDeclaration with one identifier parameter and a one-statement body that returns `parameter.get(literal)`, called directly at top level with a top-level `const` initialized by `new WeakMap()`. The WeakMap binding must have exactly that one use, and the reader binding must not be reassigned or aliased. All other call shapes remain fail-closed.

The local-reader rule is intentionally much narrower than the general private-reader proof in `src/properties.js`; it is not a general function summary.

## Validation

| Run | Scope | Result |
|---|---|---|
| [45878101565](https://github.com/FlareZ123/obfs/actions/runs/45878101565) | Initial carrier suite (15 tests) | Passed on Ubuntu, macOS, Windows; strict JSDoc passed |
| [45878095782](https://github.com/FlareZ123/obfs/actions/runs/45878095782) | Initial subclass-parent prototype case | Passed on Ubuntu, macOS, Windows; strict JSDoc passed |
| [45880357883](https://github.com/FlareZ123/obfs/actions/runs/45880357883) | Combined 50-test gate, including accessors, Proxy `get`, local reader, cross-file modes | 50/50 tests passed on all three OS; typecheck failed only on three unannotated callback parameters in the new local-reader proof |
| [45880578777](https://github.com/FlareZ123/obfs/actions/runs/45880578777) | Same combined 50-test gate after JSDoc annotations and subclass-alias refinements | In progress when this report was written |

The earlier [45879827339](https://github.com/FlareZ123/obfs/actions/runs/45879827339) run exposed a bad test assumption: `Object.getPrototypeOf(Child.prototype)` returns the parent class prototype when `Child extends Parent`, not the native WeakMap prototype. The fixture was corrected to follow the prototype chain through an intermediate alias. The implementation now models that depth and the negative control ensures the intermediate parent prototype alone is not treated as native WeakMap.prototype.

## Outstanding risks and next actions

- Complete and record run 45880578777. If green, run the full manual validation workflow on the frozen branch head, not only focused tests.
- Challenge imported superclass ancestry and subclasses exported from another module. Current subclass-parent tracking is per parsed file; imported class inheritance is not yet a proven cross-file summary.
- Add adversarial cases for `Object.defineProperty` getter/setter descriptors, Proxy handler aliases/other traps, accessor writes, nested closures, dynamic reflection, and same-named bindings in different lexical scopes.
- Challenge the local-reader exemption with method shadowing, nested scopes, aliases, reassignment, identity forwarding, side effects, and additional uses. Its current shape is deliberately exact; do not broaden without negative controls.
- Benchmark obfuscator-side AST analysis on large module graphs and measure compile-time overhead. No performance or 2.5x runtime-budget claim is established by these focused tests.
- Re-run the relevant COO/SCO/SNO cross-file tests after any further changes. The current aggregate includes those tests, but it does not establish full mode compatibility.
- Keep the candidate isolated from `main` and PR #382 pending adversarial review and full validation. No static-reconstruction, dynamic-extraction, integrity-bypass, or domain-locking resistance claim follows from this guard alone.

## Coordination

Review requests were sent to Agents 1, 3, and 4 in `communications/agent1/`, `communications/agent3/`, and `communications/agent4/` at 19:02Z. Await and independently validate their challenges.
