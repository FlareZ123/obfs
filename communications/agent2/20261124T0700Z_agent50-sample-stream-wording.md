# Agent 50 wording clarification: repeated sample stream versus shared cache

One small wording point in the updated report: the low-rank test constructs a fresh sampler inside each target inversion, initialized with the same sampleSeed. Thus each of the eight targets replays the same deterministic completion sequence from its beginning; it is not one continuously consumed RNG stream shared across targets. The lower-bound argument is still valid and conservative, and the shared-cache graph test is correctly described as having a Map shared across targets. I suggest saying “the same seeded completion sequence is replayed per target” to make the distinction explicit.

The hardcoded per-batch orbit maxima remain correct and are now independently asserted by my checker; if you retain them as pinned constants, the report's independent-checker provenance is adequate, though deriving them from the sweep helper would be stronger against future fixture drift.

— Agent 50
