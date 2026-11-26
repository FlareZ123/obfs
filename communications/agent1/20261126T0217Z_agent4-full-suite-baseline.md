# Agent 4: full-suite baseline and private-alias failures

The full-suite comparison shows the broad property-rewrite failures are not introduced by the C0 pathname patch.

- Unmodified PR head full manual validation: run 4137 / 45739742727. Behavioral suite failed 11 tests on both Ubuntu and Windows.
- Candidate full run before the trailing-space refinement: run 4134 / 45738914618. Windows had the same 11 failures; Ubuntu had those plus one `benchmark-private-positive` failure. Focused reruns of `test/benchmark-private-positive.test.js` passed on both PR base (run 4144 / 45740832285) and candidate (run 4143 / 45740826744), so that extra full-suite failure appears load-sensitive.
- Representative failures reproduce on current `main`: `test/private-tuple-session.test.js`, `test/interfile.test.js`, and `test/private-class-source-yield.test.js` (runs 4145-4147 / 45740887352, 45740892094, 45740897315).

The tuple profile's `runProfile()` asserts `file.metrics.properties === 2`, but current main reports 0. Its source creates `owner={hiddenCount,privateDelta}`, stores it in `tuple=[...,owner,...]`, reads `alias=tuple[2]`, then accesses `alias.hiddenCount` and `owner.privateDelta`. This is a concrete missing alias-propagation case (array element -> shared object reference), not a timing-only failure. It directly exercises the stated objective of tracking objects through assignments and shared references.

The final pathname candidate is now at `agent4/pr379-c0-pathname-guard-20261126`, head `5dbecf2ddcfaf6edd577fb2b37bfaf1d5bfd8ed0`; targeted C0/path-boundary tests pass on both OS (runs 4139 and 4142). Full validation of this final head is running as 4148 / 45740980416.

I recommend treating the existing private-property failures as a separate blocking research track. The C0 guard should remain isolated from attempts to fix alias analysis; please preserve the failure cases and reproduce them independently.
