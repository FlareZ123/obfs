# Native WeakMap Function#bind origin reconstruction: 20-form independent falsifier

**Agent 3, 2026-11-28. Intermediate source-compatibility finding, not a universal language theorem or a release decision.**

## Exact reproducibility

Test-only branch `agent3/native-bind-20shape-metamorphic-audit-20261128`, exact source SHA `164d0ab60fbac327c5541fb92dc09e134dd97a1c`. It adds only `test/agent3-native-bind-20shape-scanner.test.js` to the earlier component-root alias source donor `b7da938848220f37aaf8014841253548e77dda4e`. Invocation: `node --test test/agent3-native-bind-20shape-scanner.test.js`. Node 22.23.4 CI. [Focused run 46113471439](https://github.com/FlareZ123/obfs/actions/runs/46113471439) originally failed in Ubuntu and macOS; Windows is separately tracked as it finishes.

For each of 20 syntax variants, the fixture builds a constructible function using the real JavaScript runtime, confirms `Object.getPrototypeOf(new C())===WeakMap.prototype`, then separately asks `hasWeakMapPrototypeExposure(parse(source,'module'))`. A second matching control replaces `WeakMap` by an independently declared ordinary class and demands **negative scanner result** to guard against a vacuous `always true` veto.

**Initial Ubuntu result:** 40 test cases total, **25 pass / 15 fail**. All 15 failures are **false-safe source analysis of a native constructible WeakMap**; none of 20 ordinary counterpart controls failed, and all 20 cases were independently confirmed to construct native WeakMap in actual Node runtime. The 5 passing native-WeakMap cases include the existing direct bind and initial Reflect.apply shapes. Failure cases:

| Category | Native constructor provenance missed |
| --- | --- |
| Local aliases / IIFE | `const F=Function` returned from arrow; transitive local binder |
| Reflective intrinsic lookup | `Reflect.get(Function.prototype,"bind")`; `Object.getOwnPropertyDescriptor(Function.prototype,"bind").value` |
| Prototype inheritance | `Object.getPrototypeOf(function f(){}).bind` |
| Higher-order intrinsic application | `Reflect.apply(Reflect.apply,Reflect,[...])`, `Function.prototype.call/apply` invoking native bind |
| Prebound native callable | `Function.prototype.bind.bind(WeakMap)`, `Function.prototype.call.bind(Function.prototype.bind)` |
| Opaque constructor-value carriers | transparent `Proxy`, array index, `Map.get`, direct identity-parameter function, function-return expression |

Each test string, expected native oracle, actual production scanner call, and 20 ordinary controls are retained in the committed test file and workflow logs. The observed unsafe case is *misclassification*: if emitted field/identifier changes occur in a sibling Storage/WeakMap function-source observable graph, the host can see changed source despite preserved numeric return. Actual cross-file semantic mismatch was proven separately for the initial Reflect.apply variant on Node and Chrome in [the matched red/green report](agent3-weakmap-reflect-apply-constructor-source-2026-11-28.md). Not all 15 new variants have been individually run through the cross-file obfuscation pipeline.

## Architecture implication

The production scanner's syntax-directed recognizers for direct native binder calls improve specific compatibility cases but are not a sound general origin analysis: equivalent values travel through calls, descriptors, constructor objects, arrays, maps, proxies, and imported bindings. Patching syntax alone scales poorly and can overrefuse unrelated ordinary code. A better candidate is a conservative compositional may-effect graph, with node types for constructor brands, intrinsic handles, bind/apply receiver identities, property stores/loads, opaque calls, and source-observer sink reachable values. Keep proof failure conservative but maintain an independently measured positive property/binding yield floor. A finite negative test neither establishes impossibility of stronger analysis nor legitimizes blanket no-transform output.

**Scope:** 20 finite public source shapes; no dynamic Proxy traps, arbitrary getters/eval, fabricated imported module state, or every possible JS builtin override. Names and native source strings used in this fixture are public, not private hidden-solution benchmarks.
