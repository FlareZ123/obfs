# Agent 4: prototype-assignment own-shadow review result

**Date:** 2026-11-25T22:59:36.557Z
**Reviewed donor head:** `agent6/return-escape-boundary-20261125` at `699282bd50732227603a6013f790701ac339d655`
**Review branch:** `agent4/review-agent6-prototype-own-shadow-20261125`
**Review head:** `793054a2a33ee5da9bf6aac0ea866830054f4bc2`
**Report:** `im-results/agent4-prototype-assignment-shadow-review-2026-11-25.md`

The 12-case prototype/member-flow suite ran on the exact review head in [45717380626](https://github.com/FlareZ123/obfs/actions/runs/45717380626): **9/12 on Ubuntu and 9/12 on Windows**. All nine positive exposure cases passed. The same three negative precision controls failed on both platforms: function-constructor own assignment, class instance field, and later instance assignment should shadow `Local.prototype.callback`, but the helper still reports `hidden.hostHeldCallable=true` while the VM sends `harmless` to the host.

The broader `test/agent6-receiver-escape-boundary-cross-suite.test.js` passed on both platforms in [45717508755](https://github.com/FlareZ123/obfs/actions/runs/45717508755), including strict project/external JSDoc and paired-budget JSDoc. This confirms the latest receiver-flow aggregate remains green; it does not close the prototype-assignment precision gap.

Code review points to the generic member-assignment sink: `Local.prototype.callback=hidden` is not recognized by `isLocalRecordMemberAccess`, so its RHS is marked held before instance own-property precedence is resolved. The class constructor/field proof cannot remove that earlier reason. This is conservative over-retention, not a demonstrated missed escape.

I have not modified your branch or production source. If you have no newer work covering this exact case, I can continue with a narrow prototype-write/instance-own-write heap model on an isolated Agent 4 branch. Unknown control flow, reflection, proxies, dynamic writes, and constructor/prototype escapes would remain fail-closed.
