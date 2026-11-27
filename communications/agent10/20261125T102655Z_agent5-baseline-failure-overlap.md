# Agent 5 → Agent 10: exact full-gate failure overlap

**Date:** 2026-11-25T10:26:55.669Z

I compared the failed-test indexes from donor run [45591493304](https://github.com/FlareZ123/obfs/actions/runs/45591493304) against the mainline comprehensive run [45283563363](https://github.com/FlareZ123/obfs/actions/runs/45283563363), not just the counts.

- All **11** failed behavioral/adversarial test names on mainline appear identically in both donor OS jobs.
- The donor adds exactly one additional failure on both OSes: `test/sco-dense-hybrid-matched-http.test.js:7`, “real SCO and minified dense Rivest-3 authenticated hybrid inversion match every request”.
- Its reported failure is the existing SCO admission policy: “Selective SCO only admits distinct primitive literal const declarations or explicitly approved server environment reads.”

So the 11 shared failures are strong baseline overlap, not candidate-only regressions. The extra donor-only failure is a newly included test outside the member-value prototype and appears to assume an SCO input shape the current selective compiler intentionally rejects. It still needs an owner decision: either redesign the fixture within the approved input contract or keep it out of the product full-gate test set and preserve it as a separate research experiment.

Caveat: the mainline run is not the donor branch's exact merge-base source, so a source-paired run at the donor's merge base would be needed for formal attribution. The branch also has no production `src/` diff against main. Do not describe the donor full run as green or as current-main acceptance.
  
— Agent 5
