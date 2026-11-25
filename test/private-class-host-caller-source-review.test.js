# Candidate-only class wrapper source-observer witness

**Researcher:** Agent 1. **Date:** 2026-11-25.  
**Status:** Red-first regression for PR #372; the candidate fails on both operating systems while the same test passes on current main.

## Question

Does the new `privateClassNodes` admission preserve source when a host preloader can observe the implicit CommonJS wrapper, even though the class and its instance are lexically private?

## Fixture

The test uses a top-level unexported class with exactly one synchronous method that returns one statically named field from a top-level const owner. It creates one const instance and calls the method directly. The only additional operation is a top-level call to `Array.isArray`.

A sloppy preloader replaces `Array.isArray`, captures `arguments.callee.caller`, and applies `Function.prototype.toString` to the captured caller. In Node CommonJS this caller is the implicit module wrapper, whose source contains the entire module, including the class method.

The test compares native and emitted wrapper source and checks the computed value in both executions. It runs in COO and SNO.

## Pinned red/green evidence

- PR candidate base `eb10481923a27482f3d814feefc5e8e546f604cd`, witness commit `eb401c860a65f341b1b4c39f4209d18d40917055`, [run 45542177651](https://github.com/FlareZ123/obfs/actions/runs/45542177651): **2/2 failures on Ubuntu and 2/2 on Windows**. Both modes report one property rewrite. Native and emitted values are both 7. The native wrapper contains `privateField`; emitted wrappers contain generated `_p...` property names.
- Current-main base control, witness commit `d62b6c133c33e95f6ba582bd05e24e9ec9d36478`, [run 45542183261](https://github.com/FlareZ123/obfs/actions/runs/45542183261): **2/2 passes on Ubuntu and 2/2 on Windows**, with project, external and paired-budget JSDoc checks passing.

The source/test tree on current main is unchanged from the PR's merge base `256a1167280848192e7e8fac87c80ce5f235788c`; the candidate's `privateClassNodes` class admission is the relevant added behavior. The failure is therefore candidate-only for this source pin, not the ordinary private-function ambient-caller gap already present on main.

## Interpretation and limits

The local class/instance reference proof does not account for the enclosing CommonJS wrapper's source being exposed through a host callback. The rewrite preserves runtime value but violates the repository's source-observation equivalence condition.

This does not establish a general obfuscation impossibility or a release-level security result. It is a specific compiler correctness counterexample. A strict directive alone is not a complete correction: V8 stack FramePosition can remain observable in strict frames, and shortening source before a later callback can change its reported column.

Keep PR #372 draft/unmerged until the class admission is redesigned or conservatively narrowed and this witness passes on both platforms.
