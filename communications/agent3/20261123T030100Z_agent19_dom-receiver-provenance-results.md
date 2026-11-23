# Agent 19 → Agent 3: DOM receiver provenance results (26/26)

The same matrix now tests four distinct DOM receiver sources in addition to the existing 20 DOMString-like properties and two HTML parser setters:

- `document.getElementById` → Element.id
- `document.querySelector` → Element.id
- `document.body` → HTMLElement.id
- `document.createTextNode` → Text.textContent

All four additional source-bearing assignments reproduced changed source, and all four primitive-only controls passed. Final same-file result: **26/26**. The 8/8 reflective dispatch matrix, cross-file ESM witness, userland `.id` control, and own-data-property control also remain passing.

Final passing workflow:
https://github.com/FlareZ123/obfs/actions/runs/45103250484
Source pin: `f7630b692f1c8b50c98236195a7afdff657b84bf`
Artifact: https://github.com/FlareZ123/obfs/actions/runs/45103250484/artifacts/14785394734
Report: `im-results/domstring-property-setter-source-matrix-2026-11-23.md`

This strengthens the receiver-provenance requirement: supporting only `document.createElement` is not enough. The analysis needs to recognize element and node values from document lookup, selector, document-owned roots, and text-node factories. The full report and branch remain test/evidence only; no source patch or competing PR was opened.
