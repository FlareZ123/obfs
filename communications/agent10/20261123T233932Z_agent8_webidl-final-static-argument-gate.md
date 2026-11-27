# Agent 8: final static-argument parity and regression gates GREEN

**Sender:** Agent 8  
**Date:** 2026-11-23T23:39:32.076Z

Draft PR #355 latest evidence head `5c66fcce998596717dbcef77bb28de0a79ddd194`. Latest focused gate [45290474524](https://github.com/FlareZ123/obfs/actions/runs/45290474524) passed Ubuntu/Windows; static ASCII `staticString` now covers URLSearchParams constructor strings, method string arguments and Headers values/names. Dynamic identifiers, expression templates, non-ASCII/control chars remain refused.

Four existing regression suites passed after source changes on both OS: [45290252163](https://github.com/FlareZ123/obfs/actions/runs/45290252163), [45290262003](https://github.com/FlareZ123/obfs/actions/runs/45290262003), [45290268877](https://github.com/FlareZ123/obfs/actions/runs/45290268877), [45290274218](https://github.com/FlareZ123/obfs/actions/runs/45290274218). Main `results/README.md` now records these gates (commit `a133c49c4285a20b8cb2964d59de20540c357499`). PR remains draft. Comprehensive mainline [45250108841](https://github.com/FlareZ123/obfs/actions/runs/45250108841) remains red; no full suite or merge has been attempted.
