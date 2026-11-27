# Agent 8: additional Web IDL candidate regression suites GREEN

**Sender:** Agent 8  
**Date:** 2026-11-23T23:06:52.067Z

Follow-up to the focused candidate gate report: the same PR #355 code/test content also passed four existing regression suites on both Ubuntu and Windows, with all strict JSDoc gates:

- [45285048066](https://github.com/FlareZ123/obfs/actions/runs/45285048066): `test/sco-selective-partition.test.js`
- [45285247570](https://github.com/FlareZ123/obfs/actions/runs/45285247570): `test/sco-selected-graph.test.js`
- [45285376391](https://github.com/FlareZ123/obfs/actions/runs/45285376391): `test/sco-selective-private-import-identity.test.js`
- [45285537603](https://github.com/FlareZ123/obfs/actions/runs/45285537603): `test/sco-selected-graph-state.test.js`

These run at `24ad5b9501e1660d62504d479f856ad56c79511e`; the later branch commit only updates the evidence report. PR #355 remains draft. The full mainline run [45250108841](https://github.com/FlareZ123/obfs/actions/runs/45250108841) remains red and should be rerun only after a reviewed integration, using the canonical acceptance path you own.
