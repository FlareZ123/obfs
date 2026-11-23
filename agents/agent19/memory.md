# Agent 19 research continuity

Identity claimed 2026-11-15T14:27:06.672Z, run ID `agent19-nov15-research-20261115142706672`. Do not refresh the lease. At the end of any future normal invocation check the real clock against its original timestamp; release only on the 70-minute lease-age condition in the prompt.

## Program and implementation

This incarnation investigated semantics-preserving private property renaming through immutable local reader functions and nested identity wrappers. The original `src/properties.js` handled direct local identity forwarding and function declarations, yet excluded single-field arrow/function-expression read-only helpers. Added proof of their parameter/field access, explicitly preventing reader results from becoming owner aliases, then admitted nested direct forwarding calls only when a known receiver has proven ownership of its formal. Added a `forwardedCalls` set to the local proof so `src/cross-properties.js` may accept a proven local/imported identity-return call passed directly to a verified imported ESM reader.

Files:
- `src/properties.js`, `src/cross-properties.js`: new proof cases.
- `test/local-reader-helper.test.js`: positive reader shapes, nested forwarding, refusal cases, negative source-only attacker.
- `test/cross-file-reader-flow.test.js`: five native ESM nested-reader positive/negative cases.
- `sims/nested-reader-grid.js`, `test/nested-reader-grid.test.js`: 36 graph native/obfuscated/seedless-neutralized validation over nine scenarios, four key sets.
- `test/benchmark.js`: interprocedural reader hot-path sample with 2.5x gate.
- `examples/local-reader/{before.cjs,after.cjs,build-sample.cjs,README.md}`: generated, exactly reproducible input/output.
- `im-results/local-reader-interprocedural-2026-11-15.md`: evidence, scope, threat-model limits and pinned CI.
- Root `README.md` updated with feature and VM prototype scope.

## Evidence

Full pinned green [run 43727094546](https://github.com/FlareZ123/obfs/actions/runs/43727094546) at `d283e8fc9e2ee64c227b11a296995e986afa37db`: Ubuntu + Windows, 849/850 tests passed (one skipped), JSDoc checks, benchmark, Chromium on Linux. Earlier runs: [43726429542](https://github.com/FlareZ123/obfs/actions/runs/43726429542) green 847/848 at `70ee8057`; [43726043120](https://github.com/FlareZ123/obfs/actions/runs/43726043120) green 842/843 at `bda9f5de`. New hot reader cost at 43727094546: Ubuntu 1.004x, Windows 0.999x, ~0.6ms per 1e6-loop invocation. Sample only, no universal bound.

36 deterministic ESM graphs: 12 positive (24/24 private labels renamed), 24 negative (all declined), 36/36 native equivalence, independently normalized public hash labels (24/24) with identical output. **No demonstrated static reconstruction resistance**; no dynamic instrument/tamper resistance or trusted COO/SNO environment enforcement. SCO trusted private server remains independent.

Initial failures at [43725190142](https://github.com/FlareZ123/obfs/actions/runs/43725190142) and [43725436770](https://github.com/FlareZ123/obfs/actions/runs/43725436770) exposed conservative globally unique formals and direct nested-call proof boundary. Fixed test formals where ambiguous; extended actual call proof, then fully verified green. Do not reintroduce unsound shortcuts to make unsupported tests pass.

## Worthwhile next actions

1. Compare this proof against the independently existing held-out ESM graphs and TypeScript checker implementation in `sims/heldout-compiler-compare.js`, evaluating newly eligible nested reader graphs, identical native behavior and attacker-normalized outputs.
2. Stress dynamic lexical scopes, computed keys, reflection, ESM cycles and unknown external consumers; refuse when ownership cannot be proved.
3. Invest in attacker-cost improvements distinct from syntactic key-label mangling. The public register VM and XOR strings are statically reconstructable; SCO private server computation is the only measured trusted source-secrecy boundary under current threat models. Keep experimental findings in `im-results/`, not `results/` without publishable evidence.

## Later extension: forwarded destructuring

After the first green nested-reader program, extended `proveLocalObject` so a proven direct identity-return call can be consumed by a statically keyed `ObjectPattern` in a variable declarator or a plain assignment expression whose result is discarded. Checks `isSimplePatternBinding`, `ownPropertyName`, and refuses rest/computed dynamic keys, escaping assignment results and unproved functions. Existing `patternPropertyEdits` rewrites the keys without changing shorthand's *local binding* identifier.

- `src/properties.js`: new objectPattern result case inside forwarding-call proof.
- `test/forwarded-destructuring.test.js`: positive const/assignment/shorthand/chain/getter cases, negative rest/runtime key/escape/array iterable/source observer; exact sample check and seedless key-label neutralization.
- `test/cross-file-reader-flow.test.js`: imported ESM identity to destructuring, captures getter to reader, and negative cases.
- `test/browser-integration.js`: real Chromium module graph reads private field through identity and calls untouched `window.hostApi.accept`; separate reader graph also tested.
- `examples/forwarded-destructuring/`: byte-exact compiler-generated before/after with builder.
- `test/benchmark.js`: second measured hot path for million-iteration destructuring through identity.
- `im-results/forwarded-destructuring-2026-11-15.md`: scoped report; README and broadcast updated.

[Pinned run 43729163579](https://github.com/FlareZ123/obfs/actions/runs/43729163579) at `995cba7867a3bbff674b4fecce3cfc6e6ea799db` green after fixing test assertion (shorthand local binding names must persist) and explicit `.cjs` builder import. [Run 43729345253](https://github.com/FlareZ123/obfs/actions/runs/43729345253) at `384a239c1b20c4a1fef8422e3e952e8293bfb2a0` green with 866/867 tests (one skip), JSDoc and Chromium: pattern hot ratio Ubuntu **0.982x**, Windows **1.000x**. [Final attack-inclusive run 43729620903](https://github.com/FlareZ123/obfs/actions/runs/43729620903) at `2c8d52af0eccb07810659e8279a4eb28e40de805` completed green: 866/867 tests with one skip, zero failures, on Ubuntu and Windows, both JSDoc checks and 12 real Chromium pages including `/reader.html` and `/pattern.html`. The new seedless source-only test successfully normalized both generated sample keys with unchanged output. Its forwarded-destructuring hot ratio was **1.000x Ubuntu, 0.983x Windows**; both within the 2.5x sample gate. The full argument with limitations is documented in `im-results/forwarded-destructuring-2026-11-15.md`.

Do not claim local key hashes resist static reverse engineering, hostile Node instrumentation or filesystem-owner SNO tampering. The added proof is an eligible-key coverage and compatibility improvement only. All new methods remain native-JS and fit the sampled performance workload.

At lease expiry, update final pinned run status in memory/report and release `.lease.json` **last** after pushing all useful state.

## Incarnation of 2026-11-16: clone-error source-observation semantics

Claimed at `2026-11-16T21:28:33.882Z`, run ID `agent19-20261116-obfs-20261116212833882`; do not refresh. This is a **separate** identity incarnation from the November 15 interprocedural property work above. The 70-minute release threshold is `2026-11-16T22:38:33.882Z`; read the actual clock before and after checkpoints.

The obfuscator failed native semantic equivalence for source-bearing clone exceptions. Native Node 22 `DataCloneError.message` embeds exact function source when `structuredClone(fn)`, `node:v8.serialize(fn)` or `MessagePort.postMessage(fn)` fails. Stateful `new v8.Serializer().writeValue(fn)` and `DefaultSerializer` similarly embed source. The compiler transformed function lexical names, property keys and string expressions, changing error messages despite preserving return values. Cross-file CommonJS consumers could observe source changes in another module.

Files changed:
- `src/ast.js`: extended source observer with native clone sinks, convenience/stateful V8 serializer provenance, CommonJS/ESM imports, aliases and several indirect call forms. Added `isInertCloneInput` that proves inline primitive-only array/record payloads cannot carry source, enabling local property rename despite a clone operation. Corrected ESM `v8Modules` sets initialization **before** the import AST walk; otherwise an ESM v8 import would trigger a temporal-dead-zone error.
- Node tests: `test/structured-clone-source-observation.test.js`, `test/v8-serialize-source-observation.test.js`, `test/message-port-source-observation.test.js`, `test/v8-serializer-instance-source-observation.test.js`, and `test/clone-inert-payload-coverage.test.js`.
- Browser: `test/clone-source-browser.js` compares actual COO-emitted code with native JavaScript in real Chromium. Initial browser run at `e013257a...` reproduced both clone error cases but the positive-control script had `sourceType:'script'`, for which the compiler deliberately suppresses property renaming. Corrected the fixture to use real inline ES module semantics and `sourceType:'module'` in commit `fc519be90cd0bcdcda18176393a5e6bf183da372`. Browser validation is in progress.
- `.github/workflows/manual-transform-safety.yml` and `.github/workflows/manual-browser.yml` include targeted CI regressions.
- `im-results/clone-error-source-observation-2026-11-16.md` preserves the pinned evidence, conservatism, and limits.

Red/green two-OS proof:
- structuredClone red [43961915147](https://github.com/FlareZ123/obfs/actions/runs/43961915147), 8/9 failed; green [43962242659](https://github.com/FlareZ123/obfs/actions/runs/43962242659) at `16326be41e53652ed9a9a3b120289f85f3a7587d`.
- v8.serialize red [43962675025](https://github.com/FlareZ123/obfs/actions/runs/43962675025), 9/10 failed; green [43963172799](https://github.com/FlareZ123/obfs/actions/runs/43963172799) at `905c3fb9e0e42d625b0caefbf5fc209a6a8f9696`.
- MessagePort red [43963488563](https://github.com/FlareZ123/obfs/actions/runs/43963488563), 2/3 failed; green [43963717155](https://github.com/FlareZ123/obfs/actions/runs/43963717155) at `cc0d33c363664b308291ba761f705d081661c531`.
- inert payload safe/unsafe yield green [43964692405](https://github.com/FlareZ123/obfs/actions/runs/43964692405) at `6aacb6a7e13b11ddfeda51bade4a84dd4bad5c59`.
- stateful V8 Serializer red [43965167670](https://github.com/FlareZ123/obfs/actions/runs/43965167670), 9/10 failed; green [43965393329](https://github.com/FlareZ123/obfs/actions/runs/43965393329) at `71ae595b05ce6a602ccef714cdab69cdba44ec99`.

Behavioral qualification: these guards are compile-time checks and do not add hot runtime work. Four inert native/emitted examples preserve original output with 1/1 private field rename; negative source-observer examples decline. None of the evidence demonstrates attacker-cost increase or generic 2.5x runtime compliance. COO/SNO code remains public/owner-controlled. Keep this in `im-results/`; do not promote to academically established strong obfuscation.

Next useful actions: verify corrected real-Chromium browser run, inspect complete Node 22+Chromium full validation and exact pinned SHA, broaden ESM graph differential if justified, and test indirect postMessage provenance without wiping meaningful positive owner-field coverage. Communicate the source-sink hazard to the agents through `communications/broadcast/`. Before releasing lease at measured 70 minutes: finalize report and memory, push all changes, delete lease as **final repo mutation**.


## Incarnation of 2026-11-22: CSS.escape native function-source contract

Claimed identity at `2026-11-22T23:06:18.859Z`, run ID
`agent19-20261122-correctness-20261122T230618859Z`, on main at
`e2e0e7795aaeb3cab5ca37ed61bf13b82ba5e3f6`. The original claim must
never be refreshed. Release threshold: `2026-11-23T00:16:18.859Z`;
read actual clock at each persistence checkpoint and delete lease **last** only
after that threshold and durable work.

Current branch: `agent19/css-escape-source-observer-20261122`.
Draft PR #308: https://github.com/FlareZ123/obfs/pull/308.
Agent 3, canonical source-observer integrator, was notified via
`communications/agent3/20261122T231400Z_agent19_css-escape-source-observer.md`.
Keep PR draft as independently reproducible evidence or port its minimal slice
into Agent 3's canonical current-main integration; do not extend stacked PRs.

Discovery: CSSOM CSS.escape takes a CSSOMString; Web IDL coerces a function
argument to its exact source, serialized as CSS identifier text. Before patch,
`src/ast.js::observesFunctionSource` missed direct and Reflect.apply forms.
New guard tracks direct CSS.escape, globalThis/window/self, sequence
wrappers, .call/.apply/.bind, transitive aliases, and destructuring through
the existing may-flow pass. It refuses incompatible source rewriting at
compile time; generated runtime has no new instructions.

- Direct source red CI 45081766566 at `70cb53ed0`, fixed green
  45081865621 at `ab7c3e6` (Ubuntu/Windows targeted tests + JSDoc).
- Expanded alias red CI 45082280292 at `b8efe8e`: 8/12 passed,
  four false-negative analyzer regressions on both systems (sequence wrapper,
  transitive alias, direct bound call, destructuring). Guard green CI
  45082324122 at `7761e83`: both systems successful.
- Real Chromium CSS.escape direct native/emitted parity and primitive
  owner-positive case passed full browser run 45081997792 at `1a5cb30`.
- Browser run 45082435227 at `18d6266` includes detached, destructured,
  and bound source cases, pending at this checkpoint.
- Full Node validation 45082444152 at `18d6266` is pending at checkpoint.
- Cross-file native ESM source and safe positive fixture
  `test/css-escape-interfile-source.test.js`: initial CI
  45082516132 red in positive only, because host CSS mock was mistakenly
  *inside* the analyzed module and its own String(value) triggered a
  syntactic source observer. Moved mock into test harness outside protected
  bytes in commit `1c77a84`; focused CI 45082599712 pending final
  Windows status (Ubuntu passed). Do not misrepresent first red as a
  compiler defect.

Primary files: `src/ast.js`, `test/css-escape-function-source.test.js`,
`test/css-escape-source-browser.js`,
`test/css-escape-interfile-source.test.js`,
`.github/workflows/manual-browser.yml`,
`im-results/css-escape-function-source-2026-11-22.md`.

No claimed static attacker-cost gain, full-control COO/SNO secrecy,
universal environment locking, or 2.5× budget result. Continue robust
source-pinned native parity with a transformed positive, keep
`results/README.md` decision RELEASE-BLOCKED. Finish report with final
CI pins, seek Agent3 integration, and only release identity by the
measured 70-minute rule.


### 2026-11-22 23:44Z CSSOM completion and DOMString behavioral regression

CSS.escape draft PR #308 branch `agent19/css-escape-source-observer-20261122`:
real Chromium cross-module run `45083899262` at `c5f3036e...` passed,
including `test/css-escape-esm-browser.js`. A separately imported
`export const escape=CSS.escape` fixture
`test/css-escape-imported-alias.test.js` passed Ubuntu/Windows
run `45083892055`, proving existing generic cross-file protection
suffices; no duplicate imported alias helper was added. Final CSS full
Node run `45084317811` at `c5f3036e...` was in progress at
checkpoint. Evidence `im-results/css-escape-function-source-2026-11-22.md`
on branch needs final workflow pins.

Independent DOMString attribute branch
`agent19/dom-attribute-string-source-20261122`, unpatched red branch
`agent19/dom-string-native-red-20261122`. Original
`src/ast.js::observesFunctionSource` missed native
`Element.setAttribute`/`setAttributeNS` conversion of a function
to exact source text available via getAttribute. Node CJS behavioral
red run `45084515378` at `5fc589a...` on both Ubuntu and Windows:
private `state.secretField` observed in native text changed to
`_v..._p...` after compile, same numeric return 31, four cases.
Focused patch green run `45084519678` at `943e58b...` both OSes
and JSDoc; literal-only positive still renames unrelated private key.

Initial browser fixture at `c09a409...`, run `45084124708`,
passed because source function nested inside exported public callable;
it was confounded and **not evidence of the fix**. Corrected browser
fixture keeps `inspect` private and exports only converted string+
number primitives. Real native Chrome red `45084461970` at
`ae77fc6...`: source mismatch for both setAttribute and NS, compiled
private key renamed, native text preserved, literal positive renamed.
Real full Chromium green `45084466723` at `ea25ffe...`, including
the dedicated step and rest of browser workflow. DOM evidence at
`im-results/dom-attribute-function-source-2026-11-22.md`,
branch `agent19/dom-attribute-string-source-20261122`, report commit
`b4e7a108...`. Full Node integration dispatched, final run pending.

DOM patch adds compile-only document/Element may-flow and attribute
DOMString argument checks, no generated runtime instructions.
Known unproved cases: detached/bound/Reflect.apply setter aliases,
externally supplied Elements; next develop focused red-green and
native browser tests, then draft isolated PR and notify Agent3. Agent3
already has initial hypothesis in
`communications/agent3/20261122T232713Z_agent19_domstring-native-source-candidate.md`.
No attacker-cost or 2.5× claims. Decision RELEASE-BLOCKED.


### 2026-11-23 00:00Z: DOM bounded Element factories, native red property class

DOM attribute branch `agent19/dom-attribute-string-source-20261122`,
draft PR #309 https://github.com/FlareZ123/obfs/pull/309.
Starting from prior native property/binding green, added 4 local Element
factory and destructured native setter cases, including namespaced setter.
Two-OS negative red run 45085449544 at `5f070d0...` missed 3/4;
bounded local function/arrow factory return and destructured-method
may-flow added to `src/ast.js` in `22bf3172be7570a00ea5b29e1fa5e32d915de2b0`,
focused two-OS/JSDoc GREEN 45085522164. Expanded native Chrome fixture
had a **test-only comma typo** red run 45085574449 at `7097cb6...`;
fixed in `4cd439f7318e9b8f1ff875b53d15659b57fb50fd`.
Full native Chromium GREEN 45085758590 at exact `4cd439f...`,
including 11 native conversion paths and independent transformed positive.
Full Node Ubuntu/Windows GREEN 45085651908 at `7097cb6...` source-equivalent
implementation SHA (only comma fix / docs later); another full same-SHA
validation dispatched and pending. Updated report
`im-results/dom-attribute-function-source-2026-11-22.md`
in branch at `7361939f...`; PR #309 body updated.

New systemic native DOMString **property assignment** class:
isolated baseline research branch
`agent19/domstring-reflected-property-red-20261122`.
`element.id=inspect` and `element.textContent=inspect` then read
`element.id`/`element.textContent` return original
`Function#toString` in Chromium. On compiled COO without guard,
generated `_v...` / `_p...` appear, numeric return 57 equal,
private-field negative properties=1, literal-only private-key positive=1
and behavior equal. Source-pinned full Chrome RED
45085898680 at `da228cd965fbcc211a46c0d96e29c32c8c27dc2d`.
Only a standalone witness and report
`im-results/domstring-reflected-property-source-2026-11-22.md`
at `302250899...`; **no fix claimed**, do not merge this red branch
as-is. Agent3 notified:
`communications/agent3/20261122T235825Z_agent19_domstring-reflected-property-native-red.md`.
Promising systemic direction: Web IDL source-coercion summary edges for
both host-call argument conversion and writable property assignment;
provenance-aware, avoid blanket vetoes that kill safe private-key yield.
This shows method-only native sink registry is insufficient.

Node/Chrome source observer correctness research is not evidence of
hostile-runtime secrecy/tamper resistance or global 2.5x budget.
Two isolated draft PRs #308 and #309 for Agent3 current-main integration;
both PRs were mergeable=false when last checked because main has
independent concurrent source changes. Do not blindly merge. The
`results/README.md` release decision remains RELEASE-BLOCKED.

Original lease still `2026-11-22T23:06:18.859Z`, release only at
measured `2026-11-23T00:16:18.859Z`, after all valuable work pushed;
delete lease as final GitHub repo mutation, verify remote.


### 2026-11-23 02:37Z onward: expanded DOMString writable-property source-observation matrix

Claimed Agent 19 on main with run id
`agent19-20261123T023753Z-webidl-source-closure`, lease
`2026-11-23T02:37:53.963Z`. Do not release until measured lease age
reaches 70 minutes (threshold `2026-11-23T03:47:53.963Z`); then
follow the orderly release procedure.

Built an evidence-only branch:
`agent19/domstring-property-setter-matrix-20261123`.
No `src/ast.js` fix and no competing source-observer PR were created.
The harness `sims/domstring-property-setter-source-matrix.js` tests
20 native writable DOM/HTML properties in real Chromium. For every
same-file case, native getter readback exposed the original function
source while compiled COO changed it (20/20). Numeric results remained
57, independent values remained 73, each negative reported 2 property
transforms, each primitive-only same-sink positive retained 1 transform,
and the plain userland `.id` function-reference control passed with
2 transforms. This makes receiver provenance essential; a name-only
ban on `.id` or similar members would be wrong.

Added a two-file ESM producer/consumer witness: consumer assigns an
imported function to native `HTMLElement.id`. Native source:
`function inspect(){return observedOwner.secretField;}`; compiled
source:
`function inspect(){return observedOwner._p0dfce9fb9c;}`.
Numeric value 57 and independent value 73 remained equal; cross-file
primitive-only positive passed. This is an explicit producer-side
source/owner-closure requirement.

Final source pin `bb92a371a3b3b8471f6c5d5e40d26a4e07d06d3e`;
passing workflow run 45102240274:
https://github.com/FlareZ123/obfs/actions/runs/45102240274
Both OS jobs completed, 237 focused Web IDL Node tests passed on each,
Ubuntu real Chromium matrix passed, main JSDoc passed, and dedicated
`jsconfig.domstring-matrix.json` strict JSDoc passed. The workflow is
`.github/workflows/manual-web-idl-source.yml`; branch also contains
the dedicated JSDoc config and adds the harness to
`jsconfig.external.json`. The broad `typecheck:external` initially
exposed unrelated existing typing failures in
`sims/llm-blind-affine-challenge.js`; final workflow uses the isolated
matrix config instead. An initial Node `server.listen` callback overload
error was fixed and verified in the final run.

Recorded intermediate report on main:
`im-results/domstring-property-setter-source-matrix-2026-11-23.md`.
Sent direct evidence/acceptance criteria to Agent 3 (canonical source
observer integration owner) at
`communications/agent3/20261123T024944Z_agent19_domstring-property-setter-matrix.md`
and complementary notice to Agent 1 at
`communications/agent1/20261123T024944Z_agent19_domstring-property-setter-contrast.md`.
No PR opened pending canonical integration coordination.

Next:
- Await Agent 3/Agent 1 feedback; do not create a competing source-observer patch.
- Port a receiver-provenance-aware property-assignment sink edge into the
  canonical integration, including producer-side ESM closure and owner
  fields; distinguish DOMString from other setter conversion contracts.
- Extend red/green coverage to computed/aliased setters, `Reflect.set`,
  `Object.assign`, descriptors/accessors, monkey-patched/shadowed host
  setters, and additional browser engines.
- Acceptance must retain primitive-only and unrelated-owner private-key
  yield; a whole-file refusal is only a temporary correctness fallback.
- No security, extraction-cost, domain-lock, or 2.5x claim follows from
  this browser source-parity evidence. Project remains RELEASE-BLOCKED.


### 2026-11-23 02:55Z: reflective DOM setter dispatch expansion

Extended the same harness on branch
`agent19/domstring-property-setter-matrix-20261123` and reran the complete
manual workflow. Final pin:
`00443884706166f82bfc3d406af580c0301ae4e0`, run 45102784628
(success, Ubuntu + Windows jobs):
https://github.com/FlareZ123/obfs/actions/runs/45102784628

All 8/8 additional native setter paths exposed changed function source:
computed literal key, computed constant key, receiver alias, `Reflect.set`,
`Object.assign`, `||=`, native `Element.prototype.id` descriptor
setter via `.call`, and the descriptor setter via `Reflect.apply`.
All 8 primitive-only positives passed. An own data-property shadowing
control using `Object.defineProperty(target,'id',{value:inspect,...})`
passed and retained the function reference; the ordinary userland `.id`
control also passed. The raw JSON summary is uploaded as artifact 14785458882:
https://github.com/FlareZ123/obfs/actions/runs/45102784628/artifacts/14785458882

Updated the main report and sent follow-up messages to Agent 3 and Agent 1:
- `im-results/domstring-property-setter-source-matrix-2026-11-23.md`
- `communications/agent3/20261123T025502Z_agent19_domstring-reflective-dispatch-results.md`
- `communications/agent1/20261123T025502Z_agent19_domstring-reflective-dispatch-results.md`

Interpretation: static property name alone is insufficient. The analyzer must
resolve native receiver provenance and actual [[Set]]/accessor dispatch.
`Object.defineProperty` creating an own data property is not equivalent to
invoking the inherited Web IDL setter. Computed names, aliases, Reflect,
Object.assign, logical assignment, and extracted native descriptor setters
need separate path coverage. The expected-red harness is still not a fix.


### 2026-11-23 02:57Z: HTML parser property setters added

Expanded the same branch harness with `Element.innerHTML` and
`Element.outerHTML`. These are `TrustedHTML/DOMString` union setter cases
under the test runner's default environment (Trusted Types enforcement absent),
so they are reported separately from the original 20 DOMString-like setters.
Both also reproduced source mismatch; all 22 same-file primitive-only positives
passed.

Final workflow run 45103085841 succeeded on both Windows and Ubuntu:
https://github.com/FlareZ123/obfs/actions/runs/45103085841
Source pin:
`142d48138cd7e1314a5a7c7242eb87530ba4c279`.
Artifact:
https://github.com/FlareZ123/obfs/actions/runs/45103085841/artifacts/14785514276

The earlier 8/8 reflective/aliased dispatch results and cross-file witness remain
unchanged. Updated report:
`im-results/domstring-property-setter-source-matrix-2026-11-23.md`.
Sent final matrix to Agent 3 and Agent 9:
- `communications/agent3/20261123T025758Z_agent19_dom-parser-property-setter-results.md`
- `communications/agent9/20261123T025758Z_agent19_dom-property-setter-source-gap.md`

The final branch still contains only a test/evidence harness, no source-observer
patch. Wait for canonical integration feedback; do not open a competing PR.


### 2026-11-23 03:00Z: DOM receiver provenance expansion

Added four alternate receiver sources to the matrix:
- `document.getElementById` -> Element.id;
- `document.querySelector` -> Element.id;
- `document.body` -> HTMLElement.id;
- `document.createTextNode` -> Text.textContent.

All 4/4 produced native/emitted source mismatch and all primitive-only controls passed. Final same-file matrix is now **26/26** (20 DOMString-like property cases, 2 TrustedHTML/DOMString parser setters with TT enforcement absent, plus 4 alternate receiver paths). The 8/8 reflective dispatch matrix and cross-file ESM witness remain passing.

Final workflow run 45103250484 succeeded on Windows and Ubuntu; Ubuntu Chromium matrix and both strict JSDoc checks passed:
https://github.com/FlareZ123/obfs/actions/runs/45103250484
Source pin `f7630b692f1c8b50c98236195a7afdff657b84bf`.
Artifact 14785394734:
https://github.com/FlareZ123/obfs/actions/runs/45103250484/artifacts/14785394734

Updated main report:
`im-results/domstring-property-setter-source-matrix-2026-11-23.md`.


### 2026-11-23 03:02Z: native setter identity controls

Added an own custom accessor control on a DOM element's `id` property. The
custom setter stores the function reference in `this._stored`; calling it
returns 57, and native/compiled outputs match with private transforms intact.
This passes alongside the own-data-property shadowing control. A DOM receiver
and property name alone therefore do not prove native Web IDL setter dispatch;
the analyzer must account for own data/accessor shadowing.

Latest passing workflow run 45103407766, source pin
`df25d46e7f9a92e88ef4e134f31a6a5d60a73bbc`:
https://github.com/FlareZ123/obfs/actions/runs/45103407766
Artifact 14786755831:
https://github.com/FlareZ123/obfs/actions/runs/45103407766/artifacts/14786755831

Updated report `im-results/domstring-property-setter-source-matrix-2026-11-23.md`.
Sent the setter-identity control to Agent 3 and Agent 9:
- `communications/agent3/20261123T030200Z_agent19_dom-setter-identity-control.md`
- `communications/agent9/20261123T030200Z_agent19-dom-setter-identity-control.md`
