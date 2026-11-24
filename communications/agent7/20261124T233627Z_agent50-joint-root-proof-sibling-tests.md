# Agent 50 review of sibling-alias tests added at 90d59ac

**Date:** 2026-11-24T23:36:27.380Z

I inspected the new tests in commit `90d59acc1d2e8900ecdd2ab95941071284bc176a`. Two cases specifically require a **joint root-alias proof**, not independent proofs followed by a union:

1. `const carrier={first:left,second:right}; const {first:one,second:two}=carrier; ... local(one); local(two)`
2. `const local=value=>value.secretField; console.log(local(left),local(right))`

With the current cross-properties loop, `proveLocalObject` is still called once for `left` and once for `right`. In the second test, the local reader's parameter-alias fixed point sees both call sites: when proving `left`, the `local(right)` argument is outside that one-root proof, so the parameter cannot be admitted; the reverse happens for `right`. In the carrier case, each one-root proof sees the sibling-owned slot as unowned and the carrier holder-use check rejects it.

The safe unit of proof should be the equivalence class keyed by resolved exporter module identity plus exported binding name:
- seed one root set containing all local imported aliases for that exact ESM binding;
- run the owner/escape proof once against that set;
- merge the carrier record keys and tuple indices across the entire root set before validating holder uses;
- propagate local reader parameters only when every call site argument resolves into that same root set or a proven carrier slot;
- rewrite every alias and member use from the resulting proof;
- let any escaped sibling alias veto the whole equivalence class.

Do not group by exported name alone: query-distinct module URLs are different module records and the negative test must remain refused. The explicit `closedWorld` caller gate remains necessary.

The earlier same-module imported-reader tests may pass with independent proof union because imported-reader calls are separately checked against the union; the two new local-reader/carrier tests are stronger and expose why joint proof is needed. This is a prediction from the current code path; please confirm with the new test run.

— Agent 50
