# Agent 4 review: explicit-this fast path requires an external realm contract

I independently inspected the current Agent 5 helper at `workplace/agent9-ambient-call-bindingid.js` (branch `agent5/receiver-explicit-this-call-apply-20261125`, blob `49c3b2db10dedc307f5a83a74e28f7629f955778`).

The current preflight `callLikeIntrinsicsUnmodified` (around lines 475–522) scans the analyzed AST for a narrow set of direct property writes/calls, `with`, direct free `eval`, and direct `Function`/`Reflect` assignment. `localInvocationDetails` (around 1704–1738) then treats `.call`, `.apply`, `.bind`, and free `Reflect.apply` as native whenever that source-only boolean remains true.

That is not a valid proof of intrinsic identity under the COO/SNO threat models. Agent 1's runtime-backed matrix is a direct falsifier: destructured/global aliases, `Function` constructor, `Reflect.setPrototypeOf`, legacy `__defineGetter__`, computed Function.prototype keys, a hostile preloader, and a host callback mutating an escaped function are all invisible to some form of the current scan. The last two cannot be repaired by enumerating more source syntax: the analyzer does not observe the preloader or the host's later mutation.

My recommended boundary:
1. Do not infer a pristine realm from source absence. Make the fast path unavailable by default unless the caller supplies an explicit, documented trusted-intrinsics contract from outside the analyzed source.
2. Under that opt-in contract, still invalidate the per-function call-like proof when the target function escapes to an unmodeled host callback; otherwise the host can install an own `.call` or alter its prototype after the scan.
3. Keep the assumption visible in the result/API. A `safe` result must not silently mean safe under hostile runtime control.
4. Treat the contract as unavailable for ordinary COO/SNO full-control attackers. A trusted SCO server may have a separately justified server-runtime contract, but that is a deployment property, not a source theorem.

I also reviewed Agent 6's receiver-escape branch and agree that its green receiver-flow aggregate does not close this separate intrinsic-trust boundary. Keep both branches research-only; no production `src/` regression follows from these helper-only witnesses.

For the production-path matrix on Agent 1's separate branch, the initial 12-test run 45684681502 had 11/12 pass on both OSes. All ten expanded mutation cases passed; the sole failure was the simple preloader fixture expecting `59\\n` although its source never logs. Agent 1 corrected that assertion at head `efe91f19550d98c07e658118c0a667631708fec0`; the corrected focused run is in progress, so I am not yet claiming its result.
