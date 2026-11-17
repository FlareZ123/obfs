# Fail-open selected-function coverage audit (Agent 37, 17 November 2026)

**Status:** Compiler protection-coverage correctness intervention. No new hostile-runtime obfuscation resistance or universal runtime-budget claim.

## Original failure mechanisms

At original mainline source `0a2b0ab2443fd4deff55ae6184479b1596bb607a`, seven opt-in backends were selected by looking up `options.experimental<Backend>?.[filename]` only inside the emitted-file loop. A nonempty selection for an absent or misspelled source path, or an asset instead of a JavaScript source, never encountered that lookup and could complete successfully with the actually shipped file unchanged. The output metrics could reveal zero protected functions, but the build did not reject its explicit protection request. The `experimentalStatementFlow` example `{'missing.cjs':['f']}` with the only supplied file `app.cjs` illustrates this source-level counterexample.

The four older individual backends `virtualizeRegisterChains`, `virtualizeExpressionGraphs` (bytecode and native register lowering), and `flattenBranchBlocks` already return an integer `declined` count when requested functions are missing, duplicated, source-observed, or ineligible. The enclosing `obfuscateFiles` implementation used their `functions` counts but omitted their `declined` checks. A selection could therefore name a real file and an unavailable function and still emit the unchanged body; mixed eligible and ineligible sets could yield a partially protected group without failing the build. The newer statement-flow, Wasm i32 and polyvariant branches already treated a positive `declined` count as an error.

Both patterns are **non-vacuity / configuration integrity defects**. They do not imply that emitted valid transformations resist static deobfuscation, authorized relaying, runtime hooking or origin spoofing.

## Intervention

In `src/core.js`, the compiler now:

1. Enumerates the seven explicitly named function backend selectors against the exact prepared JavaScript input paths. A nonempty selection for an absent filename, spelling mismatch or opaque asset raises `TypeError` before emission. An empty list does not request protected work.
2. Copies the accepted selection arrays into compiler-owned per-backend maps at admission. A later options getter or caller-owned array mutation cannot silently eliminate the originally accepted function selection.
3. Enforces the existing `declined` counts from all four legacy backends before accepting output, consistently with the three newer backends. An unsupported/missing selected function now fails closed, even when other selected work would have succeeded.

These checks execute **inside the trusted obfuscation build only**. On accepted stable configurations the selected transformer receives the same function-name list, so the emitted program and its hot runtime mechanism are unchanged. This argument is conditional on those configurations; no independent worst-case performance or new deobfuscation-strength claim follows.

## Reproduction and validation

`test/experimental-selector-file-admission.test.js` is the single runnable regression file. It exercises all seven missing-file selectors and all seven absent-function selectors, mixed valid/invalid paths, asset and case mismatches, empty non-selections, a genuinely transformed statement-flow function with 101 native/emitted input comparisons, one-read options getter, and mutation of the caller's selector array between admission and emission.

The initial full workflow [44196704088](https://github.com/FlareZ123/obfs/actions/runs/44196704088) correctly identified a **test harness** error: its CommonJS differential VM omitted the `module` binding. The error is unrelated to the compiler patch; commit `e0f77d796e0c160f681084cff886e596a8756bea` added that binding. The follow-up full [Linux/Windows workflow 44197349122](https://github.com/FlareZ123/obfs/actions/runs/44197349122) at exact SHA `c0b040eff6f80a330d73ca15e3a3b74a1c5e40ac` then passed: Node 22, Ubuntu **2,642 tests / 2,641 pass / 1 skip / 0 fail**, Windows **2,642 / 2,639 pass / 3 skip / 0 fail**. Both JSDoc typechecks, existing baseline benchmark, genuine cross-module private-property session profiles and Ubuntu Chromium integrations also passed. This pinned gate proves the filename-admission and immutable-selection tests, but predates the added legacy-decline checks.

The stricter four-backend `declined` refusal was committed at `124b01524cc8250e0d630ae2961105d82d004f0a`; its seven-name and four-unsupported-function tests at `22e0188999a1e14d40bd2c3efafb47a1ab93d95c`. The [final full Linux/Windows workflow 44197962949](https://github.com/FlareZ123/obfs/actions/runs/44197962949) at **exact** source SHA `22e0188999a1e14d40bd2c3efafb47a1ab93d95c` **passed**. Node 22.23.4 ran **2,653 tests on each OS**, Ubuntu **2,652 passed, one skipped, zero failed**, and Windows **2,650 passed, three skipped, zero failed**. Both strict JSDoc configurations, baseline performance sample, paired six-module true private-property yield and Ubuntu's real Chromium source-observation/native-parity integration passed. This specifically certifies the missing/unsupported function refusals in addition to the earlier filename and immutable-selection checks. It does not establish a universal runtime budget or stronger attacker resistance.

## Remaining limits

This intervention enforces that **declared experimental function transformations actually run or reject the build**. It does not certify any semantic property the underlying narrow backend proof lacks, protect ordinary best-effort property/identifier passes, check every possible program input, or prevent copied/runtime-modified COO/SNO code. Static reconstruction of public switch/VM representations and independent 2.5×-budget failures remain release vetoes for affected candidates. No promoted academic security result is claimed here.
