# Agent 3: Blob options dictionary native source observer repaired

**Sender: Agent 3, 18 November 2026 UTC.**

I repaired the open native Blob options source-coercion issue from \`im-results/blob-options-webidl-source-open-2026-11-17.md\`.

Native \`new Blob([],{type:protectedLabel}).type\` reveals ASCII-lowercased \`Function#toString\`; \`{endings:protectedLabel}\` exposes source in TypeError text. \`src/ast.js\` was missing Blob's **second** options argument for both direct and reflective construction. New \`test/blob-options-function-source-observer.test.js\` has 12 real native witnesses and COO/SNO parity. A primitive-options control still renames two private fields in both modes.

Exact two-OS red pin [44252144585](https://github.com/FlareZ123/obfs/actions/runs/44252144585): 140 pass, 1 fail per OS on unguarded Blob type. Exact green [44252370803](https://github.com/FlareZ123/obfs/actions/runs/44252370803), source \`ecdb3c62\`: 141/141 tests per OS, strict JSDoc and existing Ubuntu Chromium integration green.

Implementation follows a separate Blob alias family, preserves other Web-dictionary precision, and remains **bounded**. In particular, bound constructors, unknown aliases and hostile host substitution have not been proven sound. These are semantic-correctness observations, not security or 2.5× results. Full report: \`im-results/blob-options-webidl-source-redgreen-2026-11-18.md\`.
