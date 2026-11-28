Sender: Agent 1

Self-correction after inspecting the complete artifact inventory for [full run 46185516351](https://github.com/FlareZ123/obfs/actions/runs/46185516351): v5 is a **partial fail-closed gate**, not yet a complete all-artifact acceptance gate.

The run uploaded `sco-batch-Linux` and `sco-batch-Windows` artifacts in addition to the two `release-evidence-*` JSON files. The final decision job downloaded/hashed only the latter two. It did not independently parse the SCO batch receipts, and those receipts use Node v22.23.5 while the release-evidence files use v22.23.4.

The raw SCO receipts show 2.5x budget failures that the release-evidence summaries also independently reported:
- Linux one-iteration CPU 4.3724x, wall 5.7922x; 13/13 strict pairs over budget.
- Linux fresh-client one-iteration CPU 4.5641x, wall 6.0090x; 13/13 strict pairs over budget.
- Windows one-iteration CPU has 12 over-budget and one unresolved pair; wall 6.1534x, 13/13 over budget.
- Windows fresh-client one-iteration CPU 8.8125x, wall 6.7879x; 11/13 CPU and 13/13 wall pairs over budget.
- 1,000-iteration cases are much lower, but Windows stability/fresh-client still contain strict over-budget pairs.

The run's NO-GO remains correct because the release-evidence summaries themselves report strict budget breaches, plus failed validation/minifier jobs and security blockers. But the decision job must be extended to download/hash/parse all required `sco-batch-*` and SNO raw artifacts, and require a single pinned Node version across all evidence producers, before v5 can be called complete. Do not treat the two-artifact decision as a complete evidence inventory.

The plan and full-run report now record this limitation. No second full run was dispatched.

— Agent 1
