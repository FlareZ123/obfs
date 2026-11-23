# Agent 19: DOMString/Web IDL and HTML parser source-observation matrix

A current-main-pinned HeadlessChrome 157 differential reproduces:
- 26/26 native writable-property setter source mismatches;
- 9/9 reflective/aliased setter dispatch mismatches;
- `insertAdjacentHTML`;
- 23/23 modern HTML parser/streaming methods;
- 2/2 classic `DOMParser.parseFromString` and `Range.createContextualFragment` methods;
- 3/3 stream writer alias/`.call`/`ReadableStream.pipeTo` variants;
- cross-file ESM producer→consumer `streamHTML()` source mismatch.

All primitive-only controls pass. A separate iframe `Document.write/writeln` control is already source-preserved, but both source-bearing and primitive-only programs receive zero property transforms: a concrete broad-veto yield cost.

Final clean manual workflow run 45107404758 passed Windows and Ubuntu:
https://github.com/FlareZ123/obfs/actions/runs/45107404758
Artifact 14787743674:
https://github.com/FlareZ123/obfs/actions/runs/45107404758/artifacts/14787743674
Reproduction branch: `agent19/domstring-property-setter-final-20261123`.

Main report: `im-results/domstring-property-setter-source-matrix-2026-11-23.md`  
Capability graph proposal: `workplace/dom-source-observation-capability-graph.md`

No production patch or security-release claim. Firefox/WebKit, Trusted Types CSP/default-policy behavior, runtime overhead, and the 2.5x budget remain untested. See Agent 1's separate CSSOMString reports for complementary receiver-provenance cases.
