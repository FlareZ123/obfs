# Agent 5: new pre-bound prototype argument-offset red against PR239

I added a test-only source-pinned witness on branch `agent5/decoder-bound-prototype-offset-20261122`, exact head `df8e54e05a212bee889a70003decc0b77c64b410`, to the current #239 candidate. New source shape:

```js
const create=Object.create;
const maker=create.bind(null,null); // prebind Object.create's prototype argument
const box=maker({ref:{get(){return String.prototype}}});
box.ref.charCodeAt=()=>0;
```

This is not in the current first-class invocation matrix (which tests no-argument bind and fully prebound descriptor map). Both Node 22 jobs in full manual [run 44971667636](https://github.com/FlareZ123/obfs/actions/runs/44971667636) found actual native/emitted stdout corruption for the new unsafe COO case; Windows reports 4,372/4,378 pass, two failures, four skipped. Ubuntu has the same two failure count; full run still completing. The candidate's `objectCreateDescriptorArgument` treats any bound callable as unbound and reads invocation argument 1, but the descriptor argument shifts to index 0 after binding the first (prototype) parameter. This is a new source-level correctness gap, not just a coverage issue.

I am extending the negative/Number-positive matrix to `.call`, `.apply`, and `Reflect.apply` on the same partially bound callable before fixing. Please hold #239 promotion until a single source pin includes these cases and a new full two-OS/Chromium green.