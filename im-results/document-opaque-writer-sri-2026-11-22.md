# Opaque computed Document writer methods can commit sibling JavaScript source bytes

**Status:** Merged after red-first proof, full Ubuntu/Windows regression and real Chromium validation.
**Modes:** COO/SCO/SNO browser publication graphs.
**Scope:** Source-visible Document receiver, opaque computed method, parser-active string arguments.

## Concrete miss

The source observer in `src/ast.js` previously handled direct `document.write(...)`, `document.writeln(...)` and verified literal computed writer names. An opaque computed selector can select either method at runtime:

```js
const name = globalThis.optionalDocumentWriter || 'write';
document[name]('<script src="./client.js" integrity="sha256-<digest>"></script>');
```

The optional global key is absent in the real browser witness. `name` therefore becomes `write`; the browser parses the SRI attribute and verifies the original `client.js` bytes. Before repair, `knownKey` returned null for the `document[name]` call, so `observesDistributedSource` ignored the call. Obfuscation altered `client.js` and would violate the browser's runtime SRI commitment.

## Red-first reproduction

[Focused Ubuntu/Windows workflow 45073042751](https://github.com/FlareZ123/obfs/actions/runs/45073042751), exact code `060c067e898c1807254970c6a8c9caa58ed51017`, **failed** in both operating systems. Its first new case showed a string-XOR-transformed `client.js` emitted where the original bytes were required. The test contains an opaque method with benign closed markup and a known unrelated `document.querySelector` with a hash-looking argument as positive transformation-yield controls.

## Minimal conservative correction

The `observesDistributedSource` call scan now treats an opaque computed selector on a proved Document receiver as a *possible* `write`/`writeln` writer. It uses the same bounded argument analysis as direct writers: concatenated static arguments containing `integrity=` or an unfinished HTML start tag, and unknown/spread arguments, all preserve the supplied source graph. Proved benign, complete markup still permits client transformation; known other method names do not trigger the writer guard. The AST guard is source-evidence-based and does not instrument the target at runtime.

- `src/ast.js` source observer method dispatch.
- `test/document-opaque-method-sri.test.js` contains five selector/receiver variants in all three modes and two positive rewrite controls per mode.
- `test/document-write-sri-browser.js` adds an opaque selector to the independent native/protected/byte-mutated Chromium triad. The browser must load native and protected variants and reject the altered source under SRI.

The method selector can be runtime-defined, making a precise static value proof impossible in the general case. This guard conservatively declines transformation of related source when ambiguous, so it can reduce obfuscation yield. It is not evidence of confidentiality against a hostile browser, anti-debugging resilience, cryptographic environment authorization or universal 2.5x performance. The overall strong-protection release remains **BLOCKED**.

## Merged-source validation (22 November 2026)

[PR #301](https://github.com/FlareZ123/obfs/pull/301) integrated as `fc40ba72b2657d9f51afdfa8e2eed4bca7b825ce`. The focused [Ubuntu/Windows run 45073143602](https://github.com/FlareZ123/obfs/actions/runs/45073143602) **passed** at `26b1c928c105265069abc0335c3611f4ef33e8ea`. The full [Ubuntu/Windows run 45073247327](https://github.com/FlareZ123/obfs/actions/runs/45073247327) **passed** at report-inclusive head `59dbc16c735ebba67e2344af2cc8b0f083713f4a`. Complete [real Chromium run 45073147274](https://github.com/FlareZ123/obfs/actions/runs/45073147274) **passed** at `26b1c928c105265069abc0335c3611f4ef33e8ea`. Those heads have identical implementation/test blobs: `src/ast.js` `12320ccdbd10f70efc56079ce0e2220411ddef34`, Node test `a7400b710eeb7d4b2c59ba451108f500ffaeb08d`, browser harness `3309e4b5125a887d77a4b5e272785a39a9b79690`. The same three exact blobs were verified on the merged main SHA. The result covers the bounded input families in the tests, with source-preservation potentially reducing obfuscation yield.
