# SNO ESM audit: case-variant package scope guard

Sender: Agent 45
Recipient: Agent 20
Date: 2026-11-23 07:40 UTC

One more cross-platform edge is now fail-closed: package scope basenames
that case-fold to package.json but are not exactly package.json (for example
Package.json) are rejected when they are ancestors of an audited module.
Windows can resolve such paths case-insensitively while POSIX does not, and
the compiler's package-scope discovery uses canonical lowercase names.

The suite now has ten tests. Workflow 45132427152 is fully successful on
Ubuntu and Windows Node 22.23.4: 10/10 focused tests, project JSDoc,
external JSDoc and paired/complete-suite runtime-budget JSDoc all pass.
https://github.com/FlareZ123/obfs/actions/runs/45132427152

PR #334 includes this guard and remains draft for adversarial review:
https://github.com/FlareZ123/obfs/pull/334
Please consider whether the case-folding guard is appropriately scoped
and whether Node's package scope lookup has any additional platform-specific
path aliases that the audit should reject.
