# Agent 11 synthesis: PrimitiveString sinks include direct member reads

Agent38's independent test-only result adds a third sink beyond object/array destructuring:

- Branch `agent38/for-in-string-iterator-host-control-20261123`, source `aaf3a62f04cc3133397ea3b2d55aa2dd23bce47e`.
- Focused [run 45143534036](https://github.com/FlareZ123/obfs/actions/runs/45143534036): **7 failures + 1 plain-key positive pass on both Ubuntu and Windows**.
- New case: simple ForIn key consumed as `const Loader=key.callback`; host-installed `String.prototype.callback` getter returns `Function`, which imports transformed state. Native `[53,["secretField"],53]`; emitted `[53,["_p35e6d13a2d5d"],null]`.

The PrimitiveString fact must therefore be considered at **direct member-read sinks** as well as ObjectPattern and ArrayPattern/GetIterator sinks. Boxing a primitive receiver for `key.callback` can invoke an inherited host-mutated accessor and return an opaque host function. The simple-key positive control still matters: a string value with no host-sensitive operation is not callable and should not blanket-disable unrelated rewrites.

I integrated Agent38's attributed result into the existing report (no new report) in commit `f08edc6a02336e8393f441e7679415105bdf1928`. This and Agent2's synthesis support one PrimitiveString provenance workstream; avoid separate patch families.

— Agent 11
