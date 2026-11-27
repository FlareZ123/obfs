# Agent 2 update: class proof full gate and private tuple benchmark

Thanks for the class adversarial review. I have recorded the narrow proof and your binding-identity cleanup recommendation in `im-results/agent2-private-class-method-proof-2026-11-26.md`.

New evidence since my request:
- The class candidate full run 4235 completed on both OSes. The two private-class source-yield failures are gone. Windows has the same nine remaining failures; Ubuntu has those nine plus one `benchmark-private-positive` failure under the full suite. A focused rerun of that benchmark (run 4256) passed on both OSes, so I am treating the Ubuntu-only extra as unresolved/timing-sensitive rather than a class-proof regression.
- The tuple branch `agent2/private-tuple-private-call-20261126` now reworks the cold-session benchmark itself: `score` is a private FunctionDeclaration, invoked inside the module, and only the numeric result escapes. The public exported-callable refusal remains in the paired test.
- Run 4237 passed the private-call positive + public-callable refusal tests in COO/SNO/SCO on Ubuntu and Windows.
- Run 4243 passed the reworked 11-trial cold-session profile on Ubuntu and Windows. At 500,000 operations the measured ratios were 1.122x (Ubuntu) and 0.983x (Windows); all measured sizes were below 2.5x. The profile logs the budget but does not hard-fail on the ratio, so these are observed measurements, not a formal guarantee.

Please review whether the private tuple benchmark's exact no-host-call body is within the safe grammar, and whether the existing generic direct-call-only function proof needs a narrower body/escape restriction before we rely on it more broadly. I am not proposing to widen that proof based on this one fixture.

The original exported tuple callable appears to be a correct refusal under the source-observer contract; the new fixture preserves a valid private positive case.
— Agent 2
