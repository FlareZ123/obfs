# Web IDL source-coercion boundaries in the obfuscator (Agent 37, 28 November 2026)

**Status: intermediate, source-pinned compatibility evidence; two draft donors, not an established security result.** This note covers independently reproduced semantic counterexamples and narrowed repairs. It does not establish code secrecy, integrity against a controlling runtime, universal execution locking, or the requested 2.5× runtime upper bound. Main's primary release disposition remains **RELEASE-BLOCKED**.

## 1. Mechanism and oracle

[CSSOM](https://www.w3.org/TR/cssom-1/#the-css.escape()-method) defines `CSS.escape` with a `CSSOMString` argument; the host converts a passed function value to a string. [WHATWG HTML](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html) defines `DOMParser.parseFromString((TrustedHTML or DOMString) string,...)`, and its returned HTML `Document.body.textContent` makes accepted function source observable. In the tested browser, a program can therefore compare source spellings without syntactically referring to `String`, `Function.prototype.toString`, or native `.toString()`.

The distinction is between **ordinary numeric behavior** and **observable source identity**. A selected Wasm i32 lowering may preserve `f(7)` yet replace `function f(x){return x^17;}` with a wrapper. For example:

```js
function f(x){return x^17;}
const cssSource = CSS.escape(f);
const parsedSource = new DOMParser().parseFromString(f, 'text/html').body.textContent;
```

An unguarded transform can change `cssSource` and `parsedSource` even if `f(7)` remains unchanged. The Node tests inject only a host `String(value)` conversion outside the compiled program to isolate this Web IDL mechanism; they do not pretend to implement the full CSS escaping or HTML parsing algorithms. Independent headless Chromium scripts check the real API output.

## 2. Reproducible red/green corpus and source pins

| Oracle | Exact source and workflow | Observed result |
| --- | --- | --- |
| CSS.escape direct source observer, **before guard** | Test-only commit `640ff2731a20f8ec17fbfc2a6c183acb67f584e2`, [run 46125894891](https://github.com/FlareZ123/obfs/actions/runs/46125894891) | Both Ubuntu and Windows: true selected-Wasm positive control rewrote; direct and three-mode source-refusal tests failed (1/3 passing). |
| CSS.escape direct guard, **after initial fix** | `3f1972e5fd719372de0f26bcab6c9585c1227773`, [run 46126202594](https://github.com/FlareZ123/obfs/actions/runs/46126202594) | Both OS: 3/3 focused behavioral tests + project/external/paired JSDoc gates passed. |
| CSS.escape aliases and three-mode primitive yield | `43e48b9bad8bb3115a7d631ee724a729c8551fde`, [run 46126375660](https://github.com/FlareZ123/obfs/actions/runs/46126375660) | Both OS: extended alias and positive controls passed with strict JSDoc. Later inline-bound cases were 20/20 behavioral green in run 46127072242 but that pin had test-harness JSDoc errors, subsequently repaired. |
| CSS.escape two-file ESM with **external** host source observation and private-helper positive | `84a65a613473b90d4948d5c75b38f1e48e373e67`, [run 46127383749](https://github.com/FlareZ123/obfs/actions/runs/46127383749) | Both OS: six cases pass (source parity across three modes; distinct proven-private property rewrite across three modes), JSDoc green. |
| CSS.escape **renamed imported method** red | `b8adf51d25ffa59f83b724307b97d98f09cd075e`, [run 46127546884](https://github.com/FlareZ123/obfs/actions/runs/46127546884) | Both OS: `import {escape as cssEscape}` let selected Wasm change observed source in COO/SCO/SNO (3 failures); three primitive-input Wasm positives remained valid (3 passes). |
| CSS.escape interfile native-method proof after repair | `29f7afd7392167be89d1efbcb7bd37563a9b4668`, [run 46127622325](https://github.com/FlareZ123/obfs/actions/runs/46127622325) | Both OS: repaired focused native-method import source/primitive tests and strict JSDoc succeeded. |
| CSS.escape named/namespace/default/reexport graph matrix | `c8390ddf13c55ae6ee87aba2147c5dc7171e7cbd`, [run 46127895836](https://github.com/FlareZ123/obfs/actions/runs/46127895836) | Both OS: 8 variant × 3 mode × source/primitive = 48 matrix cases, plus original cases, passed and strict JSDoc. More variants and top-level-await dynamic imports were added after this pin and need their own validation. |
| DOMParser direct source observer **before guard** | Test-only `bcbb7496904161ecceb80088f8a54ec03124436b`, [run 46126772073](https://github.com/FlareZ123/obfs/actions/runs/46126772073) | Both OS: 4/8 passed; 4 source-refusal tests failed while numeric counterfactual and 3 primitive positives passed. |
| DOMParser local guard **initial repair** | `c876a80f52d2e4c5d87c8b0efc53cfb494ec42ec`, [run 46126970979](https://github.com/FlareZ123/obfs/actions/runs/46126970979) | Both OS: 8/8 behavioral pass, full workflow RED on added test-harness JSDoc errors, subsequently corrected. |
| DOMParser ESM two-file source and private-helper primitive matrix | `7dbbce880f3c3f90fba981cd8d23f8902cfafa0d`, [run 46127740990](https://github.com/FlareZ123/obfs/actions/runs/46127740990) | Both OS: all six graph fixtures plus strict JSDoc passed. Imported bound-method and dynamic-import provenance were added later; tests pending here. |

Scoped real-browser evidence:

- CSS.escape true Chromium native/transformed witness + primitive-preserving selected-Wasm positive logged **PASS** in [manual-browser run 46126239311](https://github.com/FlareZ123/obfs/actions/runs/46126239311) (source `ce3fa6ff5d28e35d99522002911eb64cb13dfd1a`).
- DOMParser true Chromium source/counterfactual + primitive selected-Wasm positive logged **PASS** in [manual-browser run 46127011086](https://github.com/FlareZ123/obfs/actions/runs/46127011086) (source `d70b7f1e7e725b5dabfb475ddebe0267a06d1f85`).

**Neither entire browser workflow passed**: a separate pre-existing workflow step, `test/bound-runtime-interception-browser.js`, later asserted expected 2 protected-key rewrites but observed 0. Only the Web IDL-specific step may be called green; do not promote that to general Chromium acceptance without source-paired diagnosis of the later failure.

## 3. Implementation sketches and exact branch references

Two draft, **non-merged** PRs:

- [PR #390 — CSS.escape](https://github.com/FlareZ123/obfs/pull/390), branch `agent37/css-escape-source-observer-20261128`. `src/ast.js` recognizes CSS namespace, method, bound/call/apply/Reflect and destructured aliases; `src/cross-properties.js` collects known immutable CSS native aliases exported/imported between supplied ESM files (including relays), and `src/core.js` supplies file-local graph proof to source observation admission. Strictly primitive CSS inputs retain selected Wasm and owner-property rewrite when safe.
- [PR #392 — DOMParser](https://github.com/FlareZ123/obfs/pull/392), branch `agent37/domparser-source-coercion-20261128`. `src/ast.js` recognizes native DOMParser constructor, instance, method and bound aliases, including `.call/.apply/Reflect.apply` paths; `src/cross-properties.js` and `src/core.js` recognize known immutable **bound** methods exported/imported between files. An imported method name is an Identifier callee (not necessarily a MemberExpression); that must be checked generically.

The two PRs touch **overlapping** files, so their patches require reviewed integration and conflict reconciliation; the browser workflow gate also needs exact pin validation. Do not simply merge these two branches into the frozen source-observer acceptance candidate [PR #384](https://github.com/FlareZ123/obfs/pull/384) without independent full-suite/positive-yield review.

From either branch after `npm ci --ignore-scripts --no-audit --no-fund`, reproduce selected cases with:

```sh
node --test test/css-escape-function-source.test.js
node --test test/css-escape-cross-file-source.test.js
node --test test/css-escape-imported-method-source.test.js
CHROMIUM_BIN=google-chrome node test/css-escape-source-browser.js

node --test test/dom-parser-function-source.test.js
node --test test/dom-parser-cross-file-source.test.js
node --test test/dom-parser-imported-method-source.test.js
CHROMIUM_BIN=google-chrome node test/dom-parser-source-browser.js
```

The CSS tests are on its PR branch; the DOM tests are on its separate PR branch. Run corresponding tests in their own branches; a single unmerged checkout does not contain both sets. Paired CI in `manual-validation.yml` adds Linux/Windows runners and strict JSDoc.

## 4. Boundaries, countercontrols and next research

These are **may-observer** analyses. A source-changing transform is refused only where native observer provenance and a potentially nonprimitive operand are established; static primitive source operands and independent private helper/property owners are nonvacuous positive cases. Dynamic program aliasing, arbitrary opaque host calls, mutated exports, runtime getter/proxy effects, and graph path relocation remain unresolved. New top-level-await `import("./literal")` tests and collector patches were queued after the last green matrix pin; inspect their exact CI before claiming coverage.

No experiment here measures resistance to dedicated deobfuscation, dynamic extraction, integrity bypass, domain/URL locking, or universal runtime-budget compliance. The corrections can prevent false claims of behavioral equivalence while allowing targeted obfuscation yield on safe source-independent functions. Future work must source-pin integration through Agent1's source-observer acceptance, test the unfixed full strict runtime limit, compare any unrelated positive-yield declines to baseline and verify real Chromium on the integrated source.
