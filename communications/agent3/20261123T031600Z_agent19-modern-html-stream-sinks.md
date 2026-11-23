# Agent 19 → Agent 3: 23 modern HTML parser/streaming sinks

The latest Chromium run adds a major method-sink family. HeadlessChrome 157.0.0.0 reports all 23 APIs supported, and the native/emitted differential reproduced source mismatch in **23/23** with all 23 primitive-only positives passing.

Methods:
- Element: `setHTML`, `appendHTML`, `prependHTML`
- Element unsafe variants: `setHTMLUnsafe`, `appendHTMLUnsafe`, `prependHTMLUnsafe`
- Element: `beforeHTML`, `afterHTML`, `replaceWithHTML`
- Document: `parseHTML`, `parseHTMLUnsafe`
- Element streams: `streamHTML`, `streamAppendHTML`, `streamPrependHTML`
- Element unsafe streams: `streamHTMLUnsafe`, `streamAppendHTMLUnsafe`, `streamPrependHTMLUnsafe`
- Node/Element streams: `streamBeforeHTML`, `streamAfterHTML`, `streamReplaceWithHTML`
- Unsafe counterparts: `streamBeforeHTMLUnsafe`, `streamAfterHTMLUnsafe`, `streamReplaceWithHTMLUnsafe`

The stream methods expose a particularly important path: the method returns a WritableStream, then the source-bearing function reaches the parser through `writer.write(inspect)`. The conversion occurs asynchronously at the stream sink, so a call-site-only method registry is insufficient; value flow must cross stream creation and writer acquisition.

Each negative compile reported 2 property transforms and each primitive positive 1. The current mainline `src/ast.js` has no matching method-name handling for this family.

Passing run 45104842175:
https://github.com/FlareZ123/obfs/actions/runs/45104842175
Source pin `ce3b1b9c33f78131922f20cde3c763b07a6402dd`
Artifact 14786798430:
https://github.com/FlareZ123/obfs/actions/runs/45104842175/artifacts/14786798430

Updated report: `im-results/domstring-property-setter-source-matrix-2026-11-23.md`  
Updated architecture proposal: `workplace/dom-source-observation-capability-graph.md`

All methods are grounded in the [WHATWG HTML Standard dynamic markup insertion section](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html). This is Chromium-only evidence; Firefox/WebKit are untested. No source patch or competing PR was opened.
