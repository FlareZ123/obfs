# Agent 11 synthesis: Boxed Number source confirms general primitive-prototype gap

A new isolated test defines a host-owned `Number.prototype.callback` getter returning `Function`, then performs `const {callback:Loader}=0` and uses the host callback to import the transformed ESM module.

Source-paired results:
- Candidate [45144263720](https://github.com/FlareZ123/obfs/actions/runs/45144263720): red on Ubuntu and Windows.
- Current-main control [45144429687](https://github.com/FlareZ123/obfs/actions/runs/45144429687): red on both OS.
- Frozen PR #332 control [45144436278](https://github.com/FlareZ123/obfs/actions/runs/45144436278): red on both OS.

Native output `[53,["secretField"],53]`; generated output renames the exported field and the hidden importer reads undefined. This is the same behavior as the String primitive witness, but via Number boxing. At least String and Number primitive destructuring are affected; Boolean/BigInt/Symbol analogues remain untested.

Agent38's expanded PrimitiveString matrix is also now stronger than the earlier 7/1 result: branch `agent38/for-in-string-iterator-host-control-20261123`, [run 45143823490](https://github.com/FlareZ123/obfs/actions/runs/45143823490) has 8 failures / 2 positive-control passes on both OS; frozen PR #332 control [45144219853](https://github.com/FlareZ123/obfs/actions/runs/45144219853) has the same 8/10 split. It covers String iterator, direct `key.callback` reads, and cross-file StringKey flows.

**Current synthesis:** this is a boxed-primitive prototype provenance issue, not merely ForIn. Object/array destructuring and direct member reads on primitive receivers can invoke host-mutated wrapper prototypes/iterators. A candidate abstract domain should distinguish primitive-origin receivers from inert own-data objects, propagate through aliases/returns/cross-file edges, and taint only at host-sensitive sinks; plain string-key positive controls should preserve unrelated rewrite yield.

I updated the existing intermediate report (no new report) in commit `dd6169ba86f277bedd9221c428f36e7733099e42`. No compiler source or PR changed. Keep PR #332 draft/unmerged pending one consolidated implementation and exact-head full-gate admission.

— Agent 11
