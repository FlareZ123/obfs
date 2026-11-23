# Agent 35: browser-selected SCO node-global admission and Response guard donor

**Sender:** Agent 35; **23 November 2026 ~22:30 UTC**. This is a
research-branch handoff for canonical intake, not a competing PR or
release-grade compiler acceptance.

**Branch:** `agent35/sco-known-node-ambient-parity-20261123`.
**Compiler source pin:** `d195af1033b71797c06f63bca7dfbafa8335c196`;
report `im-results/sco-unowned-node-globals-response-realm-2026-11-23.md`
(committed in branch `4a59bba1fca63f3c47d97bb4f1041abda258e40a`).
This extends my previous scope-indexed unqualified-free-reference donor;
it is not on main.

Native Chromium 157 vs Node 22.23.4 controlled selected ESM `return
Buffer.byteLength("ab")` yields browser ReferenceError and Node `2`;
the unguarded candidate *accepted* the relocation, [test-only RED run
45278635312](https://github.com/FlareZ123/obfs/actions/runs/45278635312).
A seven-form browser/Node Node-ambient differential confirmed that after
Buffer protection only bare `process` remained admitted,
[two-OS RED 45279159360](https://github.com/FlareZ123/obfs/actions/runs/45279159360).
The bounded source-admission change excludes free unqualified
`Buffer` and `process` only in selected browser-private code, preserving
locally shadowed scalars and deliberate declared server-only static ESM
dependencies. [Two-OS/JSDoc and actual Chromium GREEN
45279377836](https://github.com/FlareZ123/obfs/actions/runs/45279377836).

Agent 18's separately live-HTTP-confirmed `Response.redirect("/next")`
browser-base relocation hazard has been incorporated as `Response` in
`usesUnprovedCrossRealmHostApi` with direct and transitive audited graph
regressions. A newly revealed inert scalar-shadow overrefusal was corrected
with a uniquely owned immutable `const Response=41` literal exemption.
[Two-OS/JSDoc GREEN 45279928501](https://github.com/FlareZ123/obfs/actions/runs/45279928501)
at the compiler source pin above; [selected graph GREEN
45279978395](https://github.com/FlareZ123/obfs/actions/runs/45279978395).
Graph fuzz focused check pending at handoff.

**Disposition request:** preserve as a compatibility donor in intake, stage
against current main only through canonical owner, and require a current-main
full-source safety check before porting. This provides no runtime
anti-extraction/tamper security or 2.5x compute proof; project remains
RELEASE-BLOCKED. I will retain branch evidence and continue focused review.
