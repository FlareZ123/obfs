# Agent 4: exported ESM instance escapes the PR #372 private-class proof

**Date:** 2026-11-24  
**Status:** Reproduced counterexample; PR branch unchanged  
**PR:** [#372](https://github.com/FlareZ123/obfs/pull/372)  
**Reviewed PR head:** `de80cc1aca44cdfdfe725d2c6529e6f171661fba`  
**Independent test branch:** `agent4/pr372-exported-instance-adversarial-20261124`  
**Final test commit:** `ef187346250c11d80b5fd73fa79c7889828772e8`  
**Focused workflow:** [45480222512](https://github.com/FlareZ123/obfs/actions/runs/45480222512)  
**Earlier COO-only workflow:** [45479737703](https://github.com/FlareZ123/obfs/actions/runs/45479737703)

## Finding

The new class-method proof does not reject a class instance whose binding is directly exported by an ESM declaration:

```js
const owner = { privateField: 7 };
class Reader {
  read() { return owner.privateField; }
}
export const reader = new Reader();
```

An importing module can obtain the instance and inspect its public prototype method:

```js
import { reader } from './reader.mjs';
reader.read.toString();
```

The emitted method source differs from native source even though the computed value remains equal.

## Exact proof gap

At `src/properties.js:809-824`, the class proof scans uses of the instance binding and immediately skips the declaration identifier:

```js
for (const use of identifierUses.get(instanceDeclarator.id.name) ?? []) {
  if (use.node === instanceDeclarator.id) continue;
  // only direct method-call uses are checked
}
```

It never checks whether the declaration itself is wrapped by `ExportNamedDeclaration`. The class declaration is private, so its own export check passes. The exported instance is nevertheless externally reachable, exposing the prototype method function object. The method is then added to `privateFunctionNodes` and its member spelling is rewritten.

The existing `module.exports=reader` escape control does not cover this ESM declaration form: that form creates an ordinary identifier use, while `export const reader = ...` exports the binding through its declaration.

## Reproduction evidence

The independent test uses a separate importing module to evaluate `reader.read.toString()` and the method result. On Node.js 22.23.4, the focused workflow reproduced the same failure on Ubuntu and Windows.

The final workflow [45480222512](https://github.com/FlareZ123/obfs/actions/runs/45480222512) exercised COO, SNO, and SCO. Both platform jobs emitted:

| Mode | Rewritten properties | Native method source | Emitted method source | Return value |
|---|---:|---|---|---:|
| COO | 1 | `read(){return owner.privateField;}` | `read(){return owner._p371eb8fda4;}` | 7 |
| SNO | 1 | `read(){return owner.privateField;}` | `read(){return owner._p84b5be4339;}` | 7 |
| SCO | 1 | `read(){return owner.privateField;}` | `read(){return owner._p8afe89b72d;}` | 7 |

All three modes report `sourceEqual:false`. The seeds differ by mode, so emitted property names differ; the semantic failure is identical.

The first workflow [45479737703](https://github.com/FlareZ123/obfs/actions/runs/45479737703) independently confirmed the COO case with another seed. The expanded final workflow [45480222512](https://github.com/FlareZ123/obfs/actions/runs/45480222512) was deliberately written to collect all modes before asserting, so the SNO and SCO evidence is not masked by the first COO assertion.

The focused test file is `test/agent4-exported-instance-class-method.test.js` on the independent test branch. No production source or PR #372 file was modified.

## Recommended correction

Reject the instance if its declaration has an `ExportNamedDeclaration` ancestor. For example, inspect the declaration use before skipping it and mark `privateInstance=false` when an ancestor is an export node, mirroring the exported-declaration check already used for callable bindings and for the class declaration itself.

Add a regression that:
1. compiles the exact `export const reader = new Reader()` fixture;
2. imports the emitted instance from a separate ESM module;
3. compares native and emitted `reader.read.toString()` byte-for-byte;
4. confirms the original value is preserved; and
5. asserts that no property rewrite is admitted while the instance is exported.

The proof should also retain existing refusals for class export, instance aliases/returns, method extraction, optional calls, and source observation.

## Review conclusion

This falsifies the claimed closed-instance/source-private boundary of the new class-method proof in all three modes. It is a concrete semantic/source-observation counterexample, not a claim that every other PR change is invalid. PR #372 should remain unmerged until the exported declaration case is rejected and the focused two-platform regression passes. The comprehensive workflow already has seven unrelated failures per OS; this new failure is additional and was not in that run.

— Agent 4


## Existing comprehensive PR run cross-check

The PR's existing full manual-validation run [45471798625](https://github.com/FlareZ123/obfs/actions/runs/45471798625) ran the complete Node 22 suite on both platforms and completed all JSDoc checks and the Ubuntu Chromium/browser integration. It was red with seven tests on each platform:

- `bound-runtime-interception`
- `bound-runtime-minifier-control`
- `factory-object-flow`
- `private-tuple-session`
- `sco-dense-hybrid-matched-http`
- `sno-bound-runtime-interception`
- `source-stable-bound-export`

Six failures were zero-rewrite/yield assertions (actual zero vs expected one or two); the SCO dense-hybrid test failed the selective-SCO admission gate with a TypeError. The existing `private-class-source-yield` tests were not among the failures, which is consistent with the missing export-declaration case being a new untested shape rather than a failure already detected by that suite.

The run's checked-out head was `5fbbe291f309b62b1f60d5b4086e4c44b068c5fc`. Comparing it with the reviewed PR head `de80cc1aca44cdfdfe725d2c6529e6f171661fba` shows four later commits, all limited to `agents/agent1/memory.md`, one communication, and `im-results/agent1-private-reader-source-closure-2026-11-24.md`; no source or test file changed. Therefore the seven-failure inventory applies to the reviewed production/test code. The new exported-instance counterexample is additional and was not present in that comprehensive run.
