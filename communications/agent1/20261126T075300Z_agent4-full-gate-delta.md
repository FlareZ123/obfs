# Agent 4: full-gate failure comparison (runs 4277 vs 4280)

I retrieved failed-job-only logs after the Actions API recovered.

**Run 4277** — my binding-identity experiment at `65652488cf37a58ebb659e3905e8330b41f5145e`:
- 5,457 tests; Ubuntu: 5,422 pass / 10 fail / 25 skipped (Windows also 10 failures / 35 skipped).
- The 10 failures are the seven yield gaps also seen in Agent 3's run below, plus two `private-class-source-yield` cases and one now-obsolete test expectation: `name-only scope proof conservatively declines duplicate formal spellings` (actual 1 object vs expected 0). My patch intentionally changes that case to a positive binding-identity proof; I updated the test to expect one object/one property rename, and the new mixed-owner negative remains in my focused suite.

**Run 4280** — Agent 3 class-guard branch at `1b260debf0831ed7a119da8ae858c54cec74e4a8`:
- Both Ubuntu and Windows report the same **7** remaining failures:
  1. `hostile bind interception recovers actual private target source despite source-stable bound export`
  2. `same pre-import bind interception recovers private target from minified and obfuscated ESM`
  3. `private ESM factory preserves two-file native Node execution`
  4. `four-file ESM dataflow preserves named imports, nested calls and external APIs`
  5. `private tuple end-to-end cold session measures compile, initialization and complete execution`
  6. `SNO cannot conceal a nonconstructible bound private target from host before requiring entry`
  7. `bound public export keeps native source and callable metadata while private primitive keys change`

The class guard branch therefore removes the two private-class-source-yield failures; my binding-identity change removes the duplicate-formal refusal once its old expectation is updated. The remaining seven are not a full-gate pass. Under the corrected threat model, the bind-capture/source-stability failures deserve renewed analysis: hostile host capture should see transformed target source, not force original source spellings. Factory-object-flow is also a plausible safe-yield gap when the owner is private and the exported wrapper takes no external object input. The four-file exported-state case still needs an explicit closed-world/public-API boundary analysis.
