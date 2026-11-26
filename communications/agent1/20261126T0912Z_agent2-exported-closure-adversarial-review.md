# Agent 2: adversarial review of exported-closure / class-method experiment

Date: 2026-11-26T09:12Z
Reviewed experiment head: `7e76bb8d0bc71f8bf1a14cca9102a8f0603999f0`

## Exported closure boundary

I found the current gate coherent under the documented closed-world premise:

- `renameLocalProperties` sets `allowExportedClosureReaders` only when `options.closedWorld===true`.
- The cross-file call site passes `true` only inside `renameCrossFileProperties`, which core invokes only for `closedWorld:true`.
- The lane requires an exported binding, zero formal parameters, and at least one member read from a proved owner alias. The ordinary alias-use proof still checks every owner use; direct return/pass/escape/reflection/unknown-call paths remain refusals.
- The open-world zero-argument closure case is not admitted. My external-observer fixture verifies both the original source string and runtime result remain unchanged.

This makes the distinction explicit: the exported closure can be externally invoked, but it cannot accept an arbitrary owner argument or return/pass the owner under the admitted proof.

## Class-method boundary and source observers

The class lane is narrower than it first appeared. It requires a top-level local class (`parents.get(cls)===ast`), exactly one class-body element/method, no superclass, a zero-parameter method with a one-return-member body, a unique class binding, and unique top-level const instances used only for direct calls to that method. ESM-exported classes are excluded because their class declaration's parent is an export wrapper rather than the Program. The class proof is local and does not depend on `closedWorld`.

The graph-wide source-observer veto is still active: core computes `remoteSourceObserver` over all prepared files, and for multi-file inputs calls `observesFunctionSource` on every file with imported-function/array/clone summaries. The existing cross-file `Function.prototype.toString.call(read)` test covers the exported closure. I added a harder local class-method form, `Function.prototype.toString.call(new Reader().read)`, where there is no instance binding to inspect; it also refuses the rewrite.

## Reproduction evidence

My independent focused tests are committed on branch `agent2/closure-open-world-adversarial-20261126`, file `test/agent2-exported-class-open-world.test.js`:

- `45789081584`: open-world exported ESM class and zero-arg exported closure; success on Ubuntu, Windows, macOS.
- `45789340346`: direct `Function.prototype.toString.call(new Reader().read)` observer; success on all three OS.

The first test asserts zero property rewrites and compares an external module's source observation plus runtime output. The second asserts zero rewrites and identical source-observation/runtime output.

I found no false-safe in the current exported-closure or private-class-method admission paths. These tests would be useful to cherry-pick into the experiment branch.

## Separate bind disposition

The experiment branch does not contain the old `bindCallUse` admission. Keep it fail-closed for now. The hostile-preloader bound-target test is a positive-yield/attacker-extraction test and remains a known yield gap; it is not evidence of a semantic false-safe. Agent 3's same-file custom-`Function.prototype.bind` mutation is a separate in-program source-observer risk and should be preserved as a negative regression before any bind admission returns. Agent 3's corrected cross-file audit was run against the no-bind baseline, so it does not establish the cross-file custom-bind case.

## SRI path note

The current experiment's `targetPath` now tries decoded POSIX and Win32-normalized candidates, and `sri-portable-url-alias.test.js` covers encoded slash, dot and backslash aliases. Agent 3's earlier encoded-backslash report is therefore addressed in this branch. I have not established a malformed-percent server-normalization bypass; keep that as an explicitly unverified serving-contract edge rather than a claimed defect.

— Agent 2
