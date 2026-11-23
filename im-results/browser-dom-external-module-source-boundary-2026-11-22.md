# External versus inline ESM DOM source-observation control (22 November 2026)

**Status: proposed browser experiment; native behavior not yet source-pinned by Chromium.** This record belongs in \`im-results/\`. Do not promote its predicted outcome into an established property-renaming result.

## Question and declared boundary

Agent 34's real-Chromium inline-ESM counterexamples show that a module reading \`document.documentElement.outerHTML\` or \`new XMLSerializer().serializeToString(document)\` can observe its own private property spelling when the module's bytes are placed directly inside \`<script type="module">...\`. A compiler that rewrites the private name may therefore change a string comparison despite returning the same numeric computation.

The complementary question is whether **those exact DOM readers** see externally loaded module bytes when the HTML contains only \`<script type="module" src="/entry.mjs"></script>\`. The distinction is narrowly about host HTML serialization; it does **not** classify the full external-module setting as safe against \`fetch\`, network caches, DevTools, extensions, DOM mutations, or other readers.

## Reproducer and test matrix

- Source: \`sims/browser-dom-external-module-source-parity.js\`
- Native JavaScript module: \`function calculate(){const owner={internalSecret:8};return owner.internalSecret}\`, followed by one observed DOM string comparison.
- Manual renamed control: \`internalSecret\` is consistently replaced with \`k\` in its property declaration and read. Both variants calculate 8.
- Embeddings: genuine HTTP-served inline module and HTTP-served \`src="/entry.mjs"\` module.
- Readers: \`document.documentElement.outerHTML\`, \`new XMLSerializer().serializeToString(document)\`, and benign \`document.title\`.
- For each reader and embedding, execute original and manual-renamed versions in a separate headless Chromium run with a fresh in-process HTTP port. The output is a base64-encoded JSON result in \`<pre id="result">\` so HTML escaping does not confuse the test.
- The script asserts the predicted original and manually renamed result for all **12 browser executions** (three readers, two delivery modes, two source variants).

| Reader | Inline original expected | Inline manual expected | External original expected | External manual expected |
| --- | --- | --- | --- | --- |
| \`outerHTML\` | \`8/true\` | \`8/false\` | \`8/false\` | \`8/false\` |
| \`XMLSerializer\` | \`8/true\` | \`8/false\` | \`8/false\` | \`8/false\` |
| \`document.title\` | \`8/false\` | \`8/false\` | \`8/false\` | \`8/false\` |

## Local verification and blocked browser result

On this invocation's isolated Node 22.16.0 environment, \`node --check\` passed and a static markup assertion confirmed that \`page('external',program(...))\` omits the private name while \`page('inline',program(...))\` contains it. A direct local strict JSDoc/TypeScript 5.8.3 check initially caught \`server.listen(0,'127.0.0.1',resolve)\` as an incorrect callback type; the source was corrected to \`() => resolve(undefined)\`, and the same strict check passed. The new source was added to \`jsconfig.dom-source-evidence.json\`.

Local Chromium 144.0.7559.96 remained hung with no stdout on \`--headless --dump-dom about:blank\`, including after standard sandbox, GPU, and separate-profile flags. Thus the full browser script **could not execute here** and no browser pass or result count is claimed. The expected matrix must be checked on an existing trusted Ubuntu Chromium CI runner, ideally followed by a Windows-supported browser confirmation. Do not misread a green static JSDoc gate as a green browser outcome.

## Decision policy

A source-only AST cannot establish whether its eventual host injects the emitted bytes inline or links them externally. In the absence of trusted deployment evidence, an unconditional property rewrite of a source-observing inline module is unsound, and conservative refusal is the safe choice. An explicitly validated external-script deployment could later justify a **narrow** policy for these DOM-only source readers, subject to complete provenance and independent source-fetch checks. Such a policy is a hypothesis requiring an integration test that demonstrates actual private-property transformation yield, as well as the negative inline case and at least one hostile source-reader case.

This is a compatibility/provenance control, not a protection claim, a security-performance result, or evidence that external published source is concealed. Other agents are already working on the group-wide source-observer repair; this fixture is intended as a non-overlapping native semantic control.

## References

- Existing inline property-key regression: \`sims/browser-dom-property-source-parity.js\` and \`im-results/browser-dom-source-serialization-parity-2026-11-22.md\`
- Node HTTP test server API: https://nodejs.org/download/release/v22.11.0/docs/api/http.html
- Chrome headless DOM capture: https://developer.chrome.com/docs/automation-and-testing/headless-cli


## Follow-up: real Chromium Blob-module check, 13:59 UTC

**New bounded browser observation:** A separate local Python Playwright harness launched Chromium 144.0.7559.96 and executed the **exact same program strings** exported by `sims/browser-dom-external-module-source-parity.js` in fresh pages. The harness used `page.set_content` for inline ESM and `URL.createObjectURL(new Blob([program],{type:'text/javascript'}))` as a module `src` for externally sourced ESM. All **12/12** expected native outputs matched the table above, including the exact `internalSecret` versus `k` string check: both DOM-serialization readers saw `8/true` for original inline, `8/false` for renamed inline, and `8/false` in both Blob-module variants; `document.title` gave `8/false` in all four variants. This is real browser differential evidence for **inline versus Blob-backed module** embedding. Chromium was reached through page content injection; direct `about:blank`/local-network navigation remained blocked by the sandbox administrator.

**Do not conflate the backends:** The committed main reproducer uses a genuine HTTP `src="/entry.mjs"` route and the Chrome command-line `--dump-dom`. Those HTTP executions remain unverified. Blob URLs and HTTP URLs have different origin and CSP properties, even though the tested DOM serialization distinction is the same. The local check also used manually renamed JavaScript and did not invoke `obfuscateFiles`, so it provides no compiler coverage, held-out security resistance, or independent CI source pin. Preserve the proposed HTTP matrix for normal Chromium CI instead of claiming it green from the Blob observation.


## Repeatable browser validation driver

`sims/browser-dom-blob-source-parity.js` (commit `52448e121e75df4bec365832b0a33a968f6d3fb5`) codifies the 12-case inline-versus-Blob-browser matrix in the repository's normal CommonJS/JSDoc style. It uses the already-declared development dependency `puppeteer-core`, dynamically injects each original or manually renamed native module into a fresh document, waits for its ESM result, and asserts all 12 observations. The file is included in `jsconfig.dom-source-evidence.json` for strict JSDoc checking.

**Validation boundary:** `node --check` passes, and the independent local Python Playwright implementation produced the 12/12 Chromium 144 outcomes noted above. The newly committed *Puppeteer driver itself* has not been executed against Chromium or source-pinned CI because the local package installation does not contain `puppeteer-core`. It must be run under the repository's normal npm/Chromium environment before calling the Node driver validated. The earlier HTTP driver remains a distinct pending validation.


## Explicit external-module source-fetch counterexample

Chromium 144.0.7559.96 running under local Python Playwright executed a Blob-backed external ESM that calls `await(await fetch(import.meta.url)).text()` and tests its own source for the original private property name. The unchanged private field returned `{value:8,match:true,url:'blob:'}`; manual renaming from `internalSecret` to `k` returned `{value:8,match:false,url:'blob:'}`. **2/2 native cases** matched this predicted full-source observation. The result directly falsifies a general inference that externally linked modules are safe to rename because `outerHTML` omits their bytes. It does not imply the current obfuscator would rename such a program: `src/ast.js` already recognizes direct `fetch` as a distributed-source observer.

The Node/Puppeteer fixture `sims/browser-dom-blob-source-parity.js` now includes these **two** negative cases, raising its planned suite from 12 to **14**. This newer script still awaits an actual Node/Puppeteer browser run; only the equivalent local Python Playwright native Chrome cases have been observed. The HTTP-backed test remains unverified. External-only positive transformation is viable solely under a trusted, complete source-observation contract and should be investigated without weakening the existing fetch refusal.


## CI follow-up: HTTP and Blob Chromium drivers executed, 10:21 UTC

**Exact source pin:** `37426c4c666e25a6382aeba0bfdbc81085201e65`  
**Workflow:** [manual-browser run 45155347280](https://github.com/FlareZ123/obfs/actions/runs/45155347280)  
**Driver commits:** `sims/browser-dom-blob-source-parity.js` now resolves a PATH-based Chromium command to the absolute executable path required by Puppeteer-core; `.github/workflows/manual-browser.yml` runs the HTTP, Blob, and strict DOM-source JSDoc steps with `if: always()` so unrelated earlier browser failures do not suppress this evidence.

The two source-observation steps and strict JSDoc step all **passed**:

- **HTTP external-module driver:** six reader/embedding comparisons (outerHTML, XMLSerializer, title × inline/HTTP ESM) executed in Chromium. Inline outerHTML and XML serialization observed the original source spelling and detected the manual rename; external HTTP ESM was not exposed through those DOM readers; title did not reveal source in either embedding. All runtime values remained 8.
- **Blob ESM driver:** Chromium completed **16 native observations** (eight original/renamed pairs). It reproduced the inline-versus-Blob DOM visibility distinction, then confirmed two additional Blob-specific observers: `fetch(import.meta.url)` matched the original source and stopped matching after the manual rename; V8 `Error.stack` column changed from **51 to 38** while the returned value remained 8.
- **Strict typecheck:** `npx tsc -p jsconfig.dom-source-evidence.json` passed.

**Whole-workflow status remains RED**, not green: an earlier, unrelated `test/bound-runtime-interception-browser.js` step failed at line 52 because the current mainline emitted zero private-property rewrites where that test expected two. The three later source-evidence/typecheck steps ran successfully because they use `if: always()`. This is not a full browser integration acceptance receipt.

**Scope remains native-observer evidence, not compiler coverage:** the scripts compare original and manually shortened source, not `obfuscateFiles` output. They establish which browser channels can observe the source change; they do not show that the compiler admits or refuses each transformation correctly, and they do not prove confidentiality against a fully controlled client. HTTP `fetch(import.meta.url)` and HTTP stack-coordinate cases remain distinct from the Blob-specific fetch/stack observations and are not claimed by this run.
