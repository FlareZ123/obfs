# SVG animation list preflight: later-state embedded URL refusal (2026-11-15)

**Researcher:** Agent 20. **Status:** intermediate source-distribution safeguard; no proof of browser code execution, encryption strength, or reverse-engineering resistance.

## Reproduced gap

The source-disclosure scanner in `src/svg-assets.js` parsed SVG using namespace-aware `saxes`, and checked the entire `values` attribute string with `isEmbeddedExecutableUrl`. SVG Animations defines `values` for `<animate>`, `<animateMotion>`, and `<animateTransform>` as a **semicolon-separated sequence**, each member parsed separately (SVG WG [Animations specification](https://svgwg.org/specs/animations/#ValuesAttribute); [MDN](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/values)). Consequently, a value such as:

```xml
<svg xmlns="http://www.w3.org/2000/svg">
  <a id="jump" href="#ok">
    <animate attributeName="href" values="#ok; javascript:alert(1)" dur="1s"/>
  </a>
</svg>
```

passed the old single-string executable-URL predicate because its text began with `#ok`. In a standalone Node witness executing the same URL classification predicate, the old classification was `false`, whereas splitting on semicolons and applying the predicate to each candidate returned `true`. A second `#ok;data:application/xhtml+xml,%3Cscript%3E` witness had the same difference. Ordinary `#ok;#safe` and `4;8;4` lists were unchanged.

This is a **syntactic preflight coverage gap**: an executable-URL string could be distributed within an SVG animation list even though the project's stated policy rejects such strings. Browser-dependent exploitability has **not** been established by a live navigation or click-through test. SVG deployed as an image is subject to different scripting restrictions from SVG embedded as an active document.

## Fix and actual regression

`src/svg-assets.js` now splits the `values` attribute of the three relevant animation elements on `;` and applies the existing executable-URL predicate to **every** candidate. Single-valued attributes retain their existing classification. This changes only the compile-time / serving-time preflight: no browser or server runtime code is added to the obfuscated application.

`test/svg-asset-disclosure.test.js` adds four hostile samples: late `javascript:`, XML entity-decoded script scheme, `data:application/xhtml+xml`, and a deprecated XLink animation target. It requires refusal through the programmatic COO, SCO and SNO build paths, and through SCO handler creation. Safe link/number animation sequences remain accepted and byte-identical.

**Cross-platform test evidence:** [manual transformation semantics run 43736163213](https://github.com/FlareZ123/obfs/actions/runs/43736163213), pinned to commit `0c281fa7741a0f89254c0dfaf78f6a05fd54f213` (which contains the two code/test commits `d147da8` and `18c253e`). The **new SVG animation-list test passed on Ubuntu and Windows**, as did the remaining SVG cases. The overall workflow was **red, 219/221 tests passed per OS**, because two unrelated closed-world destructuring-assignment tests expected one property rename and received zero. Those unrelated failures are in `test/destructuring-assignment-flow.test.js` at lines 167 and 210 and involve only ESM JavaScript modules; neither invokes the SVG scanner. Because the workflow stops at this suite step, it cannot be cited as a passed typecheck or complete release gate.

A standalone predicate witness executed under local Node.js 22.16.0 compared legacy and revised scanning on four value lists; the two executable-URL examples changed from `false` to `true` and the two harmless examples stayed `false`. This is distinct from the integrated, cross-platform test evidence.

## Five separate threat dimensions

- **Static source distribution:** reduces one narrow path by which an SVG asset could include an untransformed executable URL string despite the compiler's refusal policy.
- **Dynamic extraction:** unchanged; adversaries still inspect all distributed JavaScript and public assets.
- **Tamper/integrity:** unchanged; COO and SNO local runtime modifications remain in scope.
- **Authorized execution:** unchanged; no browser host lock or server authentication is introduced.
- **Runtime cost and compatibility:** no added protected-program runtime operation. Only the relevant SVG asset preflight now tokenizes annotation lists, and benign samples preserve exact bytes. No broad benchmark or browser execution guarantee follows.

## Open questions

The scanner remains deliberately incomplete for arbitrary CSS values, external assets, embedded source in unrelated text, URL-like fragments inside `url(...)`, or deployment-specific content-type behavior. A real Chromium test under active SVG-document rendering could distinguish source-distribution policy from executable navigation. A coherent green exact-source test/typecheck snapshot is required before a repository-wide release claim.
