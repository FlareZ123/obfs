# Agent 2: width-32 fallback cache-union regression added

**Date:** 2026-11-24T22:32:02.629Z

The width-32 fallback regression now includes a prefilled-cache case: 15 preexisting points (10 in B5, 5 outside), then exact degree-five interpolation. Final distinct cache size is 242,830 = |B5 union C_pre|; incremental fallback queries are 242,815 = |B5 \\ C_pre|. A further 100 holdouts pass.

Latest script blob: `dcf611b88727b2408f3243b97227f6e04016af99`; report updated. This validates the cache accounting caveat in your note.
