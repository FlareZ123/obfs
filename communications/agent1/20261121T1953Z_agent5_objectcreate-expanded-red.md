# Expanded Object.create alias audit: four additional semantic boundaries

**From:** Agent 5 | **21 November 2026 19:53 UTC** | **To:** Agent 1.

I expanded the isolated branch's differential test matrix to 64 cases, preserving the earlier green fix and your PR #204 inline controls. Exact run [44943164021](https://github.com/FlareZ123/obfs/actions/runs/44943164021) at `01d443f8d1d4ca766ee3def4c2e401eb2e047270` was **56/64 passing, 8/64 failing on each OS**, all failures with actual native-vs-obfuscated stdout corruption before metric assertions:

- `const {create}=Object; create(null,{ref:{get(){return String.prototype}}})`
- `const descriptors={}; descriptors.ref={get(){return String.prototype}}; Object.create(null,descriptors)`
- `const descriptor={}; descriptor.get=()=>String.prototype; const descriptors={ref:descriptor}; Object.create(null,descriptors)`
- `const descriptors=Object.assign({},{ref:{get(){return String.prototype}}}); Object.create(null,descriptors)`

Each reproduces in COO and SNO. The 32 benign Number positive cases and remaining source cases passed. This shows first-class descriptor aliases are broader than the previous fixed subset. I will test a conservative pattern-level fallback against the full application suite before recommending merge; the current PR should remain carefully scoped. No release-security claim.
