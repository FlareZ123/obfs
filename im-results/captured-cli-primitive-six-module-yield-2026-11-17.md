# Captured string-typed CLI snapshot restores two-field six-module positive controls

**Agent:** Agent 50. **Date:** 2026-11-17. **Classification:** compiler semantic admission, regression triage, attack reproducibility. It is **not** a claim of general obfuscation security or original-application equivalence.

## Exact issue

The historical source-pinned forensic bisect by Agent 29, reported in [property-yield-first-bad-2026-11-17.md](property-yield-first-bad-2026-11-17.md), identified commit `1c504ad1d01ec43dcb581d2cfaea3967d5b62973` (Agent3 JSON.parse implicit ToString observation) as the first bad commit for three previously positive modified six-module fixtures. The original ESM entry includes:

```js
const cases=JSON.parse(process.argv[2]||'[[1,1000]]');
```

The mutable `process.argv[2]` host cell may be replaced by a function before entry. `JSON.parse` coerces that function to source text for parsing/error generation. Therefore the unguarded expression has an authentic source observation and the compiler must retain its conservative whole-graph refusal. Ordinary CLI invocation without a preloader does not prove an immutable host input.

The normative [ECMAScript JSON.parse algorithm](https://tc39.es/ecma262/multipage/structured-data.html#sec-json.parse) calls `ToString(text)` before parsing, and the official [Node process.argv API](https://nodejs.org/api/process.html#processargv) describes the host-provided argument array. The executable preloader tests additionally establish that a user-controlled in-process replacement can become a function at the actual ToString boundary. The host-mutability conclusion is a tested runtime property here, rather than an assertion that every Node CLI argument is normally a function.

Separately, old tests deliberately changed the frozen six-module graph through `ablate(...,'both')` and either `withOwnKeyCalls` or `withNullPrototypeRecord`, thereby defining two **different, modified** application contracts. The three historic positive gates expected 2 protected field renames in those modified graphs but the added JSON.parse guard produced 0. The original frozen program is unchanged and remains the correct 0-field refusal control.

## Bounded proof

Added `src/ast.js` primitive-dataflow recognition for the precise shape:

```js
const inputValue=process.argv[2];
const cases=JSON.parse(typeof inputValue==='string'?inputValue:'[[1,1000]]');
```

The narrowing requires a unique *top-level* `const` binding declared before use, no dynamic `eval`/with scope, strict typeof equality against the literal `'string'`, a matching identifier in the consequent and an independently proven primitive fallback. It never treats `process.argv[2]` or an arbitrary second host-property read as immutable. Functions are rejected in the guard: even if `inputValue` itself is a function, the value forwarded to JSON.parse is the literal string fallback.

The new `sims/application-challenge-observer-ablation.js::withCapturedStringArgv` modifies only the two already-distinct `own-only` and `null-proto` positive fixtures. The retained `none`, `reflect`, `entry`, `both` opaque source-observation controls have **zero** renamed private fields. The two explicitly typed positive contracts each have exactly **two** renamed fields.

Important limitation: the guarded application has a different hostile-input contract from the original source. Both are separately tested against their *own* native ESM behavior. No compiled transformation silently inserts the guard into user code.

## Differential and adversarial evidence

- `test/typeof-guarded-json-source.test.js` executes native and actually emitted Node CJS files under real command-line strings and an external launcher assigning `process.argv[2]` a function. The typed branch transforms one private field and preserves native stdout in both cases. Ten hostile near-neighbor conditions stay refused: repeated host read, `let`, function/object branches, loose equality, unrelated consequence, `eval`, shadowing, temporal-dead-zone use, raw argv.
- `test/guarded-json-application-positive.test.js` executes each distinct six-module input on Node as native and emitted ESM files, including a `--require` preloader assigning `process.argv[2]` a function before entry. It checks full stdout native==emitted and **2/2** cross-file renamed fields per variant.
- Three historical positive tests, `test/application-challenge-null-prototype-yield.test.js`, `test/application-challenge-token-neutralize.test.js`, and `test/ownkey-comment-static-recovery.test.js`, now compile the **explicitly guarded** modified contracts; all pass. They retain independent public-only source-copy/static reconstruction success as **negative security evidence** rather than a confidentiality win.
- `sims/application-challenge-observer-ablation.js` distinguishes the known native observers and reports `[0,0,0,0,2,2]` private-field coverage across `none`, `reflect`, `entry`, `both`, `own-only`, `null-proto`.
- The independent public-only Acorn token normalization succeeded at four variant/seed pairs with **2/2** published protected properties and **10/10** locally renamed identifiers normalized on each, on **84 observed and 160 held-out cases** per pair. The Ubuntu runner reported static scans of **13.478, 9.444, 9.374, and 9.246 ms**, with neither original source nor compiler loaded in the attacker process. The separate comment-based attacker recovered both original private property names and matched **84** native/emitted/reconstructed cases. These timings are raw scanner observations, excluding any manual attack development, and are not a matched minifier-human workload.

### Source-pinned validation

- [Focused source-guard and native-host test 44184096030](https://github.com/FlareZ123/obfs/actions/runs/44184096030), SHA `c59e1f6c0d9415e4d001a2b6a3e452d28a8cbb0d`: Ubuntu/Windows 79/79 tests and two JSDoc typechecks each.
- [Guarded real six-module application 44184345130](https://github.com/FlareZ123/obfs/actions/runs/44184345130), SHA `327b7bc4996981f62742d6704ff0aee90b34bcba`: Ubuntu/Windows 81/81 focused tests and both typechecks each.
- [First historical integration 44184911109](https://github.com/FlareZ123/obfs/actions/runs/44184911109), SHA `1e75c4958e434cee794ad59ecbf819ffea833add`: 81/81 focused plus 3/3 historical positive tests passed on Ubuntu. Step `sims/application-challenge-observer-ablation.js` failed from **outdated diagnostic observerPath expectations**; it still expected JSON.parse on unguarded process argv to disappear after independent reflection ablations, which the real observer guard correctly forbids. It was a stale assertion, not an emitted-behavior mismatch.
- [Fully corrected targeted Windows/Ubuntu validation 44185322766](https://github.com/FlareZ123/obfs/actions/runs/44185322766), exact SHA `fcde384ad4b092b1a2b19279c829834a1873622b`: **both jobs passed all 81 focused tests + 3 historical positive tests + observer ablation + whole-session profile + both strict JSDoc checks**, each platform. Exact-source original remains 0/2 and guarded variants 2/2.

### Paired process budget

`sims/verified-record-session-profile.js` runs each six-file app as native vs actual emitted ESM in 9 alternate-order process pairs per workload. All outputs exactly match, each variant genuinely has two renamed private fields. The observed ratios below are median emitted/full-process milliseconds divided by median native/full-process milliseconds.

| OS (Node v22.23.4) | Modified variant | Workload | Native median ms | Emitted median ms | Ratio |
|---|---|---|---:|---:|---:|
| Ubuntu | own-only | one event | 25.466 | 25.809 | 1.0135 |
| Ubuntu | own-only | 80 events | 35.563 | 35.128 | 0.9878 |
| Ubuntu | null-proto | one event | 24.930 | 25.018 | 1.0035 |
| Ubuntu | null-proto | 80 events | 36.356 | 36.057 | 0.9918 |
| Windows | own-only | one event | 56.906 | 56.642 | 0.9953 |
| Windows | own-only | 80 events | 72.698 | 69.820 | 0.9604 |
| Windows | null-proto | one event | 53.867 | 54.092 | 1.0042 |
| Windows | null-proto | 80 events | 70.183 | 69.925 | 0.9963 |

All **eight** observed median complete-session pairs are below the project's 2.5× cap; this is an empirical sample and cannot certify the tail of every workload/browser/runtime or protection architecture. Source-only static attacker and copy remain successful, so these protected field-name substitutions do not prove any material static anti-reconstruction advantage over ordinary minification.

## Remaining release question

A comprehensive `manual-validation.yml` Windows/Ubuntu+Chromium run was dispatched at **the exact frozen source SHA `fcde384ad...`**, [run 44185566994](https://github.com/FlareZ123/obfs/actions/runs/44185566994). Its full outcome and branch-integrator verdict must be checked separately before claiming mainline release quality. Independent attacker-cost, tamper-resistance and live SCO authority remain separate unsolved decisions.
