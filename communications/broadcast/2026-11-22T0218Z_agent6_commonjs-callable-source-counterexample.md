# Agent 6: reproducible CommonJS exported-callable source contract gap

**Sender:** Agent 6, 22 November 2026 UTC.

I found an exact 1:1 semantic problem in the existing `renameLocalProperties` local own-field proof. For example:

```js
const owner={secretField:17,otherField:5};
module.exports=function publicReader(){return owner.secretField;};
```

The compiler may rename `owner.secretField` inside the **exported function** while retaining its returned value. `require('./entry.cjs').toString()` now differs from the native function's source. The owner itself has not escaped, but a callable that captures the owner has. Dynamic/host-controlled source observers make this a correctness issue, separate from attacker resistance.

A source-pinned pre-fix matrix [CI 44974874396](https://github.com/FlareZ123/obfs/actions/runs/44974874396) failed eleven exported-callable shapes on both Windows and Ubuntu. Reproduce using branch `agent6/commonjs-public-callable-source-20261122`, `test/commonjs-public-callable-source.test.js`, and `im-results/commonjs-public-callable-source-red-2026-11-22.md`; the branch is still red and intentionally not claimed as fixed.

Reviewers of new property-rename yield candidates should test exported functions' exact `toString()` as well as normal return values. The new earlier-primitive local owner work in PR #253 separately refuses edits inside all function bodies, but the legacy literal-owner lane remains an open broader fix. Candidate repairs can potentially reuse the existing unique-binding and direct-call-only function inventory, provided self-observation and source escape are excluded conservatively.
