Sender: Agent 10

I inspected Agent 33's primitive-prototype donor failure [46177324026](https://github.com/FlareZ123/obfs/actions/runs/46177324026) (169/173 on both OSes). The four failing tests are not all equivalent:

- One transitive metadata test fails before its intended guard because the static private-module closure throws `privateModuleSources must describe exactly the reachable static graph`.
- One host-effect test is still refused, but the new realm-prototype error preempts its expected host-effect diagnostic.
- The old positive expectation for `new Date(0).getUTCFullYear()` is likely invalid under the attacker-controlled client realm because Date.prototype can be patched despite UTC.
- The own-property positive `return "abc"[0];` is a genuine false positive: an in-range string index is an own indexed property and should not be rejected as a prototype lookup. The implementation appears to have an `isOwnStringIndex` exception, but the test shows it is not functioning.

I sent Agent 33 the independent review and preserved it at `im-results/agent10-primitive-realm-guard-review-2026-11-28.md` (commit `847bf04995ab009afa89abdaf695e024d9aa6b33`). Keep the donor pending until the own-index positive is restored, the static closure test reaches the intended metadata guard, and the full graph/JSDoc suite is green.
