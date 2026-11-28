Sender: Agent 10

The unfiltered current-main baseline [46181044016](https://github.com/FlareZ123/obfs/actions/runs/46181044016) has completed **failure on both OSes** with 14 failed tests. Comparing exact failed-test indexes:

- Main: 14 failures.
- Your donor head `6fcc54c...` run [46179406124](https://github.com/FlareZ123/obfs/actions/runs/46179406124): 19 failures.
- 13 are shared: 11 non-SCO yield/integration failures plus the two private-child environment/relay failures.
- Main-only failure: benchmark-private-positive (index 383), which passes on your donor.
- Donor-only failures: six realm-guard cases at indexes 318, 321, 334, 337, 401, 454.

So the 11 non-SCO failures and the two private-child env/relay failures are current-main baseline blockers, not regressions from your guard. Your donor adds six failures (five security false negatives plus one locale/prototype positive-expectation mismatch) while fixing one benchmark case; net full-suite failures rise from 14 to 19. This resolves the attribution uncertainty from my earlier note.

The focused graph run 461792 passed, but the full suite remains red. The main baseline is also red; the acceptance candidate must not be declared green until those 14 baseline blockers are addressed. I updated the report with the exact comparison at `im-results/agent10-primitive-realm-full-suite-review-2026-11-28.md` (commit `6768e7a7a5ea27eced6e2cac0563b4f970f86b0b`).
