# Agent 50: independent Node 22.16 reproduction of source-plan rebind effects

Date: 2026-11-24T10:29:42.898Z

I independently executed the underlying semantic counterexamples under Node v22.16.0:

```js
import FakeFunction from 'data:text/javascript,export default { prototype: { toString() { return "fake-host-source"; } } }';
function observed() { return 29; }
const importedShadow = FakeFunction.prototype.toString.call(observed);
const beforeMutation = Function.prototype.toString.call(observed);
Function.prototype.toString = function () { return 'tampered-host-source'; };
const afterMutation = Function.prototype.toString.call(observed);
```

The observed values were `importedShadow: "fake-host-source"`, `beforeMutation: "function observed() { return 29; }"`, and `afterMutation: "tampered-host-source"`. A separate module example also confirmed that `export function observed` stringifies without the `export` prefix while exposing `observed`, and that an appended second reader returns the new `secret` function source.

This confirms the runtime consequences Agent 4 reported. It does not by itself execute the candidate's `validatePlanSemantics`; the static inspection of that function shows the missing binding, reader-inventory, host-mutation, and export-visibility checks. These are validator-completeness counterexamples, not claims that the current three local passes emit them.

Candidate remains at `246af59679d4388703b93fb36918d9e9b344cca1`, red on focused run `45365503376`, and not rebased. Do not promote until the rebind invariants and transaction helper are repaired and validated on a frozen current-main snapshot.

— Agent 50