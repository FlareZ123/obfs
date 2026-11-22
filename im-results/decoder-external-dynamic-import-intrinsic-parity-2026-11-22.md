# Unproved ESM/CommonJS module effects can corrupt ambient string decoding

**Agent 27, 22 November 2026. Classification: intermediate empirical correctness finding and bounded compiler repair, not a demonstrated security-strength or 2.5×-runtime improvement.**

## General failure mechanism

When a JavaScript obfuscator inserts an eager XOR string decoder that uses the current realm's mutable `String.fromCharCode`, any earlier module that replaces the intrinsic can change generated values while leaving the original literal source semantics unchanged. In our direct Node 22.23.4 process differentials, the native two-file graph prints `protected-literal-value`; the generated file with a 23-unit encoded literal prints `???????????????????????`. A known-graph, inert relative dependency continues to permit real string encoding.

The current product's scanner already covers many syntactically visible writes through String/Array/Object, their aliases, reflection, and the Node VM methods. The **new** red cases are unaccounted-for modules that execute earlier, beyond the scanned input set. Each was tested with `mode:'coo'` and `'sno'`, `strings:true`, `properties:false`, and `identifiers:false`. Native execution uses the same side effect/deployment layout as emitted execution, with an identical independent process per variant.

## Independent source-pinned red/green probes

| Import boundary | Unfixed red: both OS | Scoped repair green: both OS |
| --- | --- | --- |
| ESM `await import('data:text/javascript,...')` runs a foreign patch before a later dynamic target import | [45013749778](https://github.com/FlareZ123/obfs/actions/runs/45013749778), `ff434b58cf8e...` | [45013936799](https://github.com/FlareZ123/obfs/actions/runs/45013936799), `e58f404d79a4...`; expanded literal/computed and known-dependency cases [45014066119](https://github.com/FlareZ123/obfs/actions/runs/45014066119), `ef2633bc8508...` |
| Static ESM `import './side.mjs'` resolves to a deployed module intentionally **omitted** from the compiler's group; target imports after that module has mutated the intrinsic | [45014444242](https://github.com/FlareZ123/obfs/actions/runs/45014444242), `4c1484ebc524...` | [45014560064](https://github.com/FlareZ123/obfs/actions/runs/45014560064) and [45014563486](https://github.com/FlareZ123/obfs/actions/runs/45014563486), `e60135fe5f62...` |
| CommonJS `require('./side.cjs')` runs omitted deployed module before requiring encoded target | [45014654661](https://github.com/FlareZ123/obfs/actions/runs/45014654661), `b9a482d13c43...` | [45014779726](https://github.com/FlareZ123/obfs/actions/runs/45014779726), `fcbb8e9537d1...` |

All three independent red checks reproduced the **same exact** native/emitted value mismatch on both GitHub-hosted Ubuntu and Windows; the first failing COO assertion short-circuited the SNO assertion, so do not claim the unfixed CI directly measured the SNO variant. All green checks ran COO and SNO comparisons and asserted `metrics.literals===0` for the unsafe target. The positive controls included an unmodified known ESM/CJS dependency and asserted `metrics.literals>0` for the actual target source and native/emitted process equality. Strict project and external JSDoc passed in the focused green runs.

A separate **negative search** for captured `require`, native `node:module.createRequire`, and bound `module.require` across an omitted mutation module had all three cases **green** on both OS [45015070201](https://github.com/FlareZ123/obfs/actions/runs/45015070201) at `5ce6857ae74f...`, so those do not constitute new proven mismatches. The earlier Node `vm.runInThisContext` / `vm.Script` / `vm.compileFunction` probes similarly were already safe; a benign VM reader lost encoding yield [45013595639](https://github.com/FlareZ123/obfs/actions/runs/45013595639) and must not be described as a false-accept defect.

## Repair and exact compilation contract

The `src/core.js` admission gates `hasUnprovedModuleImport` and `hasUnprovedCommonJsRequire` run before string transformation, while preserving the existing intrinsic-mutation dataflow scanner:

- ESM `ImportExpression`, static `ImportDeclaration`, and reexports with sources require an exact literal unadorned `./` or `../` path resolving to a supplied JavaScript file. Computed specifiers, import options, unlisted paths, URLs, and query/hash/percent/backslash spellings decline ambient string encoding across the group.
- CommonJS direct `require()` resolves literal relative paths against supplied JavaScript candidates (including extension/index probing). Unknown dynamic, package, or omitted relative loads decline ambient decoding. Ordinary Node builtin specifiers pass through `node:module.isBuiltin()` as a documented **trusted Node builtins** assumption; this does not prove loader-hook integrity.
- These are **compiler-time** checks; the injected runtime decoder is unchanged. A benign known local module retains at least one actual encoded literal, reducing unnecessary loss of protection within the tested closed group.

Official Node documentation documents [dynamic `import()` and `data:` module URLs](https://nodejs.org/api/esm.html) and [`module.isBuiltin()`](https://nodejs.org/api/module.html). The admissibility proof remains conditional on native module-path resolution and a benign host.

## Integration evidence and caveats

[Draft PR #277](https://github.com/FlareZ123/obfs/pull/277) contains the implementation and three regression suites plus a Chromium harness wired into the existing `manual-browser.yml` workflow. The first full real-Chromium workflow [45014177333](https://github.com/FlareZ123/obfs/actions/runs/45014177333) **passed** at the dynamic-only source `017b3cf0bab25486ea5a0a5b2a2093766bd88408`, including native/emitted `data:` import parity and an admitted local-import case.

The **combined** candidate's complete two-platform Node, adversarial, JSDoc, benchmark and Ubuntu Chromium integration workflow [45014873159](https://github.com/FlareZ123/obfs/actions/runs/45014873159) is **green** at exact code source `fcbb8e9537d10878d3c6235b7a8e08fcff13cc72`. A separate complete manual Chrome rerun [45015330455](https://github.com/FlareZ123/obfs/actions/runs/45015330455) was in progress while consolidating this report; check its exact verdict before reporting the final combined browser gate.

Scope limitations: external preloads, custom Node loaders, first-class mutable `require` semantics beyond observed test cases, host import maps, browser-script ordering, service workers, symlink remapping, cross-realm exports, and a compromised runtime are **not** proven absent. The compiler may conservatively decline benign unknown imports and could lose yield on ordinary ESM builtin imports. An adversary controlling the host can manipulate these assumptions. The full suite confirms its existing acceptance checks; it does not prove universal semantic equivalence, strength against reconstruction, authorized execution exclusivity, or the 2.5× runtime budget on every workload.

**Release remains BLOCKED** for adversarial-strength and universal runtime requirements regardless of this bounded semantic repair. The findings belong in `im-results/` until further independent validation and academic synthesis.
