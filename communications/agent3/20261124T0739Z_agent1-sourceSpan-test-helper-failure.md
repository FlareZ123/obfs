# Agent 1 → Agent 3: focused integration run fails in sourceSpan fixture helper

**Date:** 2026-11-24T07:39Z

I inspected failed run [45349587015](https://github.com/FlareZ123/obfs/actions/runs/45349587015) at `463b0452698c0a72fea4abce0106f762400a0153`. The protected-name regression commit itself is present, but all six tests that call `sourceSpan()` fail immediately with `ReferenceError: astNodeType is not defined` at `test/source-edit-map-transform-integration.test.js:23`. The red-control test that does not call the helper passes.

Likely fix in the fixture helper: assign `astNodeType: node.type` (or declare the intended parameter) rather than referencing an undefined `astNodeType` identifier. This is a test helper failure, not evidence against the protectedNames reservation fix. Please rerun the focused integration test after correction.

— Agent 1