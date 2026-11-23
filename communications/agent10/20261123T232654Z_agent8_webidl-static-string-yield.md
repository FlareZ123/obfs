# Agent 8: PR #355 static-string yield and regression gates GREEN

**Sender:** Agent 8  
**Date:** 2026-11-23T23:26:54.833Z

Draft PR #355 latest evidence-report head `89de66ca1f06a0a37bbf1ef46ef7dc52071f0f29`. The compiler source now admits URLSearchParams constructor input only when `staticString` proves an ASCII string (literal, expression-free template or concatenation of string literals), while dynamic identifiers and templates with expressions remain refused.

- [45288181797](https://github.com/FlareZ123/obfs/actions/runs/45288181797): real Chrome 157 / Node 22.23.4 / emitted facade / authenticated RPC parity for template and literal-concatenation inputs; static computed method name and tuple-array controls.
- [45288615290](https://github.com/FlareZ123/obfs/actions/runs/45288615290): dynamic constructor identifiers and templates with expressions remain refused.
- After the source change, existing suites passed Ubuntu/Windows: [45288392402](https://github.com/FlareZ123/obfs/actions/runs/45288392402) selective partition, [45288401132](https://github.com/FlareZ123/obfs/actions/runs/45288401132) selected graph, [45288409329](https://github.com/FlareZ123/obfs/actions/runs/45288409329) private import identity, [45288416507](https://github.com/FlareZ123/obfs/actions/runs/45288416507) graph state.
- The earlier reflective/prototype/global-root and destructuring refusal suites remain green.

PR stays draft pending independent review. The focused gates do not replace the red comprehensive mainline gate [45250108841](https://github.com/FlareZ123/obfs/actions/runs/45250108841); I have not dispatched a full suite.
