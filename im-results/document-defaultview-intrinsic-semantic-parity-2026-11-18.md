# Browser Document.defaultView ambient decoder mutation: paired source-pinned parity

**Agent 27, 18 November 2026. Intermediate compiler-correctness evidence.**

## Runtime failure, distinct from hypothetical alias inspection

An HTML Document's `defaultView` returns its associated
`WindowProxy`, providing an alternative route to the script's global
`String` constructor in the active document.
[MDN Document.defaultView](https://developer.mozilla.org/en-US/docs/Web/API/Document/defaultView)
and the
[WHATWG HTML Standard](https://html.spec.whatwg.org/multipage/nav-history-apis.html)
describe this browser API.

The eager SNO or explicitly enabled COO string literal decoder calls
ambient `String.fromCharCode`. A supplied earlier module can therefore
replace `document.defaultView.String.fromCharCode` before a later
literal-bearing module is loaded. The native later module returns its
literal, but the previous obfuscated decoder used the patched function
and returned a different value.

Three exact browser-shaped aliases were independently tested in
`test/ambient-string-alias.test.js` with a synthesized Node global
`document={defaultView:globalThis}`: directly through
`document.defaultView`, through `globalThis.document.defaultView`,
and through `window.document.defaultView`. The original three-file
CommonJS graph imports the mutation first, then returns a 23-character
literal from the target. The obfuscated output was executed in a
separate Node process per case.

The [red two-platform run 44253730960](https://github.com/FlareZ123/obfs/actions/runs/44253730960)
at SHA `0d3423a76757243c873ac37cce06af31049bd3f3`
reported **three failing semantic regressions per OS** (110 passed,
three failed). A real source-level mismatch was observed: native
`protected-literal-value`, obfuscated
`???????????????????????`. These are actual output values, not
just a compiler refusal-count assertion. The test stopped at the
first SNO mismatch per alias; the same guarding logic is used for
COO, so independent COO execution was covered by subsequent green
runs rather than by this red trace.

## Narrow source-level repair

`src/core.js::mutatesDecoderIntrinsic` already tracks global and
String aliases. Its `isGlobal` predicate previously recognized only
direct global identifiers and could not follow document access paths.
The repair conservatively accepts the known
`document.defaultView` and `globalThis/window.document.defaultView`
paths as potential aliases of the active global object. Simple
`window/self/globalThis` member chains are also recognized. The
existing mutation scanner then refuses unsafe eager encoding
**throughout the supplied file group**. No generated runtime
instrumentation or new runtime work is introduced.

The positive control
`document.defaultView.Number=()=>7` retains eager String literal
encoding in the same Node graph. It shows that the repair need not
turn off all string protection on sight of `defaultView`. Shadowed
or detached documents may cause conservative false refusals; no
general DOM provenance/host realm proof is claimed.

The
[green Node run 44253918909](https://github.com/FlareZ123/obfs/actions/runs/44253918909)
at `51c97d7ba9fe24036a5cf06f3050a11837cbbccb`
passed the targeted regression and production JSDoc on both OSes.

## Real Chromium graph validation

`test/decoder-array-prototype-browser.js` now includes two real
page `Document.defaultView` fixtures: hostile
`String.fromCharCode` replacement (protected literal must decline)
and an unrelated `Number` assignment (the literal must still be
encoded). Each runs genuine native, protected and independently
source-reconstructed ESM graphs over localhost HTTP in headless Chrome,
with CSP `script-src 'self'`. The 2,049-code-unit target's exact
first/last code units and length are checked.

[Two-platform targeted run 44254152077](https://github.com/FlareZ123/obfs/actions/runs/44254152077)
at `26ab680acbe50df82e13210e90d840fd6b051b69`
passed **114/114 Node semantic tests each on Ubuntu and Windows**,
production JSDoc, and **nine** real Chromium browser fixtures on Ubuntu.
In the hostile `defaultView` browser case the compiler emitted
**zero** string-decoder literals; in the unrelated numeric case it
emitted **one** and the independent source-only attack recovered it.
Native, emitted and attacker-reconstructed outputs matched
`{first:65,last:90,length:2049}` in both browser cases. The browser
log reports the other existing seven fixtures separately; this report
claims only the two added `defaultView` contracts as this change's
increment.

## Security, cost and remaining boundary

The behavior fix does not create confidentiality, prevent hostile
runtime access, improve execution authorization, or defeat the
existing public decoder recovery. Accepted programs run the same
generated decoder as before, so no new runtime compute charge is
added. A general universal 2.5× claim still requires separate
workload-specific testing.

External scripts absent from the source group, DOM-proxy aliases
returned through arbitrary function calls, browser realm crossings,
and dynamic syntax remain beyond this syntactic scanner. Source
visible cases are intentionally conservative; absence of a known
mutation is not proof that the environment is immutable.

## Follow-up: source-visible document bindings and destructured defaultView

The first repair recognized only literal `document`,
`globalThis.document`, and `window.document` receivers. It did
not track the equivalent source-visible aliases
`const Doc=document;Doc.defaultView.String.fromCharCode=...`,
`const Doc=globalThis.document;Doc.defaultView.String.fromCharCode=...`,
or `const {defaultView:View}=document;View.String.fromCharCode=...`.
These are ordinary identity-preserving expressions and permit exactly
the same earlier-dependency corruption.

A three-graph test-only extension in
`test/ambient-string-alias.test.js` produced a second paired
[red Linux/Windows run 44254798329](https://github.com/FlareZ123/obfs/actions/runs/44254798329)
at exact SHA `edc12bf16b62dd88926a593779671a341ba3a9fa`.
Each OS ran 117 semantic tests, **114 passed, 3 failed**; the
failures were the three new document-alias scenarios, with native
string-literal output diverging from generated output. The test
compares whole child-process strings before checking suppression,
so the failure is a runtime parity witness.

The second repair broadens the *existing fixed-point alias collector*
in `src/core.js::mutatesDecoderIntrinsic`:

- `documentNames` collects identifiers assigned from
  `document`, `globalThis.document`, or another document alias;
- a known `documentNames` member's `defaultView` enters the
  preexisting global-realm alias set;
- destructuring `{defaultView:View}` from a known document and
  `{document:Doc}` from a known global propagate those sets;
- direct identifier assignments and simple variable declarations
  participate in the same monotonic fixed-point pass.

The conservative source analyzer emits **no new runtime code**.
Unrelated `const Doc=document;Doc.defaultView.Number=()=>7` remains a
positive string-encoding control.

The final [green run 44254995341](https://github.com/FlareZ123/obfs/actions/runs/44254995341)
at SHA `58ebd17ed535a108b2d32889ab63ae6d5721fd35`
passed **117/117 native-versus-emitted tests per Ubuntu and Windows**,
production strict JSDoc, and **13** real Chromium native/emitted/
source-recovered ESM fixtures (Ubuntu). Three newly added hostile
browser alias routes each emitted zero unsafe decoder literals and
preserved exact output; a new bound-document `Number` write retained
one protectable literal, whose value was recovered by the independent
static string attacker. All browser fixtures checked
`{first:65,last:90,length:2049}` against native.

No generalized alias or runtime immutability theorem follows from
the finite set. Member reads through opaque functions, proxies,
unknown module preloads, and mutation outside the supplied graph
remain outside the admission proof. Strong-obfuscation release
remains blocked independently by cost and attacker recovery.

## Follow-up: object-pattern assignments after declarations

A `VariableDeclarator` destructuring guard is insufficient when an
existing variable is populated by a later `AssignmentExpression`
whose left-hand side is an object pattern. Two new real three-file
CJS source-visible cases assign to `View` through
`({defaultView:View}=document)` or to `Doc` through
`({document:Doc}=globalThis)`; both then overwrite the ambient
`String.fromCharCode`.

[Red two-platform run 44255248526](https://github.com/FlareZ123/obfs/actions/runs/44255248526)
at `c99d6af3a3457da3d1cfe7127342fdbd99b5d4f8` observed
**two actual SNO process-output mismatches per OS** and
117/119 passing tests. The native target continued to return the
unchanged literal while emitted code used the tampered decoder.

The safe scanner now shares `recordDocumentPattern(pattern,owner)`
between `VariableDeclarator` and `AssignmentExpression`. It follows
only statically recognized source-owner pairs and bound identifiers,
adding a potential document or WindowProxy to the same fixed-point
alias sets used by the original intrinsic-mutation refusal.
No runtime instrumentation or network lookup was added.

[Green two-platform run 44255415512](https://github.com/FlareZ123/obfs/actions/runs/44255415512)
at `c03a77cf5cfb5003f6fdc04baba2937c9adf246c`
passed **119/119** Node semantic regressions on each OS,
production JSDoc, and **16** real Chromium native/emitted/recovered
ESM fixtures on Ubuntu. The two new hostile assignment forms
emitted **zero** string-encoded literals, while assigning an unrelated
`Number` property through destructured `View` preserved one
encoded literal and the independent static-recovery canary.

These checks establish the named source-visible patterns only.
A dynamic property bag, arbitrary factory, external preloaded scripts
and a fully hostile runtime remain outside this compiler proof.

## Follow-up: cross-module imported Document identity

The preceding alias scanner tracked only direct file-local
bindings. A `require('./owner.cjs')` call can return a document-like
object from a separate supplied module. A consumer can then mutate
`Doc.defaultView.String.fromCharCode`, where `Doc` is the opaque
`require()` result. The scanner previously treated that identifier
as unrelated to the document and emitted a corruptible decoder in
the target module.

A new four-file CommonJS regression imports the document from an
owner module after the entry initializes `document.defaultView`,
modifies the constructor in the mutator module and loads the
unchanged native target literal last. The
[red two-platform run 44255769510](https://github.com/FlareZ123/obfs/actions/runs/44255769510)
at SHA `9cb319e9684014f260f84360e2390ffe35f8e79f`
recorded **119/120 tests passed, one failed** on both Ubuntu and
Windows. The failing *actual emitted process output* was 23 question
marks rather than native `protected-literal-value`.

The repair conservatively adds opaque values from a source-visible
`require(...)` assignment and all local ESM import bindings to
the possible-Document alias set. Their actual identity is unproven,
so an eventual `.defaultView.String` mutation can disable eager
decoding. Unlike a blanket imported-module rejection, unrelated
`Doc.defaultView.Number=()=>7` writes retain positive string
encoding. Other unproved module-return patterns remain outside this
bounded syntactic admission logic.

The initial CommonJS fix passed the targeted cross-platform
[run 44255905123](https://github.com/FlareZ123/obfs/actions/runs/44255905123)
at `d9843b79c620372f052009ed0d4512d35c42b274`.
A separate two-case real **ESM** fixture uses
`import {Doc} from './owner.mjs'`: the hostile String mutation
is refused and unrelated imported Number mutation continues to
encode a literal. Both execute the full graph in a fresh Node child
process. The
[green run 44256040665](https://github.com/FlareZ123/obfs/actions/runs/44256040665)
at `40966c4af2f462b016d8d1110f5d2958bcaf8abc`
passed **132/132 Node semantic tests per OS**, production JSDoc,
and its prior 19 real Chromium source-/output-parity fixtures.

Finally, the same two imported-Document variants were appended to
`test/decoder-array-prototype-browser.js`, whose graph now contains
a fourth `owner.mjs` file. The final
[green targeted two-platform run 44256257798](https://github.com/FlareZ123/obfs/actions/runs/44256257798)
at `9142e64bdd9de4f0c2ae5318b026d37100c75668`
passed **132/132 Node tests each OS**, production JSDoc, and
**21 actual Chromium native/emitted/recovered module-graph fixtures**.
For the imported-Document String patch it emitted zero decoder
literals and matched native output, while the unrelated Number
import retained one encoded literal and the source-only attacker
recovered it. Exact first/last/length values remained
`{first:65,last:90,length:2049}`.

The scope remains finite: opaque imported constructors might expose
other intrinsic mutation paths, module loaders may execute external
code, and arbitrary runtime instrumentation remains available to
the COO/SNO attacker. The fix does not establish security against
public-source reconstruction, dynamic extraction or universal CPU
admission. All observed new checks were build-time source analysis,
with no added emitted runtime work.

## Final source-coincident full-suite caveat

A broader [manual validation run 44256264367](https://github.com/FlareZ123/obfs/actions/runs/44256264367)
was also dispatched at the **same exact** final targeted-green
SHA `9142e64bdd9de4f0c2ae5318b026d37100c75668`. Its Node
phase reported 2,956 tests per platform, with **Ubuntu 2,953
passed, 2 failed, 1 skipped** and **Windows 2,951 passed,
2 failed, 3 skipped**. The two failures on each OS were the
independently authored `test/decoder-opaque-prototype-source.test.js`
`overridden Reflect.get invalidates numeric proof` cases for
SNO and COO. Replaced `Reflect.get` returned a mutable
`String` constructor on a Number-prototype lookup, corrupting
another eager decoder. These tests were added by Agent 10 at
`0d8ede5cf502b8fe141f2dc910465dc50e8e3748` before this run.
They are an additional real intrinsic-admission defect, separate
from this report's Document defaultView paths. Agent 10 was
notified at `communications/agent10/2026-11-18T0710Z_agent27_reflect-get-full-CI-failure.md`
because they own the concurrent prototype-provenance track.

Therefore the statement that this document-alias change passes its
**targeted** native and Chromium differentials is justified, while
a statement that the **entire** compiler has passed a latest
source-coincident mainline regression gate would be false.
The general strong-protection release decision remains blocked.
