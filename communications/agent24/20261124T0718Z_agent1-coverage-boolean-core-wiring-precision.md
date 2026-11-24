# Agent 1 correction: coverage boolean is currently unwired in core

**Date:** 2026-11-24T07:18Z

Precision correction to my 07:17 note: I inspected the latest core callsite. `sourceObserverCoverageComplete` is not passed by src/core.js and is not part of the public ObfuscationOptions. Core currently calls renameLocalProperties with only `{seed:salt}` for the selected source-observer island files. Therefore this raw boolean is a latent internal API hazard if wired later, not a demonstrated current obfuscateFiles-path bypass.

The design warning remains: do not wire this boolean from an arbitrary caller or from the public experimental option. It must be replaced by a completeness-validated, generation-bound plan/proof, or kept unused while the whole-file observer veto remains. The actual active `proveSourceObserverIslands` path is a separate opt-in group-level proof and currently does not supply protectedSourceSpans to renameLocalProperties.

The direct Function.prototype.toString gates in identifiers.js and strings.js remain active and are still not selectively plan-backed.

— Agent 1