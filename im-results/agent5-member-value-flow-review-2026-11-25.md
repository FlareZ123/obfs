# Agent 5: Source-level review of property-specific member-value flow

**Date:** 2026-11-25T10:29:37.044Z  
**Classification:** Intermediate review / unexecuted counterexample hypotheses. Not an established result.  
**Candidate branch:** `agent10/agent4-member-property-precision-prototype-20261125`  
**Candidate commit:** `03d2f3a6e02817be2df26acf2e5e8c318dd484ed`  
**Reviewed source blob:** `workplace/agent9-ambient-call-bindingid.js` @ `3321e5abdcc3be8e65a02ba4fe10fd205b3d4c75` (1,548 lines)  
**Reviewed test blob:** `test/agent4-class-field-escape-precision.test.js` @ `f1bcf4636d53266eae76029ff3a7a6ae228668e2` (490 lines; 33 test cases)

## Summary

The donor adds a property-specific resolver, `callableNodesForMemberValue(value, propertyKey)`, that can follow a statically known property through local assignments, direct `new Local()`, object/array literals, conditionals, local function/method factory returns, and `await`. The generic resolver, `callableNodesForValue(value)`, is used by several value sinks and by the dynamic-key fallback, but its supported expression set is materially narrower.

The likely risk is not that the static-property resolver lacks factory-return support; it is that other paths fall back to the generic resolver and lose the same locally known values. Four red-first hypotheses follow. None has been executed by this reviewer.

## Source observations

### 1. Static-property path versus dynamic-key path

- `callableNodesForMemberValue` starts at line 728.
- It handles local factory `CallExpression` return values at lines 794–823 and `AwaitExpression` at lines 825–826.
- Its comment at lines 721–722 says dynamic keys deliberately fall back to all callables.
- The generic `callableNodesForValue` starts at line 831. Its only `CallExpression` case is `.bind()` at lines 876–878; it has no `AwaitExpression` case.
- For a dynamic member key, the member-expression fast path at lines 911–918 calls `callableNodesForValue(candidate)` for each known receiver assignment. A local factory call or awaited local factory call is therefore not resolved by that fallback.

**Proposed paired red-first test**

```js
let owner, key;
function hidden() { return 1; }
function leak() { external(owner[key]); }
class Local { callback = hidden; }
const factory = { create: async () => new Local() };
async function entry() {
  owner = await factory.create();
  key = 'callback';
  leak();
}
module.exports = entry;
```

Compare this with the same source using `external(owner.callback)`. The static property path appears able to resolve the awaited factory return; the dynamic key must conservatively retain the same callable because the runtime key selects `callback`. A synchronous `factory.create: () => new Local()` variant isolates missing generic CallExpression handling from AwaitExpression handling.

### 2. Destructuring a local factory result

Object/array pattern handling at lines 1370–1375 calls `markCallableValuesHeld(parent.init)` or `markCallableValuesHeld(parent.right)`. That delegates to the generic value resolver. A pattern declarator is not a simple Identifier declarator, so the destructured binding itself is not recorded in the ordinary identifier initializer map.

**Proposed paired red-first test**

```js
function hidden() { return 1; }
class Local { callback = hidden; }
function create() { return new Local(); }
function entry() {
  const { callback } = create();
  external(callback);
}
module.exports = entry;
```

Compare with `const { callback } = new Local()`. The direct-new control appears supported; the local-factory variant appears to pass a CallExpression to the generic resolver, which does not resolve local factory returns.

### 3. Nested static member chain after a factory result

`callableNodesForMemberValue` has no explicit `MemberExpression` case; it falls through to `callableNodesForValue` at line 827. The generic member-expression fast path at lines 892–920 handles a receiver that is itself an Identifier. For a nested chain, the fallback at lines 935–950 walks identifiers and uses `initializerForBinding`; it does not consult the mutable receiver's `bindingValueExpressions` and only recursively inspects a restricted set of initializer node types.

**Proposed red-first test**

```js
let holder;
function hidden() { return 1; }
class Local { callback = hidden; }
function create() {
  return { nested: { current: new Local() } };
}
function leak() {
  external(holder.nested.current.callback);
}
function entry() {
  holder = create();
  leak();
}
module.exports = entry;
```

Compare with direct literal initialization of `holder`, plus single-level and two-level member-read controls. The combination of a known factory result and a nested receiver chain appears to lose the assigned value.

### 4. Statically named member constructor

Both NewExpression paths appear restricted to Identifier callees: `callableNodesForMemberValue` lines 746–754 and `callableNodesForValue` lines 879–891. A statically known class stored in a local namespace object is not resolved by these branches.

**Proposed red-first test**

```js
let owner;
function hidden() { return 1; }
class Local { callback = hidden; }
const namespace = { Local };
function leak() { external(owner.callback); }
function entry() {
  owner = new namespace.Local();
  leak();
}
module.exports = entry;
```

Compare with `owner = new Local()`. If member-constructor flow is intentionally unsupported, the affected callable should be conservatively treated as unknown/unsafe rather than silently omitted from the host-held set.

## Existing matrix and scope

The 33-case class-field matrix covers many important controls, including direct class instances, direct dynamic-key reads, local record aliases, static factory returns, object-method/arrow factory returns, and sibling-field precision. The gaps above are *combinations* of those shapes: factory return plus dynamic key; factory return plus destructuring; factory return plus nested chain; and member-constructor creation.

This is a donor-only analysis. The branch diff against main contains no production `src/` changes. Agent 3 has independently confirmed a separate mutable-captured-lexical-binding false-safe in this donor, which already blocks integration until fixed and revalidated.

## Validation status

- No new tests in this report were executed by Agent 5.
- Donor full run [45591493304](https://github.com/FlareZ123/obfs/actions/runs/45591493304) is RED. Current-main full run [45581201445](https://github.com/FlareZ123/obfs/actions/runs/45581201445) has the exact same 12 failing test names on both Ubuntu and Windows; a programmatic comparison of both `FAILED_TEST_INDEX` arrays found identical sets on both platforms. This shows no donor-specific full-suite failure at those pins, but it is not a green acceptance result and does not replace a current-main integration run.
- The donor's failure set includes the existing SCO dense-hybrid test, whose current compiler rejection is the selective-SCO admission policy. This is separate from the member-value review.

## Recommended next action

Before any implementation change, add the smallest red-first paired controls above to the existing donor bundle and verify the expected host-held result. A likely repair direction is to share a single conservative value-flow core between property-specific and generic sinks: local CallExpression return values, AwaitExpression unwrapping, nested MemberExpression receivers, and statically resolvable member constructors should not be modeled in only one branch. Unknown/imported calls, reflection, proxies, and unproved dynamic flows must remain fail-closed.

Do not open another candidate branch or promote this report to `results/`. Keep the donor research-only until all known false-safes are closed, the existing full gate passes on the exact candidate, and independent review is complete. The repository-wide strong-protection decision remains **RELEASE-BLOCKED**.
