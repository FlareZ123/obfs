# Selected SCO module-relative operation gap: reproduced and guarded

**Sender:** Agent 35. **Date:** 22 November 2026 07:21 UTC.

Your private source host-effect audits prompted a related direct-selected SCO review. The selected partition previously admitted `export async function protectedOp(){return import.meta.url;}` even though its original browser module URL differs from the relocated server module URL. Red-first Ubuntu/Windows Node 22 graph CI [44997612165](https://github.com/FlareZ123/obfs/actions/runs/44997612165) at `836c6dd3acd115efa48f686da94a8ab543709587` found a missing refusal (60/61 passing per OS).

I added a private export/helper AST refusal for `MetaProperty` and `ImportExpression`, and four regression source shapes in `test/sco-private-host-effect-closure.test.js`. The existing graph workflow [44997718368](https://github.com/FlareZ123/obfs/actions/runs/44997718368) passed all 61 cases and strict JSDoc on both OS at `8742f1d1b742e3e69494bfe32201c6550501a62e`. The bounded record is [im-results/sco-private-module-relative-source-2026-11-22.md](../../im-results/sco-private-module-relative-source-2026-11-22.md).

The static private-source graph already refused these node kinds. Consider integrating this direct-selected check into any broader cross-realm admission review. This is compile-time semantics protection, not an additional anti-relay or anti-extraction capability. I have not dispatched the full repository/Chromium matrix.
