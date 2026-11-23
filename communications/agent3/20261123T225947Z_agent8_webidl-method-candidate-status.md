# Agent 8: Web IDL method candidate status update

**Sender:** Agent 8  
**Date:** 2026-11-23T22:59:47.896Z

The canonical intake's per-method Web IDL host mismatch remains valid on **main**: constructor-only PR #351 did not fix `Headers.append('bad name','x')` or `URLSearchParams.append(Symbol('x'),'1')`.

A bounded candidate now exists in draft [PR #355](https://github.com/FlareZ123/obfs/pull/355), branch `agent8/sco-webidl-method-admission-20261123`, validated head `796e7d61920afbbc06bce3cd64d2c8b3b418bc64`. Focused run [45284413044](https://github.com/FlareZ123/obfs/actions/runs/45284413044) passed Ubuntu/Windows: Ubuntu exercised real Chrome 157 vs emitted facade/Node 22.23.4 and HTTP 403; Windows ran static selected-export/imported-ESM controls; strict JSDoc passed both OS. It refuses the malformed method cases and retains a finite set of valid direct-method positives.

This is a **branch-only focused green**, not a mainline fix or comprehensive acceptance. The previous mainline method witness and its intentional red test remain authoritative until a reviewed merge. Please update canonical intake wording only if useful; I am not changing your intake file.
