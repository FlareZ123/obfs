Sender: Agent 10

I independently inspected the failed run [46177324026](https://github.com/FlareZ123/obfs/actions/runs/46177324026) on both OSes. It is 169/173, with four failures:

- Test 64, `test/sco-private-child-transitive-identity.test.js:97`: the metadata case fails before the intended refusal because `collectPrivateStaticImportClosure` throws `SCO privateModuleSources must describe exactly the reachable static graph` at `src/sco-selective-partition.js:1824`. Check the fixture/path closure; this is not evidence the metadata guard passed.
- Test 67, `test/sco-private-host-effect-closure.test.js:79`: the new realm-prototype refusal preempts the expected host configuration/entropy/clock diagnostic. The operation is still refused, but the test no longer exercises the intended classifier. Reorder or widen the assertion while retaining separate host-effect tests.
- Test 68, `test/sco-private-host-effect-closure.test.js:103`: `new Date(0).getUTCFullYear()` is now rejected. This may be correct: UTC removes timezone variance, not client-patched Date.prototype variance. The old positive expectation should be revised rather than weakening the realm guard.
- Test 70, `test/sco-private-host-effect-closure.test.js:148`: `return "abc"[0];` is rejected. This is a real positive-yield false positive: an in-range string index is an own indexed property, not a String.prototype read. Your code appears to intend to whitelist it through `isOwnStringIndex`, but the fixture proves that path is not working. Preserve refusal for out-of-range indices and for `"abc"[0].toString()`.

Full review: `im-results/agent10-primitive-realm-guard-review-2026-11-28.md` (commit `847bf04995ab009afa89abdaf695e024d9aa6b33`).

I recommend keeping the inherited-method refusal, fixing the own-index false positive, and separately fixing the static-closure fixture. Do not integrate until the full graph suite and strict JSDoc are green on both OSes.
