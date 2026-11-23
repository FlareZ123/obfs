# Bound Blob constructor: private-field positive versus exported-source veto

**Agent 7, 23 November 2026. Intermediate correctness regression disposition.**
This changes only a test fixture. It is neither a new Blob safety proof nor an
obfuscation-strength improvement.

The compiled `test/blob-constructor-alias-source-observer.test.js` previously
required two private-property rewrites with this module body:

```js
const owner={hiddenCount:41,secretDelta:2};
const make=Blob.bind(null);
new make([],{type:"text/plain"});
module.exports=()=>owner.hiddenCount+owner.secretDelta;
```

The exported arrow callable is source-observable by consumers. Altering
`owner.hiddenCount` or `owner.secretDelta` changes its
`Function.prototype.toString` result. Current
`src/properties.js::proveLocalObject` therefore declines both
rewrites. The separate AST-wide `observesFunctionSource` check returns false
when source inspection is possible *externally* but absent from the file, so
its false result does not imply it is safe to rewrite the publicly exported
callable.

## Evidence

- **Pre-change main** `24f782ab48099911e08bdea739194bff940f9875`,
  [focused run 45277782397](https://github.com/FlareZ123/obfs/actions/runs/45277782397).
  Ubuntu and Windows Node 22.23.4 each passed two existing negative tests and
  failed exactly the primitive-positive test on `0` versus `2` expected
  property rewrites. That is a coverage expectation failure, not evidence
  that source-observable rewriting would have been correct.
- **Corrected branch** `1db22ea0e3456d4ae6e20da272cd544089b79c1c`,
  [focused run 45278022330](https://github.com/FlareZ123/obfs/actions/runs/45278022330),
  passed the expanded suite and strict project/external/paired-budget JSDoc
  gates on both OS.
- [PR #362](https://github.com/FlareZ123/obfs/pull/362) merged as
  `5e3d11ff8ca1423db5f16e4e96612a0a65a9e930`. The
  [post-merge main run 45278213505](https://github.com/FlareZ123/obfs/actions/runs/45278213505)
  at that exact source passed focused tests and JSDoc on both OS.

The corrected positive has the same bound-Blob operation but directly exports
the evaluated `owner.hiddenCount+owner.secretDelta` numeric result,
requiring two actual private-property rewrites plus original/output numeric
parity. The added negative independently exports the arrow callable and
requires zero rewrites, original/output numeric equality and exact
`Function.prototype.toString` parity. This preserves positive transformation
coverage without sacrificing an observable public function's source.

## Limits

No production compiler file, security mode, VM, performance setting, or
obfuscation architecture changed. No unfocused comprehensive suite was run for
this commit; the project's existing RELEASE-BLOCKED decision remains.
Other stale coverage expectations require individualized source-contract proof.
