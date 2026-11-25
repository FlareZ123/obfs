# Browser import-attribute source-observation boundary

Status: intermediate finding and regression evidence; not an established academic result.

## Finding

The cross-file default-export object proof originally treated a default import as the JavaScript default object solely because its relative source path resolved to the exporting file. It did not inspect import attributes/assertions.

That is unsound for modern browsers. A request such as:

\`\`\`js
import source from "./state.mjs" with { type: "text" };
\`\`\`

loads the response as a text module whose default export is the UTF-8 source string. It is not the JavaScript module's default object, even though the URL pathname is the same. A source transform can also change the bytes observed by this text module.

## Minimal differential

\`\`\`js
// state.mjs
export default { length: 23 };

// entry.mjs
import source from "./state.mjs" with { type: "text" };
export const value = source.length ?? -1;
\`\`\`

Before the fix, the compiler's default-object proof renamed length in the producer and the consumer. Chromium then returned 27 for the original source-string length and -1 for the emitted program.

A second fixture disables property rewriting and enables identifier rewriting in the text-imported module. This checks that the main pipeline treats the text import as a source observer rather than merely disabling the cross-file property pass. A third fixture uses dynamic import() options.

## Evidence

- Red-first focused Node 22.23.4 run: https://github.com/FlareZ123/obfs/actions/runs/45659192082. The ordinary default-JavaScript positive control passed; the text-import case incorrectly reported one cross-file property rewrite on both Ubuntu and Windows.
- Red-first real Chromium run: https://github.com/FlareZ123/obfs/actions/runs/45660238076. Original value 27, emitted value -1.
- Candidate fix branch: agent7/import-attribute-text-default-owner-20261125.
- Candidate focused Node regression run: https://github.com/FlareZ123/obfs/actions/runs/45661160566, passed.
- Candidate focused real-Chromium run: https://github.com/FlareZ123/obfs/actions/runs/45661176448, passed, including static and dynamic text imports and an identifier-rewrite source-observation fixture.
- Full manual-validation run: https://github.com/FlareZ123/obfs/actions/runs/45661636541, in progress when this note was written.

## Candidate fix

The branch adds hasAttributedModuleRequest(ast) in src/core.js. It treats static import/export attributes, legacy assertions, and dynamic import options as source-observation edges. This sets the existing group-level remoteSourceObserver guard, disabling source-mutating transforms; the complete guarded host graph also refuses such requests.

src/cross-properties.js independently refuses attributed static import/re-export edges and dynamic import options, so direct calls to the cross-file proof fail closed as well.

Tests cover:
- an ordinary default JavaScript import as a positive control;
- static type=text imports;
- direct cross-file proof refusal;
- host-lock refusal;
- dynamic import attributes;
- actual browser parity for source length and identifier rewrites.

## Scope and remaining questions

This evidence establishes a browser correctness issue in the default-object and source-observation paths. It does not establish that all import-attribute combinations are unsafe, nor does it validate every SCO/SNO-specific graph API. The current guard is deliberately conservative: any non-empty static attribute/assertion list or dynamic import options disables source transforms for the closed group.

The mode-specific SCO private graph APIs do not transform private source bytes in the same way as obfuscateFiles; their import-attribute admission contracts should be reviewed separately before claiming universal mode coverage.

External semantics reference: MDN, https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import/with. It documents that attributes can affect resolution, fetching, parsing, and evaluation; browser type=text imports the source as a string and ignores Content-Type.
