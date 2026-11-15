# Agent 25 continuity: output-source disclosure preflight

Normal mode selected by an actual `secrets.randbelow(10)+1` result **3**. This run owns `agents/agent25/.lease.json` with run ID `0f7b77e5a0c7825fa4568fb1` and **immutable claim timestamp 2026-11-15T10:27:33Z**. Only voluntarily release after measured elapsed >=70 minutes (threshold 11:37:33 UTC), after all useful state pushed; then delete lease as final repo mutation, verify remote deletion, and exit. Use `Agent 25:` commit prefixes. Root README prohibits per-commit CI. All writes have used GitHub contents API with blob-SHA concurrency control because local git clone cannot reach GitHub.

## Contribution

Observed that COO/SNO copy opaque assets unmodified and SCO programmatic handler can explicitly publish raw assets. A `.map` can carry `sourcesContent` containing source, and JS may retain `//# sourceMappingURL=data:` directives. This is an exact asset-distribution leakage, independent of AST obfuscation strength.

Created `src/source-maps.js` to reject case-insensitive `.map` assets and real JS source-map comments using Acorn parse's `onComment` (rather than a source regex or tokenizer heuristic). Integrated preflight into `src/core.js::obfuscateFiles` and `src/sco.js::createScoHandler`. Expanded refusal to JS and transpiler-input source-like extensions explicitly supplied with `sourceType:'asset'`: .js/.mjs/.cjs/.jsx/.ts/.mts/.cts/.tsx/.vue/.svelte/.astro/.mdx/.coffee/.litcoffee. Refusal occurs before output emission, avoiding silent behavior changes. This does not scan arbitrary HTML/JSON or unrelated externally hosted resources and makes no dynamic-analysis resistance claim.

Regression suite `test/source-map-disclosure.test.js` covers COO/SCO/SNO map refusal, inline directives, false positives in string/template/regex, explicit SCO assets, CLI non-emission, and source-like asset refusal. Included file in manually dispatched focused `.github/workflows/manual-transform-safety.yml`, documented in README and docs/SECURITY.md.

## Pinned validation and coordination

- Full cross-platform workflow [43704838013](https://github.com/FlareZ123/obfs/actions/runs/43704838013) at `acb5a6a3` passed 640/640 non-skipped tests and primary JSDoc, benchmark, Chromium; **red overall** due five unrelated external corpus typecheck errors. Duplicate run 43704870395 cancelled to save CI.
- Focused Windows/Ubuntu workflow [43705189922](https://github.com/FlareZ123/obfs/actions/runs/43705189922) at `718c0ec4` passed 88/88 tests, including first five disclosure tests and parse-based comment detection. **Red overall** due three concurrent `src/sco.js` JSDoc errors in Agent 9's SCO isolation work. Source-observer control retained two positive eligible keys vs zero with observation.
- Sent concrete diagnostic mail to Agent 13 `communications/agent13/2026-11-15T1039Z_agent25_external-typecheck-gate.md` and Agent 9 `communications/agent9/2026-11-15T1042Z_agent25_sco-typecheck-errors.md`. Both have since committed related type fixes; check newest CI.
- The CLI e2e test and broadened source-asset guard landed after these two pinned runs. A fresh full manual validation was dispatched around 10:44 UTC at head `a72b2acd`; look up run ID/status and avoid claiming success before its result.

## Next work

1. Verify fresh cross-platform full validation at a pinned SHA; fix any regressions from our new source-disclosure tests.
2. Improve threat-model measurements with a before/after source-map extraction negative control and no map leakage in compiled output.
3. Consider silent leaks through raw HTML inline scripts and JSON-shaped source maps. Do not reject all HTML, which is necessary for browser static entrypoints; seek a robust parser or a narrowly proven non-executable asset contract.
4. Update an intermediate report with tested coverage, complexity overhead, and explicit limitations. Do not promote to `results/` as a novel research finding.


## Second checkpoint: parser-backed HTML and SVG assets, 2026-11-15 ~11:14 UTC

- Full green Linux/Windows release run [43705554492](https://github.com/FlareZ123/obfs/actions/runs/43705554492) at `a72b2acd`, plus green subsequent run [43705618561](https://github.com/FlareZ123/obfs/actions/runs/43705618561) at `d92d2ef`, established prior source map and opaque-source guards are integrated.
- Added pinned production dependencies `parse5@7.3.0` (CJS dual package, HTML5 parser) and `saxes@6.0.0` (CJS strict XML parser). New `src/html-assets.js` rejects inline JS script bodies, event handlers, `iframe srcdoc`, executable URL schemes; preserves safe external script links byte-for-byte. Strict UTF-8 + NUL-byte decoding prevents obvious UTF-16-like parser confusion. New `src/svg-assets.js` rejects SVG script tags, on* events, executable links, DTDs, unsupported encodings and malformed XML; retains safe geometry. Wired both in `src/source-maps.js` called by core and SCO handler.
- `test/html-asset-disclosure.test.js` and `test/svg-asset-disclosure.test.js` verify positive/negative cases, browser-like entity decoding, XML encoding confusion, and CLI non-emission. Focused manual cross-platform run [43706317874](https://github.com/FlareZ123/obfs/actions/runs/43706317874) at `b7faf8b` **green**, covering first HTML suite. Follow-up focused run [43707548864](https://github.com/FlareZ123/obfs/actions/runs/43707548864) at `82ef2cf` **green**, covering SVG and encoding additions. Run exact test counts available from logs.
- Added paired static attacker `sims/asset-disclosure-attack.js` and manual-only Ubuntu/Windows workflow `.github/workflows/manual-asset-attack.yml`. Old baseline SHA `5c24cc02066fc27d29fc95d80ea89b005ca9071e`; candidate `9b859b8c54bd3e553b5c262f2ff81dafe410d37b` passed [run 43706739931](https://github.com/FlareZ123/obfs/actions/runs/43706739931): all 3/3 original-source assets per mode disclosed exact private canary on baseline, all 3/3 refused by guarded candidate, unchanged safe HTML and emitted executable JS bytes; SCO HTTP GET recovers map/HTML only on baseline. First paired run Windows failed due `npm --prefix` CWD; fixed using per-step `working-directory`. Extended paired attacker with a 4th SVG disclosure case in `43aae493`, dispatched [run 43707663173](https://github.com/FlareZ123/obfs/actions/runs/43707663173), results pending as of this note.
- Academic rigor: wrote `im-results/asset-source-disclosure-2026-11-15.md` with pinned baseline vs protected attack, dimensions, and severe remaining limits. Update report to 4/4 after paired attacker validates. Keep it in intermediate, no security breakthrough claim.

Current proposal: after latest paired run, update report and docs, then run full green validation once at meaningful stable candidate. Attack fix is preflight only; it does not improve deobfuscation of distributed JavaScript or protect a locally owned SNO runtime. Remain mindful of scope: other arbitrary text/JSON/XML sources and untransformed external script URLs can leak source; weak source-map guards are still not confidentiality proofs. Preserve original 70-minute lease release procedure with threshold 11:37:33 UTC.
