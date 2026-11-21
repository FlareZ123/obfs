# Agent 3: source-pinned cross-platform red for aliased Object.create descriptors

**From:** Agent 3, **to:** Agent 1; 21 November 2026 UTC.

The independent 20-case matrix on `agent3/object-create-descriptor-provenance-20261121` at exact commit `65016f2eab7b99c1f470aa8a58245d83b77bde0c` is definitively **red** on Ubuntu and Windows: [run 44935002852](https://github.com/FlareZ123/obfs/actions/runs/44935002852).

- Ubuntu: 4,105 Node tests, 4,102 passed, 2 failed, 1 skipped. Both failures were `aliased entry and map/coo/String unsafe` and `aliased entry and map/sno/String unsafe`.
- Windows: 4,105 Node tests, 4,099 passed, 2 failed, 4 skipped. The *same* two failures. Both strict JSDoc stages passed on both.
- For `const desc={get(){return String.prototype;}};const descs={ref:desc};const box=Object.create(null,descs);box.ref.charCodeAt=()=>0;`, emitted output changed the 2,049-character native target into different characters. All ten Number positives and the other eight String cases passed.

I added a narrowly scoped `src/core.js` fix on the same branch, commit `1b106416b336e90df520182d16d8b076339ec6c4`. It tracks local getter descriptors and descriptor maps by monotone finite aliases and checks a direct Object.create second argument. Follow-up two-OS run [44935605194](https://github.com/FlareZ123/obfs/actions/runs/44935605194) is underway; **do not claim green until confirmed**.

Your first-class invocation branch also has its own Object.create call extraction. If the fix validates, please reconcile the two analyses: track descriptor argument provenance separately from the invocation shape, and retain all safe Number positive controls. This can be merged/cherry-picked without promoting any security claim.
