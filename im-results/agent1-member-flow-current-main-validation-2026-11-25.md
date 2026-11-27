# Agent 1: current-main member-flow witness validation

**Date:** 2026-11-25  
**Classification:** Intermediate experimental evidence; not a production obfuscator result  
**Research branch:** `agent1/member-flow-current-main-20261125`  
**Branch base:** `3426d124c85ce5bbe856bcd442e6b74ba02b5e25` (main at branch creation)  
**Validated head:** `53f855caa019536ed7dd547947c4d0ce116f8b53`

## Scope and disposition

This work independently revalidated the Agent 1 call/receiver member-flow helper on a fresh branch based on current `main`, then imported the Agent 6 spread/overwrite falsifier matrix and Agent 10's expanded member-flow follow-up suite.

The helper remains under `workplace/`; no production `src/` or `bin/` code was changed. The work does **not** establish a production compiler vulnerability, a property-renaming yield improvement, cross-file soundness, hostile-runtime resistance, or a security advance. It is evidence about a research-only callable-effect/value-flow analyzer used to avoid unsafe transformation proofs.

## Red-first spread/overwrite finding

The initial current-main transplant at `70c4467721c78ebac627c2c055c36682336c0fd2` failed **7 of 19** spread/receiver cases in [run 45628877407](https://github.com/FlareZ123/obfs/actions/runs/45628877407). The failures were:

1. A later object spread can overwrite an earlier explicit property with a callable.
2. An array spread before a static index can shift a callable into that index.
3. A later unknown computed key can alias and overwrite a requested static key.
4. An unknown computed key can supply the requested property even without an earlier explicit key.
5. An unresolved array member call such as `at` can return a callable held by the receiver.
6. An array mutator return such as `pop` can expose a receiver-held callable.
7. An object-literal `__proto__` setter can make a prototype-provided callable reachable through a member read.

These were helper-level false negatives. The same matrix also contained positive controls for an earlier computed key shadowed by a later explicit key, an own property shadowing an inherited property, getter behavior, and spread-only properties.

## Corrections

In `workplace/agent9-ambient-call-bindingid.js`:

- Object member resolution now records the last explicit definition of the requested key. It includes later spreads and later unknown computed keys, but does not treat earlier spreads/computed keys as possible overwrites of a later explicit definition.
- Object-literal `__proto__` data-property setters are followed as prototype sources when no own property shadows the requested key.
- Array member resolution no longer trusts a fixed index when an earlier spread can shift the runtime position; it conservatively considers the spread and later candidates.
- If a member call's return cannot be resolved to a callable or a definitely primitive value, callable values held by the receiver are retained. Known primitive-returning local methods remain a precision control and do not retain unrelated callable siblings.

The correction deliberately prefers conservative retention over an unsupported exact-value claim.

## Reproducible validation

All runs used `.github/workflows/manual-validation.yml`, pinned to the exact commit shown below, and completed on both Ubuntu and Windows.

| Run | Exact head | Focused suite | Ubuntu / Windows result |
|---|---|---|---|
| [45629636066](https://github.com/FlareZ123/obfs/actions/runs/45629636066) | `c8eb732589d5128959415978aa9959e881a4e723` | `agent9-ambient-call-bindingid` | 44/44 passed |
| [45629644353](https://github.com/FlareZ123/obfs/actions/runs/45629644353) | `c8eb732589d5128959415978aa9959e881a4e723` | `agent9-mutable-factory-runtime-witness` | 17/17 passed |
| [45629654471](https://github.com/FlareZ123/obfs/actions/runs/45629654471) | `c8eb732589d5128959415978aa9959e881a4e723` | `agent6-member-flow-spread-override` | 19/19 passed |
| [45629756101](https://github.com/FlareZ123/obfs/actions/runs/45629756101) | `53f855caa019536ed7dd547947c4d0ce116f8b53` | `agent10-member-flow-followup` | 30 passed, 1 TODO, 0 failed |

The three earlier focused runs passed their project, external and paired-budget JSDoc checks on both platforms. The 31-test Agent 10 follow-up run also passed those checks on both platforms. Its one TODO is the unimplemented precision proof for proving an object remains private when mutated through a known local function parameter; it is not a passing test or evidence that the proof exists.

The Agent 10 suite also confirms the helper's conservative behavior for unknown constructors, Proxy construction, dynamic keys, `Reflect.get`, `Object.getOwnPropertyDescriptor`, direct eval, Function-constructor readers, optional chains, shared aliases, nested mutations, and returned/wrapped parameter flows.

## Production boundary and limitations

The current production code remains more conservative than this research helper:

- `src/properties.js`'s local literal-object candidate selection rejects spreads, methods/accessors, computed or non-own property names, duplicate keys, and reserved prototype-related names before attempting its local-object proof (around lines 1290–1320).
- `src/cross-properties.js`'s `inertFormalActualValue` rejects spread elements and non-data object properties in the cross-file formal/actual proof (around lines 2045–2075).
- Its exported object-candidate gate also rejects computed/shorthand properties and prototype-related keys (around lines 2580–2605).

Therefore these helper failures should not be presented as demonstrated current-main production false-safes. They show that the experimental helper itself needed a more complete property-value model and that the production proof gates remain deliberately closed around these cases.

The helper is single-file and does not establish cross-file alias/escape completeness. The Agent 10 private-mutator TODO remains open. No performance claim was measured. No obfuscator transformation, protected-work measurement, attacker comparison, or runtime-resistance experiment was performed.

## Coordination

Independent review requests were sent to Agent 6 (spread/computed-key/array/prototype semantics) and Agent 9 (call/receiver/runtime-source observation). Keep this helper and its test bundle separate from production and from PR #374 until independent review and any broader integration work are complete.

— Agent 1


## Independent review and expanded validation (14:35Z update)

Agent 9 independently reviewed the helper and found that block-scoped `ClassDeclaration` nodes were being treated as host-global roots. The root predicate was narrowed to `parent===ast`, so only Program-level class declarations are treated as classic-script global roots; block-scoped declarations are not promoted to globals merely because they are outside a function.

The correction and Agent 9's independent runtime-boundary suite were integrated into `agent1/member-flow-current-main-20261125`. Additional pinned validation on both Ubuntu and Windows:

- [45633685235](https://github.com/FlareZ123/obfs/actions/runs/45633685235): 14/14 Agent 9 runtime-boundary cases passed.
- [45633695541](https://github.com/FlareZ123/obfs/actions/runs/45633695541): 17/17 mutable-factory/call/receiver witnesses passed after the class-root correction.
- [45633706221](https://github.com/FlareZ123/obfs/actions/runs/45633706221): Agent 10 follow-up matrix remained 30 passed, 1 explicit private-mutator TODO, 0 failed.
- [45634284949](https://github.com/FlareZ123/obfs/actions/runs/45634284949): 3/3 production returned-factory source-observer tests passed across COO/SCO/SNO.
- [45634293336](https://github.com/FlareZ123/obfs/actions/runs/45634293336): the real-browser returned-factory source-observer witness passed.

All focused JSDoc checks passed. The production returned-factory tests demonstrate behavior preservation while a host extracts the *transformed* callback source through `Function.prototype.toString`; they do not demonstrate source secrecy. Function declaration names such as `hidden` and `helper` remain visible in the extracted source, a residual readability limitation.

The helper remains research-only and single-file. The private-mutator precision TODO remains open. No production `src/` or `bin/` changes were made by the helper branch, and no claim of cross-file soundness or security resistance is made.
