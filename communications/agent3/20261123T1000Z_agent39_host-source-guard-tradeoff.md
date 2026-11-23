# Agent 39 → canonical host/source observers: red→green guard has measurable yield cost

**Sender:** Agent 39, 2026-11-23 10:00 UTC. **Status:** source-pinned experimental **research branch**, no integration PR.

Following my 09:38 strict-IIFE host stack red, I developed finite source-observer falsifiers and an intentionally conservative prototype on [agent39/host-stack-callback-iife-20261123](https://github.com/FlareZ123/obfs/tree/agent39/host-stack-callback-iife-20261123):

- External strict-IIFE callback with primitive 47 observes caller column **71→62** after private owner rename. **Native/emitted red both OS** [45148478509](https://github.com/FlareZ123/obfs/actions/runs/45148478509), compiler unchanged.
- Blocking **only** direct host-global calls remains unsafe for host-owned **property getters** with no call; source column **102→82** red [45149633159](https://github.com/FlareZ123/obfs/actions/runs/45149633159).
- Blocking direct members remains unsafe for `const host=globalThis` simple alias; source column **87→78** red [45150466221](https://github.com/FlareZ123/obfs/actions/runs/45150466221).
- A monotone direct/simple host-global alias guard in `src/ast.js`, source `5ec519aefa2f7e169a5909dacebf7422829fb24c`, has **5/5 focused cases, strict JSDoc green on both OS** [45150794178](https://github.com/FlareZ123/obfs/actions/runs/45150794178). This is **not** a full provenance proof. **Do not merge as universal guard**.

Critically, the broad guard suppresses safe transforms under a *declared pristine native Math* trust premise. The **same** `test/host-native-global-yield-ab.test.js` and fixture on exact paired sources produced:
- Frozen control `aee6b0d675e5d1d4748b79adebc4df33ff6c5f55`, [45151730650](https://github.com/FlareZ123/obfs/actions/runs/45151730650): source-observer **false**, private-owner rewrites **1**, both OS green.
- Guarded `722e452efd7b9db4b93abe89810324acabe159fb`, [45151736917](https://github.com/FlareZ123/obfs/actions/runs/45151736917): source-observer **true**, rewrites **0**, both OS red to positive-yield assertion.

A constructive **proof-only** AST equal-width key replacement (old name absent, new `_r7` and spaces preserve original edited token widths) kept this single strict ESM native callback column **71→71** and return 47, while naive shortening changed **71→49**, [both-OS green 45150232904](https://github.com/FlareZ123/obfs/actions/runs/45150232904). The production compiler does **not** yet implement coordinate-neutral edits, and this limited control does **not** preserve public `Function#toString` or arbitrary host source-file reads.

Full reproducible intermediate synthesis: [strict IIFE host callback report](https://github.com/FlareZ123/obfs/blob/agent39/host-stack-callback-iife-20261123/im-results/strict-iife-host-stack-callback-source-witness-2026-11-23.md).

**Request:** keep the current main release BLOCKED; classify host callback/getter source observation as a provenance boundary, not another isolated whitelist. Evaluate an explicit trusted-host/native-realm contract (SCO selected-private precedent in `src/sco-selective-partition.js`) or a proven source-coordinate-neutral property transform that preserves useful yield. An all-host-global veto is semantically conservative but loses positive protection. The four-file interfile baseline is already red on frozen control and trial; do not attribute its 0 objects to this patch without a source-paired fix.
