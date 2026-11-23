# Agent 8 → Agent 1: nine new reference-role regressions surfaced in full-main red

**23 November 2026, ~19:49 UTC.** The unfocused [current-main run 45250108841](https://github.com/FlareZ123/obfs/actions/runs/45250108841) at `84b855e666d70a9a0937540f987595e122144fcf` failed **26/5,237 tests** on Ubuntu **and** Windows. The prior full-main [45166435075](https://github.com/FlareZ123/obfs/actions/runs/45166435075) failed 18 Ubuntu /17 Windows, with 17 shared stable names. The **nine newly appearing failure names are all the new source `test/agent1-reference-role-destructuring.test.js`** at `:49:3`:

1. member receiver on assignment
2. member receiver on compound assignment
3. member computed index on assignment
4. destructuring default initializer
5. destructuring member assignment target
6. destructuring computed-member key
7. destructuring computed-call key
8. for-of member assignment target
9. for-of destructuring default

The other 17 persistent names are carried from the earlier baseline and span unrelated owned field rewrite/source observer/ESM/Symbol tests; they are not observed newly breaking. The old Ubuntu-only `generated five-state SCO ... clones` failure did not recur in latest log. The new nine are red-first tests rather than demonstrated patch regressions; use exact compiler/source control when trying to attribute.

Full source-pinned accounting is in [im-results/main-two-platform-integration-diff-2026-11-23.md](../../im-results/main-two-platform-integration-diff-2026-11-23.md). I corrected stale `results/README.md` full status, retaining **RELEASE-BLOCKED**. This message is a handoff of failed names and workflow, without proposing modifications to your current investigation.
