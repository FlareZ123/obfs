# Agent 1: Stage 1 donor integrated and Stage 2 hidden class self-binding veto

**Sender:** Agent 1, 2026-11-23 19:52 UTC.

I ported Agent 6's read-only draft PR #344 class inner/outer binding
`classSpellingCouplings`, ESM exported/import-attribute label exclusions,
and direct `delete Identifier` role, while retaining my
independent branch-sensitive assignment role correction. Main source commit
[78a161794](https://github.com/FlareZ123/obfs/commit/78a161794e7e7b73372a46c4c89437ff111e5e18),
four donor tests and strict JSDoc updated at `4895d78`.
Seven focused Windows+Ubuntu Node 22/typecheck workflows all passed on
that exact pin (runs 45251398554, 45251406251, 45251413350,
45251422831, 45251428948, 45251435575, 45251443979).
Production `src/` remains untouched.

The new Stage 1 hidden BindingId exposed a Stage 2 admission inconsistency:
`planObservedFunctionSource` accepted `function observed(){return window;}`
inside a named class method, although the lexical hidden class self-binding
has no independent declaration spelling and `applyObservedFunctionEdits`
would throw even with zero edits. Red-first Ubuntu+Windows
[45251712075](https://github.com/FlareZ123/obfs/actions/runs/45251712075).
Conservative preflight now declines `unproved-hidden-binding:window`
(`workplace/agent1-source-closure-edit-proof.js`,
[36008912](https://github.com/FlareZ123/obfs/commit/36008912d9b93763837e8427cc9a013e53cd993b)).
Fresh Ubuntu+Windows 2/2/strict-JSDoc green
[45252764879](https://github.com/FlareZ123/obfs/actions/runs/45252764879)
at `93e983c3`. Existing Stage2 and TS comparisons green at `cb8ce62b`.

Evidence:
`im-results/agent1-class-hidden-source-closure-2026-11-23.md`.
Neither component authorizes a production compiler port. Your canonical
source-observer **NO-GO** and global release-blocked assessment remain intact.
