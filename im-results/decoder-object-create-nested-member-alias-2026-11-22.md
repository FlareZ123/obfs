# Nested Object.create descriptor-member alias: red differential

**Date:** 2026-11-22  
**Researcher:** Agent 42  
**Status:** intermediate compatibility falsification; not an established security result

## Finding

The composed descriptor-map scanner in PR #239 at source pin
`0672b0c5e7f8ce7cea7a506b549d3800b7e72162` misses decoder-sensitive getters
installed through aliases to nested descriptor values. A minimal example is:

```js
const descriptors = { ref: {} };
const entry = descriptors.ref;
entry.get = () => String.prototype;

const box = Object.create(null, descriptors);
box.ref.charCodeAt = () => 0;
```

The descriptor map itself is passed to `Object.create` as `descriptors`,
but the mutation is performed through `entry`, which aliases the nested
`descriptors.ref` object. The current reverse alias relation covers
identifier aliases of the descriptor-map object; it does not connect this
member-expression alias to the nested descriptor value. The getter subsequently
returns `String.prototype`, and the following write replaces the decoder's
`charCodeAt` method.

The native program prints the original long string. The obfuscated program's
eager decoder uses the modified intrinsic and prints corrupted characters.

## Reproduction and expanded mutation matrix

- Branch: `agent42/pr239-nested-member-alias-20261122`
- Test: `test/decoder-object-create-nested-member-alias.test.js`
- Expanded matrix branch head: `8e83ea52d9e3f7c2bc4d37eb212be7acc434eb4a`
- Parent PR #239 head at test time: `0672b0c5e7f8ce7cea7a506b549d3800b7e72162`
- Existing manual workflow: `.github/workflows/manual-array-source-coercion.yml`
- Initial six-case red run: [44978959616](https://github.com/FlareZ123/obfs/actions/runs/44978959616)
- Expanded mutation-grid run: [44979162909](https://github.com/FlareZ123/obfs/actions/runs/44979162909)

The expanded matrix tested eight shapes:
1. single member-expression alias;
2. multi-hop member-expression alias;
3. computed member-expression alias;
4. assigned member-expression alias;
5. `Object.assign` through the alias;
6. `Object.defineProperty` through the alias;
7. destructured nested descriptor alias; and
8. direct nested member write `descriptors.ref.get = ...`.

For each shape, the test runs both a decoder-sensitive `String.prototype`
mutation and a harmless `Number.prototype` positive control in COO, SNO and
SCO. On **both Ubuntu and Windows**, the expanded run reported **48 tests:
24 failures and 24 passes**. The 24 String cases all failed native/emitted
output equality; the 24 matched Number controls passed, including their
positive-yield assertion that one string literal remained encoded. The
pre-existing array/source and Proxy-get steps passed on both platforms. The
new failing step stopped the workflow before JSDoc, so this is a red
compatibility witness, not a green validation of the branch.

The direct nested-member baseline also fails: the current scanner does not
connect writes whose receiver is a nested `MemberExpression` back to the
descriptor map. The gap therefore extends beyond a single alias spelling.

## Prototype and remaining escape paths

An isolated prototype was built on
`agent42/pr239-nested-member-alias-prototype-fix-20261122`, source commit
`b09c3a02dbaa1f683c4d799d9814ed710d948745`. It adds static nested member
paths, reverse aliases for nested descriptor values, multi-hop identifier
closure, destructuring, and identifier-targeted `Object.assign` /
`Object.defineProperty` tracking. The static eight-shape matrix then passed
all 48 cases and JSDoc on both platforms:
[44979616538](https://github.com/FlareZ123/obfs/actions/runs/44979616538).

A second probe branch kept that exact source SHA and added five boundary
shapes:
1. dynamic-key alias: `const key='ref'; const entry=descriptors[key]; ...`;
2. dynamic nested write: `descriptors[key].get = ...`;
3. function-parameter alias: `install(descriptors.ref)` where `install`
   writes `entry.get`;
4. returned alias: `getEntry()` returns `descriptors.ref`, then the caller
   mutates the result; and
5. cross-file shared descriptor object: one CommonJS module exports the map,
   a second mutates its nested value, and a third passes the same cached map to
   `Object.create`.

On both Ubuntu and Windows, the boundary run reported **78 tests: 63 passes,
15 failures**. Each of the five String-sensitive shapes failed in COO, SNO and
SCO; all matched Number controls passed. The pre-existing array/source and
Proxy-get steps passed. The failing cases are therefore not confined to
member-path syntax: dynamic member access, function-argument/return flow and
cross-file shared identity remain unproved. Run:
[44979812614](https://github.com/FlareZ123/obfs/actions/runs/44979812614);
probe branch head `9385f355a37ca697615d617ba12c17e32e0903de`.

**The prototype is not ready to integrate.** Its static-path improvement is
useful evidence, but it does not meet the required cross-file/interprocedural
coverage. A safe implementation must either prove those flows through the
shared module/call graph or conservatively refuse eager encoding whenever
the alias path cannot be resolved. The 48-case green child run is not a
substitute for the failing 78-case boundary run.

## Interpretation and boundary

This is a source-pinned, executable counterexample to the current #239
compatibility claim for the tested descriptor shapes. It does not prove that
all descriptor aliasing is unsafe, nor does it establish completeness against
arbitrary proxies, reflection, closures, returned values or opaque host
callbacks. It makes no claim about static reconstruction resistance,
hostile-runtime integrity, environment locking, or the 2.5x runtime budget.

The canonical integration should include this matrix alongside the existing
direct identifier-alias, bound-call, cross-file and browser cases. PR #239
should remain draft until a single composed source pin passes the combined
native/emitted matrix on both operating systems and the configured Chromium
checks. A passing child-branch run does not establish that combined source
state.

## Next action

Agent 5 owns PR #239 integration. Please add the nested member-expression
alias matrix to the canonical regression suite, repair or conservatively
refuse the unsafe paths, and run the combined gate on the resulting exact
source SHA. Agent 1 should independently review the member-alias closure
alongside the already identified bound-call and holder cases.
