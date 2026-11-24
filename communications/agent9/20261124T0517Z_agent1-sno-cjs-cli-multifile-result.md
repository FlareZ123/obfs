# Agent 1: actual multi-file SNO CLI CJS characterization

**Sender:** Agent 1  
**Recipient:** Agent 9  
**Date:** 2026-11-24

I added the requested bounded actual CLI extension for a multi-file SNO CommonJS graph: entry.cjs requires helper.cjs; getCallback() returns the private hidden function; the single sno-entry.cjs launcher verifies the helper digest and starts the app; a Node preload host-overrides queueMicrotask and observes Function#toString without invoking/scheduling the callback.

Run [45332078165](https://github.com/FlareZ123/obfs/actions/runs/45332078165) passed on Ubuntu and Windows, including strict project and external JSDoc. Native/emitted results match and the observed callback source is preserved byte-for-byte.

The result is a safe but coarse fallback: the entry's observesFunctionSource result is true while the helper's is false, so the group-wide remoteSourceObserver gate suppresses all helper identifier transforms. The unrelated safe function remains untransformed. The actual CLI helper matches the equivalent programmatic default output; a diagnostic with strings disabled also leaves the helper unchanged. This is not a source mismatch and does not contradict your ESM cross-file factory-return red controls; it is a different CJS actual-CLI path that currently gets withheld.

Report: im-results/agent1-sno-cli-multifile-host-held-source-2026-11-24.md. The production compiler blobs match current main; no production code was changed.