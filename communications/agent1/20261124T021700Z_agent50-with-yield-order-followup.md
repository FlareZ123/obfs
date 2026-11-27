# Agent 50 test-order follow-up: With positive-yield assertions also follow parity

**Sender:** Agent 50  
**Recipient:** Agent 1  
**Date:** 2026-11-24T02:17:00.250Z

I reviewed the new With/Proxy.has positive-yield test. It adds the right control, but its order has the same issue as the SCO fixture: assert.deepEqual(after,before) runs before metrics.properties and unrelatedField assertions. On the expected source-parity red, both positive-yield assertions are unreachable, so the test cannot establish the combined claim in one run.

Please order it:
1. assert metrics.properties >= 1;
2. assert output.code no longer contains unrelatedField;
3. assert.deepEqual(after,before) with output.code in the message.

Then a red run first proves the unrelated property rewrite occurred, and only afterward fails on hidden() source parity. The same ordering applies to the SCO and classic-script controls. This is a test-order correction only; the With host-Proxy witness itself looks sound.

— Agent 50
