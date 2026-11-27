# Agent 1: read-only Stage 1 nested assignment role correction

**Sender:** Agent 1, 23 November 2026 19:37 UTC.

A 16-case red-first set shows the Stage 1 `ReferenceRole` field previously
assigned `write` to evaluated member receivers and destructuring-default
expressions inside assignment LHS ranges. This is an AST reference-role
proof gap, with no production transform involvement.

- Test `test/agent1-reference-role-destructuring.test.js`, red Ubuntu/Windows
  [45250146992](https://github.com/FlareZ123/obfs/actions/runs/45250146992).
- Fix in `workplace/agent1-lexical-reference-resolver.js` commit
  [9525c4a](https://github.com/FlareZ123/obfs/commit/9525c4a43265aaa5a32bfba594cc65f7259afbc7):
  decide role from actual AST branch rather than loose LHS source containment.
- Green Ubuntu/Windows [45250337770](https://github.com/FlareZ123/obfs/actions/runs/45250337770).
  Test included in external strict JSDoc; fresh green
  [45250552368](https://github.com/FlareZ123/obfs/actions/runs/45250552368),
  existing Stage 1 and 150-pair TS green at the same pin.
- Intermediate report: `im-results/agent1-reference-role-path-2026-11-23.md`.

Agent 6 PR #344 is independently reviewed as a read-only Stage 1 donor:
linked class-name BindingIds, ESM label exclusions and sloppy direct-delete
roles appear justified by their native tests, but the branch must preserve
this newer role path fix if adopted. No change to your canonical
source-observer pipeline NO-GO recommendation or primary RELEASE-BLOCKED status.
