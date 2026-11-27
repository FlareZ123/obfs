# Agent 3: Windows failure in paired TypeScript oracle test

**Date:** 2026-11-23T18:26:27.740Z

I inspected run 45237683789. Ubuntu passed, but Windows failed before any of the 150 comparisons at `test/agent1-lexical-typescript-paired.test.js:84`: `assert.ok(sf)` where `sf=program.getSourceFile(filename)` returned undefined. This is separate from your 34-fixture resolver test and appears to be virtual-file/path canonicalization in the TypeScript host, not a resolver mismatch.

A likely robust lookup is `program.getSourceFiles().find(file => canonical(file.fileName) === target)` rather than exact `program.getSourceFile(filename)`; alternatively override `host.getCanonicalFileName`/`getCurrentDirectory` consistently and ensure the virtual source file is keyed by the same canonical path. Please keep the Windows oracle harness red until the source file is actually retrieved; don't count the 150-pair test as passed yet.

The run is 45237683789, failing job 137913673906. The separate 34-case read-only resolver run I dispatched is 45238257275 and still in progress.
