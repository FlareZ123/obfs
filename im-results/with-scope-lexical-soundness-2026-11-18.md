# Dynamic `with` environments and obfuscator-injected lexical names

**Status:** Reproduced semantic correctness defect and conservatively repaired
in experimental source branch on **18 November 2026**. Intermediate evidence,
not a strong-obfuscation or tamper-resistance result. The project-wide release
decision in `results/README.md` remains **RELEASE-BLOCKED**.

## Contract and mechanism

In non-strict classic scripts and CommonJS, a `with (object)` statement adds
a dynamically resolved object environment record. ECMAScript 2026 describes
`ObjectEnvironmentRecord.HasBinding` and `Symbol.unscopables` under
[environment records](https://tc39.es/ecma262/2026/multipage/executable-code-and-execution-contexts.html).
A Proxy can return true for a newly generated identifier even when the
original source did not contain that identifier.

Two independent compiler locations incorrectly assumed stable lexical
resolution across such an object environment.

1. **Captured intrinsic proof.** `src/decoder-safe-reads.js` previously
   accepted `const get=Reflect.get;with(globalThis.opaqueScope) {
   module.exports=get({known:2},'known'); }` as a proof of native
   `Reflect.get` usage. The opaque object's `get` member can shadow the
   apparently immutable local. A host callback may use the call to observe
   the source text of a function that string encoding changes.
   The conservative repair marks all `WithStatement` sites as ambiguous
   when evaluating this narrow proof. This does not otherwise weaken the
   existing positive accepted native calls outside such a program.

2. **Injected string helper.** `src/strings.js` previously encoded a literal
   inside a `with` body into `_o<seed-derived-name>[index]`, initialized at
   top level. The scope object can claim the generated name through its
   `has` trap and return a different array through `get`, changing the
   value of an original literal without modifying the compiler output.
   The repair skips source literals with a `WithStatement` ancestor.
   Literals outside that dynamic environment remain eligible for encoding.
   Nested function bodies lexically contained in `with` remain excluded,
   even when invoked after control leaves the block.

The defect is a compiler compatibility issue for source-visible/host-provided
dynamic scopes. It exists without a full-control code-recovery attack.

## Reproducible red and green evidence

The test file `test/decoder-safe-captured-read.test.js` includes a native
`vm` callback that returns an observed function's `toString()` rather than
invoking the captured native Reflect intrinsic. On a frozen source and fixture
with the guard absent, [run 44307843976](https://github.com/FlareZ123/obfs/actions/runs/44307843976)
failed. Adding the `WithStatement` refusal at
`0bd906d233236008e972ce5c8616276cdbe14ddd` produced the
[successful two-platform focused run 44307974643](https://github.com/FlareZ123/obfs/actions/runs/44307974643).

The separately added
`test/with-dynamic-scope-strings.test.js` covers each of three modes
(COO/SCO/SNO) in both non-strict CommonJS and classic-script contexts.
For each of those six configurations, tests verify an in-block string,
a nested function string, and a positively encoded literal outside
`with` while preserving its original runtime value. A host-controlled
Proxy dynamically resolves identifiers without knowing the generated seed.

- **Matched pre-fix:** commit
  `a4442ba3b35b9829379a32f0274f01be8c50d3e9`,
  [manual gate 44309247122](https://github.com/FlareZ123/obfs/actions/runs/44309247122),
  **136 passed / 18 failed** in each of Ubuntu and Windows. The intended
  18 new tests failed in each OS.
- **Matched repaired test:** commit
  `7e198b7db4f8e2715beb1600ff7e50039381e765`,
  [manual gate 44308873201](https://github.com/FlareZ123/obfs/actions/runs/44308873201),
  **154 passed / zero failed** per operating system. Its existing Chromium
  ambient-intrinsic check and production JSDoc typecheck also succeeded.
  The repaired string code was at
  `5cc2d4dcacf9c7e1d456e7f75f46ca12de839fc6`;
  the subsequent `7e198b7` commit refined the positive-control fixture.
- The counterfactual branch deliberately contains the **same final test
  file** as the passing branch and the same first intrinsic-proof repair.
  The string literal ancestor guard is the relevant implementation difference.

## Limits and follow-up

The test host is an injected VM Proxy, not an actual remote adversary.
The new rejection reduces protected literal yield for `with` bodies while
retaining at least one verified outside-body rewrite for each tested mode
and grammar. No confidentiality, tamper-resistance, hostile-runtime
authorization or strong static-analysis resistance follows. The explicit
2.5× compute budget and cross-mode adversarial release gate require
independent source-pinned evidence.

The exact [full Node 22 and Chromium integration 44309139935](https://github.com/FlareZ123/obfs/actions/runs/44309139935)
**passed** at source `7e198b7db4f8e2715beb1600ff7e50039381e765`.
Each OS executed 3,363 Node tests. Ubuntu passed 3,362 with one skip;
Windows passed 3,359 with four skips; **zero failures** on both.
Both production and external JSDoc checks, benchmark/profile steps, blind
public recovery matrix, and lockfile-based installation succeeded on both OSes.
All three prescribed Chromium module/host/protected-key steps passed on Ubuntu.
This is a compatibility result for the tested code and samples, not a strict
universal 2.5× budget or hostile-runtime protection certificate.

Continue to examine other compiler-generated identifiers inside source
dynamic scopes. Experimental CFG/VM backends already refuse
`WithStatement`; this report does not certify every backend.
