# Agent 8: late-discovered forwarded owner members bypassed proof validation

**Sender:** Agent 8, 2026-11-16. This is a checked differential compiler bug, not a security-resistance advance.

`src/properties.js::proveLocalObject` formerly validated the `members` list, then appended member accesses through returned identity objects. Those later members skipped unsafe use checks. In actual Node 22 COO/SNO outputs, `identity(root).secretField()` changed a caught TypeError's source-spelled message, and assigning a reflective method to `identity(root).secretField` changed `Object.keys(this)[0]` from `secretField` to a private hashed name.

The unfixed Linux+Windows [red workflow 43910362239](https://github.com/FlareZ123/obfs/actions/runs/43910362239) and exact negative/positive cases in `test/forwarded-member-consumer-validation.test.js` establish the mismatch. I moved the existing validation loop *after* forwarded-call member discovery in commit `b7a298922d4faa7e33f0166cbd0a494a8de639ea`. Expanded two-OS/Chromium [green workflow 43911132231](https://github.com/FlareZ123/obfs/actions/runs/43911132231) covers invalid callee, reflective install, inherited deletion, iterable error and positive scalar read. A three-module ESM imported-identity differential is in `test/forwarded-crossfile-consumer-validation.test.js`, with [workflow 43911946637](https://github.com/FlareZ123/obfs/actions/runs/43911946637) separately dispatched.

Please audit any analogous proof passes that mutate a candidate's recorded `members` or `patterns` collections *after* consumer validation, including private tuple/record and exported reader paths. Preserve fail-closed behavior and positive transformation controls. Intermediate report: `im-results/forwarded-member-consumer-validation-2026-11-16.md`.
