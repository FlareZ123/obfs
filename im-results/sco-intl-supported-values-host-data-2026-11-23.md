# Selected SCO host-dependent Intl.supportedValuesOf causes cross-runtime output divergence

**Agent 8, 23 November 2026. Status:** bounded semantic compatibility counterexample with a source-pinned two-platform red/green compiler guard, plus a real Node/Chromium environment differential. **Intermediate result only.** The global strong-obfuscation release remains **RELEASE-BLOCKED**.

## Boundary and reproducible witness

Selected SCO executes an explicitly selected async JavaScript export on the Node server while leaving the exported browser facade on the client. The source compiler's `src/sco-selective-partition.js::realmStateObservation` rejects known host-dependent `Intl.DateTimeFormat` and related formatters, but the pre-fix `localeConstructors` set omitted the static `Intl.supportedValuesOf` host-data enumeration. Thus an async private function returning `Intl.supportedValuesOf('currency').includes('ZWG')` could pass the selective partition and change JSON-visible output when Node and Chromium ship different supported-currency lists.

### Actual host observations

The matching source expression was run in **real, distinct runtime processes**, under ordinary available default ICU configurations. This is a direct host differential, separate from the compiler-admission test.

| Environment | Node | Chromium | Node currency values | Chromium currency values | Node-only currency codes | `includes('ZWG')` browser/server |
| --- | --- | --- | ---: | ---: | --- | --- |
| Local Linux reproduction | 22.16.0, ICU 77.1 / CLDR 47.0 | 144.0.7559.96 | 162 | 159 | SLE, XCG, ZWG | false / true |
| GitHub Actions Ubuntu | 22.23.4, ICU 78.3 / CLDR 48.0 | 157.0.8103.78 | 162 | 159 | SLE, XCG, ZWG | false / true |

The fully logged GitHub Actions browser probe is [run 45132617281](https://github.com/FlareZ123/obfs/actions/runs/45132617281), at immutable branch source `122fb3b7cd01f49db460ff7b9faf52818bfb6235`. It also records two Node-only collation labels (`dict`, `phonetic`) and a **same-valued positive control**: both environments returned the same 45 standardized `unit` values, with identical JSON-byte SHA-256 `70a8ef2ea775cd6affea850c743ab39f4b901e172ef1236f258974c17514971a`.

The browser probe is reusable as `test/sco-intl-supported-values-browser.test.js`. Select it via the repository's existing manual focused-test workflow. It prints both SHA-256 list digests and differences. The test deliberately does **not** require all future Node/Chromium pairs to differ: equal supported sets are possible and should be reported accurately.

### Compiler red/green

The **unpatched** current-main-based source `3396573d6d70f77dbcf6855adc9fab6664fb323a` was tested at [45132173038](https://github.com/FlareZ123/obfs/actions/runs/45132173038) on Ubuntu and Windows Node 22.23.4. Both OSes failed the precise negative assertion with `Missing expected exception: return Intl.supportedValuesOf('currency').length;`; the independent benign positive test passed (1/2).

A narrow compiler change in `src/sco-selective-partition.js` adds an `isIntlNamespace` helper, then treats direct `Intl.supportedValuesOf` member reads and first-class destructuring from `Intl` as host-configuration observations. The normalized alias model already tracks `const NativeIntl=Intl` and `globalThis.Intl`; the new positive guard applies to those as well. The seven negative fixtures include direct, namespace-alias, global-root, static-computed-member, assigned-function, and destructured-function expressions; two positive fixtures retain safe local numeric/record operations and a public-only Intl call.

**Patched** source `e94da06b88ee9b50a62ae8dcc311b54c161ec2d0` passed both OSes in [45132359105](https://github.com/FlareZ123/obfs/actions/runs/45132359105): focused test, project strict JSDoc, external strict JSDoc, and paired-budget strict JSDoc were all green. The later browser-probe source `122fb3b7cd01f49db460ff7b9faf52818bfb6235` also passed the focused Node/Chromium observation job at [45132617281](https://github.com/FlareZ123/obfs/actions/runs/45132617281).

## Limits and selection

- This is a **semantic compatibility** guard for one known ICU-data-dependent static API. It does not establish that the obfuscation increases static reconstruction cost, limits authorized oracle relaying, or resists full runtime control.
- The compiler and direct cross-host observations were tested separately; a full generated client facade **plus live authenticated RPC** reproduction of the failing original pre-fix case is not claimed here. Nevertheless, the originally admitted private function and the two host outputs are independently observed.
- No 2.5× runtime claim follows from successful JSDoc or a negligible-looking compile-time refusal. Complete application performance must be measured independently.
- A follow-on concrete `Intl.Locale` *API-shape* divergence was reproduced between local Node 22.16 and Chromium 144: `typeof new Intl.Locale('en').getCollations` was `undefined` versus `function`, and the legacy `locale.collations` array existed in Node but not Chrome. The separate bounded `Locale` constructor guard is documented in the addendum below; its CI result must be assessed independently. In an exploratory local corpus, 8,115 `Intl.Locale#maximize().baseName` tags yielded zero observed differences, which does not prove universal equality. `Intl.getCanonicalLocales` remains outside the new proof.
- The changed guard intentionally refuses some harmless expressions when their source provenance or destination host is unproved. The positive tests protect nonzero useful work, and ordinary client-only usage remains allowed.
- There is no full-suite or current-main release acceptance tied to these focused branch results. Mainline integration remains a separate owner-reviewed process.

**Next:** Independent review of the narrow guard, cross-host versions and descriptor/alias edge cases; then integrate on a frozen current-main source and run the standard full Node 22 Ubuntu/Windows, real Chromium, strict JSDoc and paired performance acceptance. Preserve the overall **RELEASE-BLOCKED** status until the broader product evidence succeeds.


## Follow-on bounded Intl.Locale source/version experiment

A direct local Node 22.16.0 versus real Chromium 144.0.7559.96 execution found an independent *observable runtime API mismatch*:

| Expression | Node 22.16.0 | Chromium 144 |
| --- | --- | --- |
| `typeof new Intl.Locale('en').getCollations` | `'undefined'` | `'function'` |
| `new Intl.Locale('en').collations` | `['emoji','eor']` | `undefined` |
| `typeof new Intl.Locale('en').getCalendars` | `'undefined'` | `'function'` |

A selected private SCO export that returns the first expression must preserve its original browser result. The pre-existing locale constructor guard did not include `Locale`, despite already declining other Intl formatters when server configuration is unproved. A follow-on test adds direct, global-root, constructor-alias and destructured constructor-alias cases. The narrow candidate extends `localeConstructors` by the single `Locale` entry, causing existing direct and alias checks to decline its relocation. Retained client-only Intl.Locale calls and unrelated selected arithmetic are positive controls.

The native-version gap and the syntax admission failure are separately grounded; **a full generated authenticated RPC browser-versus-server failure has not been executed**. The Node/Chromium probe was extended to emit the Locale prototype/API shape, and focused CI requests were dispatched at [45133161855](https://github.com/FlareZ123/obfs/actions/runs/45133161855) (Locale negative on pre-Locale patch), [45133235771](https://github.com/FlareZ123/obfs/actions/runs/45133235771) (real browser Locale shape), and [45133356828](https://github.com/FlareZ123/obfs/actions/runs/45133356828) (Locale guard and public positive). **These follow-on runs were queued when this addendum was written; they are not claimed green here.** Updated results should be appended when source-pinned logs are available.

A further alias-diagnostic test covers `let Native;Native=Intl` and destructuring assignment. The existing generic `realmStateObservation` intrinsic-state fallback already conservatively declines first-class intrinsic assignment expressions; the test accepts any `realm-local` refusal, without claiming a new alias repair. Avoid a redundant scanner rewrite unless a source-pinned admitted counterexample is found.


### Verified source-pinned Locale red/green (supersedes queued-status note above)

- **RED**, [45133161855](https://github.com/FlareZ123/obfs/actions/runs/45133161855) at `003be7d01dd1c3f0574443585684519402f1e891`, two-platform Node 22.23.4: one missing `Intl.Locale` refusal on each OS (`return typeof new Intl.Locale('en').getCollations;`), with the existing `supportedValuesOf` regression and safe positive both passing (2 pass, 1 fail).
- **NATIVE browser data**, [45133235771](https://github.com/FlareZ123/obfs/actions/runs/45133235771) at `636d0d67196fac93a3661d93b12f92c7769fb59d`: Node 22.23.4 ICU 78.3 / CLDR 48.0 and real Chrome 157.0.8103.78. Node `getCollationsType:'undefined'`, `collationsLength:2`, `getCalendarsType:'undefined'`, `calendarsLength:1`; Chrome respectively `'function'`, `null`, `'function'`, `null`. Same-run currency/collation mismatches and equal unit positive remained unchanged. Focused + JSDoc success on Ubuntu, with Windows focused skip for the browser-only test.
- **GREEN**, [45133356828](https://github.com/FlareZ123/obfs/actions/runs/45133356828) at `05e3c4394e2417bef87a4a63e22c242b3f4c2ea2`: the patched `localeConstructors` now contains `Locale`; 3/3 focused tests pass on **Ubuntu and Windows** and all three project/external/paired-budget JSDoc stages pass. The client-side original Intl.Locale operation remains present, and benign selected-private arithmetic/record operations stay eligible.

The later supplementary test commit `9685a6d18be784dfa473645ae46712dfd9bc68ec` adds a private transitive ESM-leaf regression and the conservative assigned-namespace guard; [current-head focused run 45134230733](https://github.com/FlareZ123/obfs/actions/runs/45134230733) was queued as this note was written. The above green is exact to the older SHA and does **not** independently cover the new graph test. The report therefore remains intermediate until the exact-head result is checked.


## Standards and documentation context (distinct from measurements)

This decision uses the documented portability boundary, not an assumption that every runtime will differ. [MDN, `Intl.supportedValuesOf`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/supportedValuesOf) explicitly describes an array of values supported **by the implementation**, supporting refusal of unpinned cross-host output comparisons. [Node.js 22 internationalization documentation](https://nodejs.org/download/release/latest-jod/docs/api/intl.html) identifies ICU as the underlying support library. [MDN, `Intl.Locale.prototype.getCollations`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/getCollations) and [`getCalendars`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/getCalendars) document that earlier engines expose the functionality as an accessor instead of a method. Both methods have a newly available 2026 baseline. The exact Node/Chromium version discrepancies and outputs above come separately from the referenced real-execution CI logs.


## Exact-SHA inter-file scanner focused completion

The supplementary selected-graph/private-leaf negative cases (`Intl.supportedValuesOf('currency')` and `new Intl.Locale('en')`) and positive integer work were added at source `9685a6d18be784dfa473645ae46712dfd9bc68ec`. [Focused run 45134230733](https://github.com/FlareZ123/obfs/actions/runs/45134230733) **completed SUCCESS** on both Ubuntu and Windows Node 22.23.4, with all focused test assertions and strict project, external and paired-budget JSDoc passing. This updates the earlier note that this exact run was queued. The full `node22` job was skipped by the focused-test workflow. The pending *later* live-browser selected-facade parity test is separately source-pinned at `60fe615abee8b64df2ac57c4c61d4170b931be16` ([run 45134682559](https://github.com/FlareZ123/obfs/actions/runs/45134682559)) with an unpatched real-browser negative control source `985cedca8bd73d9902a9527e10b515d490171087` ([run 45134733167](https://github.com/FlareZ123/obfs/actions/runs/45134733167)); these were queued at the time of this update and are not claimed passed or failed.


## Falsification probe: canonical locale spellings (no divergence established)

An exploratory local headless native comparison using Node 22.16.0 and Chromium 144.0.7559.96 checked **12,330 deterministic distinct BCP-47 candidate strings** with `Intl.getCanonicalLocales(tag)[0]`, using identical source and in-process iteration in each engine. The corpus was the cross product of all two-letter lowercase language subtags plus an explicit set of legacy and three-letter examples (`zh,sr,en,de,ar,ff,cmn,nan,iw,ji,in,sh,mo,und,xog,aa,qaa,i-klingon,no,nb,nn,tl,fil,yue,jbo`), with suffixes `['','-Latn','-Cyrl','-Arab','-US','-CN','-TW','-RS','-RU','-001','-419','-ZZ','-Qaai','-Zzzz','-u-ca-gregory','-u-nu-latn','-u-co-search','-u-nu-hanidec']`. Duplicates were removed by insertion order. Both runtimes returned the same canonical string or `ERR:RangeError` for all 12,330 candidates; **0 observed mismatches**. This local exploratory test did not create a checked-in CI harness, random sample or comprehensive Unicode/BCP-47 input coverage. Consequently it neither supports a claim that `Intl.getCanonicalLocales` always agrees nor justifies adding a speculative extra refusal to the selected SCO compiler. The verified distinct `supportedValuesOf` and `Locale` source/API witnesses remain the actual patch drivers.


## Live authenticated browser RPC parity gate

The new `test/sco-intl-selected-live-browser-parity.test.js` exercises the **actual generated selected-SCO client facade** and Node production `createScoHandler` over a same-origin HTTP endpoint with session-cookie authorization. It also runs the native untouched source through dynamic ESM import in real Chromium, asks for the native Node server value, and enforces HTTP 403 for an unauthorized RPC. The benign candidate is a nonconstant arithmetic function `Math.imul(7,13)`, confirming that safety refusals do not disable the selective-SCO architecture wholesale.

**Patched live source** at `60fe615abee8b64df2ac57c4c61d4170b931be16`: [GitHub Actions 45134682559](https://github.com/FlareZ123/obfs/actions/runs/45134682559) **SUCCESS**, Ubuntu Node 22.23.4/Chrome 157.0.8103.78. The direct currency and Locale cases were each refused with `Selective SCO cannot partition realm-local configuration access`; the benign arithmetic case was **actually emitted, served, executed over authenticated Chromium→Node RPC**, and logged `original:91, emitted:91, server:91, refused:false`. The prior unauthenticated RPC on this service received 403. All 3/3 focused tests passed on Ubuntu. The Windows focused job succeeded with Chrome portions explicitly skipped, and both OS jobs completed all three strict JSDoc checks. The full application test matrix was not run in this focused workflow.

The independent **unpatched live source** at `985cedca8bd73d9902a9527e10b515d490171087` has its own [focused run 45134733167](https://github.com/FlareZ123/obfs/actions/runs/45134733167), which was still running when this addition was written. Its result should be assessed separately to distinguish a real browser/RPC mismatch from an unrelated pre-patch fixture failure.


### Paired real-browser generated-facade negative control (final result)

The unpatched compiler, held at original source `3396573d6d70f77dbcf6855adc9fab6664fb323a` plus only the identical new test file, was executed as independent branch SHA `985cedca8bd73d9902a9527e10b515d490171087`. [GitHub Actions 45134733167](https://github.com/FlareZ123/obfs/actions/runs/45134733167) **FAILED AS INTENDED** in the Ubuntu focused Chromium+HTTP integration stage, with **two exact semantic failures and the safe control passing**:

| Source selected-private return | Native Chromium 157 original | Unpatched selected SCO served RPC | Result |
| --- | --- | --- | --- |
| `Intl.supportedValuesOf('currency').includes('ZWG')` | `false` | `true` | compatibility failure |
| `typeof new Intl.Locale('en').getCollations` | `'function'` | `'undefined'` | compatibility failure |
| `Math.imul(7,13)` | `91` | `91` | legitimate preserved private workload |

All values came from the **live generated and session-authorized HTTP facade**, while the original values were evaluated as untouched ESM directly in the same Chrome 157.0.8103.78 browser. The server ran Node 22.23.4. The 403 unauthorized-RPC precondition succeeded for every emitted branch. The Node test runner reported **1 pass / 2 failures** with explicit `Selected SCO output diverges from native Chromium` assertion failures for `currency` and `locale`; those failures are the intended negative control. The Windows job skipped the Chrome-only tests by design.

The matched **patched** source pin `60fe615abee8b64df2ac57c4c61d4170b931be16` [run 45134682559](https://github.com/FlareZ123/obfs/actions/runs/45134682559) reported **3 passes / 0 failures**, rejecting both private host-sensitive functions before output emission and delivering safe arithmetic `91` through the same authorized RPC, with clean JSDoc on Ubuntu and Windows. This is a true paired original-vs-generated, pre-fix-vs-post-fix red/green **for the declared values and environments**. It does not demonstrate compatibility for untested host APIs, full JS semantics, improved static obfuscation resistance, or general runtime overhead compliance.


A subsequent larger local falsification set used **all 17,576 three-letter lowercase primary language subtags** (`aaa` through `zzz`) crossed with `['','-ZZ','-u-ca-gregory','-Latn','-001']`, exactly **87,880 distinct candidate tags**. Node 22.16.0 and real Chromium 144.0.7559.96 produced **zero differences** both for `Intl.getCanonicalLocales(tag)[0]` and `new Intl.Locale(tag).maximize().baseName`, comparing each returned value or caught error name. This expands the negative sample but remains far from proof of equivalence for arbitrary Unicode extensions, variants, private-use tags, future ICU versions or host overrides. The source patch continues to decline `new Intl.Locale` because the separately proven prototype API-shape mismatch persists.


### Six-category native static-data matrix (local supplementary observation)

The same local Node 22.16.0 / Chromium 144.0.7559.96 pair was queried with **all six documented `Intl.supportedValuesOf` category names**, using native `Intl` on both sides:

| Category | Node entries | Chromium entries | Node-only entries | Browser-only entries |
| --- | ---: | ---: | --- | --- |
| `calendar` | 18 | 18 | none | none |
| `collation` | 12 | 10 | `dict`, `phonetic` | none |
| `currency` | 162 | 159 | `SLE`, `XCG`, `ZWG` | none |
| `numberingSystem` | 77 | 77 | none | none |
| `timeZone` | 418 | 418 | none | none |
| `unit` | 45 | 45 | none | none |

This is a deterministic local descriptive sample, **not** an exhaustive time/version/platform agreement proof. One data category matching on a pair of installed engines does not establish safety of relocating arbitrary code that reads that category under the user-specified deployment environment. The compiler guard therefore treats a statically resolved `Intl.supportedValuesOf` read as an unproved host configuration rather than special-casing currently equal categories. The direct application-visible currency and API-shape mismatches remain independently verified by the real CI generated-facade red/green.


## 23 November 19:05 UTC: full-suite disposition and independent Unicode negative control

The unfocused comprehensive source-pinned run [45135930792](https://github.com/FlareZ123/obfs/actions/runs/45135930792) at branch SHA `795d48ca8d65cfe70ea35a885940f0163487b7b6` **failed** on Ubuntu and Windows: 5,116 tests per OS; **21 failed** on each, with 14 skips. Those two OS failure-name sets matched and spanned Blob/source-observer, private class/owner-key yield, interfile ESM, selected-SCO expression aliases and Symbol-key cases. They were not isolated to the two `Intl` guards; however no source-identical baseline full suite was run for causal attribution. Strict JSDoc, sampled performance and applicable Chromium steps passed. This is a **red integration receipt** and must not be described as broad acceptance.

A further descriptive [single-scalar Unicode differential, run 45244995213](https://github.com/FlareZ123/obfs/actions/runs/45244995213), at source `0eee05e5c06ee0a2ff5fff7f1c0a150cdd3c5ef6`, completed successfully on both focused-platform jobs with project/external/paired-budget strict JSDoc. The actual browser comparison ran on Ubuntu with Node 22.23.4 (Unicode 17.0, ICU 78.3) and Chrome 157.0.8103.78. After testing every non-surrogate Unicode scalar, `toUpperCase` had 1,580 changed values on each host, `toLowerCase` had 1,488, and `normalize('NFKC')` had 4,965; **zero native Node/Chromium differences** were observed in any of the three categories. This is only a single-scalar, one-version-pair negative observation and excludes composite strings, future engines and other Unicode operations. Accordingly, this probe supplies **no new compiler admission rule**. The reusable descriptive test is `test/sco-unicode-host-browser.test.js`.

The branch is being reconstructed onto current main rather than copying the earlier compiler file wholesale. The independent [SCO batch exact-arity security fix PR #340](https://github.com/FlareZ123/obfs/pull/340) was merged onto main as `c7f9fc04fa9e19f425fc61f0953533dc1b37d36b`; this `Intl` branch does not replace or alter that fix. The current proof remains limited to the paired `Intl` red/green semantics. The project remains **RELEASE-BLOCKED**.

For standards background, see [Node internationalization support](https://nodejs.org/api/intl.html) and [MDN String.prototype.normalize](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize). The actual zero-difference claim is based only on the pinned runtime output above.
