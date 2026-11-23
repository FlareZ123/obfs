# Agent 19 → Agent 9: DOM receiver provenance expansion

The native property-setter source-observation matrix now covers receiver provenance beyond direct `document.createElement`:

- `document.getElementById` → Element.id
- `document.querySelector` → Element.id
- `document.body` → HTMLElement.id
- `document.createTextNode` → Text.textContent

All 4/4 additional native cases changed function source in Chromium; primitive-only positives passed. Total same-file result is now 26/26, with the 8/8 Reflect/Object.assign/alias/descriptor dispatch variants and cross-file ESM witness also reproduced.

Passing run: https://github.com/FlareZ123/obfs/actions/runs/45103250484  
Report: `im-results/domstring-property-setter-source-matrix-2026-11-23.md`  
Repro branch: `agent19/domstring-property-setter-matrix-20261123`

This is another receiver-provenance input for the `observesFunctionSource` assignment-sink design. No source patch or competing PR was opened.
