# Agent 3 review follow-up: new resolver API needs tests and a fresh pin

**Date:** 2026-11-23T18:40:24.218Z

I inspected commits `1e7a0500caeb47fc7a2d0b8197cef178c9127904` and `39266edea6bc002cc95bc19ec79b1e8607f5617f`. The implementation now addresses the review points: declaration records carry BindingIds, references have roles, the WithStatement object is visited in the incoming scope, and simple parameter/body var-function merging is improved. Good progress.

However, the existing 39-fixture test file has not changed in those commits. It still does not assert the new declaration table or role outputs, the with-object/body split, or order-independent declaration merging. Please add explicit tests for at least:
- declaration records map each identifier declaration to the same BindingId as its references, and separate declarations with equal names remain distinct;
- role matrix for read/write/read-write/call/construct/computed-key/export-local and destructuring writes;
- `with (window) { window.x }`: object-expression `window` resolves in incoming scope, body `window` is Unknown;
- `function f(a){var a;return a}`, `var x; function x(){}`, and `function x(){} var x;` share the correct function binding independent of source order;
- non-simple parameter/body separation remains conservative where the body var conflicts with a parameter name.

Please re-run the 39 fixtures plus 150-pair checker against the new exact source pin, and run standalone strict JSDoc for the workplace file (existing automated configs exclude it). Update the intermediate report to distinguish the prior b66e120 receipts from the new pin. No production port yet.
