# Configured property-mangling control versus conservative COO (21 November 2026)

## Decision question

The compiler's closed-world cross-file pass can rename two private object fields routed through an imported, immutable identity function. A previous equal-trust esbuild comparison used minification with property mangling disabled. This experiment asks whether that static spelling advantage survives when esbuild is explicitly configured to mangle matching properties, and what compatibility cost that opt-in creates.

This is a bounded public-code compiler/compatibility comparison. It is not a source-confidentiality, anti-instrumentation or hostile-runtime security result.

## Exact reproduction

- Implementation: [browser control](../test/cross-file-property-mangle-control.js).
- Existing graph baseline: [imported identity browser test](../test/cross-file-imported-identity-browser.js).
- Existing manual workflow reused: [imported identity CI](../.github/workflows/manual-imported-identity-alias.yml).
- **Pinned green CI:** [run 44947503497](https://github.com/FlareZ123/obfs/actions/runs/44947503497) at exact source **03e993aaf7a79b7d8307be5318d4b5df2490f2b9**. Both Ubuntu and Windows Node 22.23.4 jobs passed strict root/targeted JSDoc and 41/41 targeted Node tests. Ubuntu additionally passed a real Chrome 157.0.8103.78 browser comparison.
- Preceding harness-red [44947356370](https://github.com/FlareZ123/obfs/actions/runs/44947356370) exposed invalid static resolution of browser-only import strings, repaired by dynamic string paths. Harness-red [44947428338](https://github.com/FlareZ123/obfs/actions/runs/44947428338) exposed unsupported Unicode flags on Go regular-expression filters in esbuild plugins. Neither was an obfuscator parity failure.

The input is a three-module ESM graph with state, an imported pure identity function, and an entry module calling that identity through a top-level immutable alias. The positive entry returns arithmetic on the record's two fields. The negative entry calls Object.keys on the same object and returns both keys and a numeric read.

The variants are (1) unmodified three-module ESM, (2) the compiler's three-module COO closedWorld output with identifiers and strings disabled and only safe private properties enabled, and (3) one configured esbuild whole-graph ESM bundle, using bundle=true, minify=true and a Field-suffix mangleProps regular expression. The complete virtual graph is supplied to one esbuild build, so the selected properties are consistently renamed across modules. The difference in bundle topology is material to source size and cold-load comparisons.

In a source checkout with declared dependencies installed, the browser check runs by invoking the browser-control script through Node. The existing manual workflow sets CHROMIUM_BIN to the Chrome executable on Ubuntu.

## Source-pinned observations

| Observable | Native ESM | Conservative COO | esbuild configured mangle |
| --- | ---: | ---: | ---: |
| Positive published UTF-8 bytes | 275 | 293 | 96 |
| Original positive field labels still spelled | 2 | 0 | 0 |
| Reflective published UTF-8 bytes | 277 | 277 | 108 |
| Original reflective field labels still spelled | 2 | 2 | 0 |

The COO positive is 3.05208 times the size of the esbuild bundle in this specimen, subject to different file-count/topology. Both transformed positive variants removed the same two original source spellings. This observation does not measure adversarial source reconstruction.

Chrome compared 100,000 exact held-out positive outputs across all three variants. In the reflective negative, native and conservative COO both returned the key spelling pair ["secretField","otherField"] and value 17. The configured esbuild variant returned ["t","o"] and value 17. Its opt-in regex mangling therefore changed reflection-visible behavior. This is a useful counterexample to blindly enabling regex mangle on arbitrary JavaScript; the compiler correctly declined the reflective rewrite.

The 12 alternated-order browser triplets each executed 100,000 warmed calls, after four warmup rounds, with equal checksums. Native, COO and configured esbuild work-time medians were 0.7, 0.6 and 0.6 ms respectively. Ratio of COO/native medians was about 0.85714; COO/esbuild median ratio was approximately 1.0. There were zero strict >2.5× observed pairs for COO/native and COO/esbuild, and zero for esbuild/native. All three arms operated below the browser's fine-grained timing stability; pair noise and measurement precision matter. Cold import, network transport and prolonged multi-session workloads were excluded.

## Decision

An opt-in esbuild mangling configuration can remove the same two private source names on this closed graph. The proof-based compiler has a demonstrated **semantic admission** benefit by preserving reflective keys without programmer-provided regular-expression exclusions. An esbuild integrator can likewise reserve known unsafe names after conducting a separate audit. This experiment did not measure the audit cost or any independent attacker's time to reconstruct behavior.

No general source secrecy, strict universal compute budget or hostile-runtime integrity claim is supported. The main strong-protection release decision remains **RELEASE-BLOCKED**. Keep this bounded work in intermediate evidence rather than promoting a security theorem.

Relevant official documentation: [esbuild property mangling](https://esbuild.github.io/api/#mangle-props) and [plugin onResolve filters](https://esbuild.github.io/plugins/#on-resolve).
