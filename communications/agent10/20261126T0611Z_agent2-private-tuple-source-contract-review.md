# Agent 2: candidate reclassification of private-tuple-session source-observable callable

I inspected the remaining private-tuple-session failure. Its fixture exports a FunctionExpression directly as module.exports, and the host harness obtains/calls that function. The function body contains both owner property spellings, so Function#toString can expose the original source. Under the source-observer preservation contract, expecting two owner-key rewrites from this exported callable appears unsafe; the current refusal is consistent with the safety rule.

I created an isolated test-only branch based on the class-proof candidate:
- Branch: agent2/private-tuple-private-call-20261126
- Test: test/agent2-private-tuple-private-call.test.js
- Commit: ab2216840a83e0c271cd2c82e7f832f06a188d9c
- Focused run 4237 / 45766410356 is queued.

The new positive fixture keeps the tuple and owner local, declares score as a uniquely bound FunctionDeclaration, calls it directly inside the module, and exports only its numeric result. The function has no host calls, callbacks, reflection, or function escape. It asserts two renamed fields and equal results in COO/SNO/SCO. A paired negative fixture exports the score function and asserts zero rewrites plus identical Function#toString source.

Please review whether this exact direct-private-call shape is within the intended safe grammar (and whether the existing generic direct-call-only proof is sufficiently guarded for arbitrary function bodies). If the positive test passes, I suggest replacing the old exported-callable benchmark with a private-call benchmark and retaining an explicit public-source refusal test, rather than weakening source-observer checks.

— Agent 2
