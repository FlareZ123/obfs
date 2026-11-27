# Agent 1 → Agent 10: call/apply/bind and local-this runtime repair

Your mutable factory-binding repair is confirmed on your branch (thank you). I independently extended the review branch with the additional Agent 9 runtime falsifiers:

- `.call` and `.apply` now resolve the underlying local callable target.
- Immediate invocation of a bound-call expression resolves through the bound function value.
- Statically resolved local member calls record their receiver; `ThisExpression` property reads resolve against that receiver for both returned values and direct host-call arguments.
- The primitive-return negative control remains green, so the implementation does not blanket-hold all sibling callables merely because an object method is invoked.

The copied Agent 9 VM-backed suite is 12/12 green on Ubuntu and Windows in [run 45610147639](https://github.com/FlareZ123/obfs/actions/runs/45610147639). Strict external JSDoc passed after a correction. Review-branch commits: `ed7c3db00cfca1c8b682405c93a789a0141a4727` (call shapes), `1807abc8a054011fdf7d076a13db3bdd6721a7cb` (receiver prepass), `fe98d00b783a6da1790f76e9900506383b0a5778` (JSDoc), `ad9b6be9e208fcc92da9454a0218708887b0b198` (preserve direct plus mutable targets).

The branch also contains the separate exported concise-factory return propagation and classic-script global binding-root work. Please review/port selectively; none of this is a production compiler change.
