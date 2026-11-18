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


## Browser-level corroboration

The companion source-pinned [manual Chrome gate 44311856707](https://github.com/FlareZ123/obfs/actions/runs/44311856707)
passed for **both Ubuntu Chromium and Windows Node/JSDoc** at
`cf797395aaa8a7136ec31699b553cee63ef8f457`. The new
`test/with-dynamic-scope-browser.js` served original and generated
**classic script files** over loopback HTTP to six independent real Chromium
page pairs, without browser extension or modified DevTools.

Across the three obfuscation modes, each browser fixture checked both
native-versus-transformed values and side effects. The `pure` fixture
tested one positively encoded outside-`with` literal, two preserved
inside/nested literals, and a Proxy with `has` and `get` interception;
`captured` tested an opaque getter returning exact function source.
**All 6 original/generated pairs were exactly equal**, with genuine outside
literal encoding **3/3** across modes and conservative captured-source
encoding refusal **3/3**. The release-gate threat model and
source-reconstruction limitations remain unchanged. This is real-browser
semantic-parity evidence for selected source, not a universal browser
compatibility guarantee.


## Follow-up: host-owned getter can observe an unrelated function or class body

A second, distinct issue survived the original literal-under-`with` guard.
A non-strict source file can contain a function, arrow, method, or class
**outside** a `with` block and then read an **opaque** property from that
block. An external host getter can return the full `Function#toString()`
of that unrelated declaration. The source never mentions `toString`,
`Reflect.get`, or a source-reading API. The previous encoder changed the
function or class's literal into its runtime helper reference, so it changed
the host-visible string.

The exact [two-platform red witness 44314528904](https://github.com/FlareZ123/obfs/actions/runs/44314528904)
at `c94dda02c7129a967a4fd2e9ca1368f82c15d7c3` failed the
**native-versus-obfuscated runtime output** assertion in 12/12 newly
introduced CommonJS cases, across COO/SCO/SNO and four distinct source
forms. For example, V8's original
`function observed(){return 'function-source-payload';}` was reported
by the host while the emitted source reported
`function observed(){return _oede2e31f6dc8[0];}`. A separate in-file
top-level literal remained correctly decoded in both versions.

The conservative compiler correction in `src/strings.js` computes whether
the AST contains any `WithStatement`, then preserves literals nested
inside `FunctionDeclaration`, `FunctionExpression`,
`ArrowFunctionExpression`, `ClassDeclaration`, or `ClassExpression`
regardless of their lexical position relative to the `with` block.
A top-level primitive literal outside a function/class and outside
`with` remains positively encodable. This limits the exact observable
source-text mismatch without claiming that arbitrary hostile host
instrumentation or entire-script source reads can be hidden.

The source-pinned [two-platform green gate 44315058541](https://github.com/FlareZ123/obfs/actions/runs/44315058541)
at `4814207a8f46f215eafb0b5d34f5affd40a5d8ee` added an independent
classic-script variant of each fixture, producing 24 source-preservation
cases across the three modes and both grammars. The established earlier
positive cases also remain exercised by the same focused gate.

In actual Chromium, the extended
[test/with-dynamic-scope-browser.js](../test/with-dynamic-scope-browser.js)
runs 9 page pairs: three modes times pure-literal, captured-reflect,
and this new **generic opaque getter** source observer. The
[source-pinned browser/Node gate 44315351028](https://github.com/FlareZ123/obfs/actions/runs/44315351028)
at `ef2cbd86dc7995607e43f4d8f380b61557fefbc9` passed all nine
native-versus-generated pairs, including all three generic getter
cases with one genuinely encoded top-level literal and exact preserved
function-source bytes. The branch also ran strict JSDoc checks.

The unchanged attacker/runtime threat model still prevents broad
source-secrecy or 2.5× universal claims. Source exactness can also depend
on externally supplied code that inspects complete scripts; this bounded
repair only proves parity in the pinned tests and preservation of these
lexical source ranges.
