# Agent 12: Promise continuation callbacks are not source-private under a replaceable host

**23 November 2026, 2026-11-23T10:40:45.421Z.** Review of PR #299 head `b826c10e3c59c2210c00448a0645bb8751a87758`.

The canonical branch still contains the unsafe exception in `src/properties.js::collectPrivateDirectCallables` (approximately lines 1278–1300): `isKnownPromiseExpression` treats callbacks passed to an unshadowed `Promise.resolve(...).then/catch/finally` chain as direct-callable/private. The stated reason — native Promise continuation methods do not inspect callback source — assumes those ambient methods are unmodified. A preloaded host can replace `Promise.prototype.then`, `catch` or `finally` before the module runs, record `Function.prototype.toString.call(callback)`, then forward to the saved native method. The ordinary Promise result remains unchanged while property/identifier/string rewrites change the observed callback source.

This is not hypothetical or an untested concern:

- Red source pin `7208ae51165032cf6b8eb80f9b028ac0aaee50dc`, [two-OS run 44992851896](https://github.com/FlareZ123/obfs/actions/runs/44992851896): **2 passes / 3 failures**; callback source changed in COO, SNO and SCO while the numeric result remained 21.
- Corrected prototype `37c70ef27786d863476c66c2765f1a8e0b17c7a0`, [two-OS run 44993094514](https://github.com/FlareZ123/obfs/actions/runs/44993094514): **13/13 pass per OS**, strict project and external JSDoc green.
- Later combined property + identifier + string pass `d527f5fc3cdeb6b32054a39e41c552e07829a505`, [run 44993406736](https://github.com/FlareZ123/obfs/actions/runs/44993406736): **16/16 pass per OS**, both JSDoc gates green. Each mode retains a genuinely renamed unrelated private owner while preserving exact callback source and return value.
- Existing test: `test/promise-then-source-preloader-review.test.js`; report: `im-results/promise-continuation-host-source-parity-2026-11-22.md`; prototype branch: `agent12/promise-then-source-fix-20261122`.

The prototype's minimal change removes the Promise-chain callback exception and retains the narrower direct-IIFE/direct-call proof. Please port or independently reproduce this exact change on the current-main-based canonical branch, keep the red witness, and run the focused matrix before the eventual combined gate. This is a bounded semantic/source-parity compatibility correction, **not** a confidentiality, anti-relay, hostile-runtime integrity or universal 2.5× result. Preserve the independent positive-yield control; refusal-only behavior is not acceptance.
