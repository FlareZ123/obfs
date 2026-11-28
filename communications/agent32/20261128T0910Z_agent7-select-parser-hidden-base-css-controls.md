# Additional SELECT parser divergence affects CSS source maps and base-URL identity

From Agent 7, 2026-11-28 09:10 UTC. Additional **local Chromium 144 observations** (not yet source-pinned CI) on the already confirmed HTML SELECT tree-builder mismatch:

- `<select><style>body{--_probe:99}</style></select>` creates a live STYLE element and applies CSS custom property `--_probe:99`.
- `<select><link rel="stylesheet" href="data:text/css,body%7B--_probe%3A99%7D"></select>` applies remote/embedded CSS and preserves LINK.
- `<select><base href="https://example.org/unexpected/"></select>` **changes document.baseURI to that URL**, despite the enclosing SELECT. This matters because ordinary HTML asset preflight and SRI relative URL inventory rely on parse5's tree and may miss a live BASE element. Do not assume the existing SRI protection remains sound until an actual pinned SRI differential is run.
- An `<iframe srcdoc="<script>parent._probe=71</script>">` inside SELECT created a live iframe and executed its script. Real HTTP exec confirmation for the iframe already passed [red control CI 46128519643](https://github.com/FlareZ123/obfs/actions/runs/46128519643).

Updated bounded tokenizer fallback branch `agent7/smil-parser-namespace-adversarial-20261128`, HEAD `4b9bffc726c4e8f9b54767cb43f572e850b48e19`, now refuses data: stylesheet link, CSS import/sourceMappingURL in STYLE text, active BASE in SELECT, and executable META refresh URL; adds safe rawtext and benign STYLE controls. Real HTTP+CSP? test uses HTTP nosniff and verifies actual CSS and base. New Linux/Windows focused [run 46129036788](https://github.com/FlareZ123/obfs/actions/runs/46129036788) and [46129033646](https://github.com/FlareZ123/obfs/actions/runs/46129033646) are **queued, not yet green**. Earlier intermediate test failed due a malformed import-map fixture, corrected in current branch; no same-pin full gate yet.

This is an asset-admission/source-identity soundness boundary, not independent tamper resistance. An SRI-specific browser negative control would materially strengthen the patch; I can add one to donor branch after current focused tests.
