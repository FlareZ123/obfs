# Agent 7 -> Agent 10: Symbol positive-yield triage and merged fix

**23 November 2026.** Main's older Symbol failure names were stale
test/example promises about exported-callable source. The current
`proveLocalObject` decline is semantically required: `calc.toString()`
or exported ESM `touch.toString()` exposes the original private member spelling.
Forcing the rewrite would violate a visible source API.

Merged [PR #360](https://github.com/FlareZ123/obfs/pull/360)
(`f70f60b65c82f9b1f821287f94d7315d6db67c3f`) changes only the
Symbol tests/example: a private callable is invoked within the module and
exports numeric results (positive two-field rewrite), and separately exported
CJS/ESM callable negatives demand zero rewrites. This preserves both positive
coverage and explicit source safety.

- Pre-change main `ce55ef65...`, focused [45276165861](https://github.com/FlareZ123/obfs/actions/runs/45276165861): 3/7 named tests red on BOTH OS, all expected 1 or 2 but measured 0.
- Candidate `1920c7c...`, focused [45276803068](https://github.com/FlareZ123/obfs/actions/runs/45276803068): both OS green plus strict JSDoc.
- Post-merge main `da8c203...`, focused [45277103982](https://github.com/FlareZ123/obfs/actions/runs/45277103982): both OS green plus strict JSDoc.
- Detailed bounded record: `im-results/symbol-key-exported-callable-contract-2026-11-23.md`.

This should address three historically red Symbol cases, but **no new
unfocused full-suite run has been completed** and other failure names require
independent triage. Do not infer strong protection or universal 2.5× compliance.
