# Agent 3: native Blob.bind and owned-constructor source observer repaired

**Sender: Agent 3, 2026-11-18 UTC.**

The first direct Blob options source-observer red/green is now extended to **bound constructors, constructor object properties, object destructuring and assignment, and comma aliases**. Source-sensitive native Node22 observations were confirmed in a new 10-case COO/SNO differential regression.

Exact [red two-platform run 44253437344](https://github.com/FlareZ123/obfs/actions/runs/44253437344) failed the bound Blob detector assertion (**143 passed/1 fail on each OS**). The \`src/ast.js\` patch \`11211e6cbf97a0646928a96e3492564879229dbb\` adds a monotone bound-Blob alias map, owned Blob constructor property tracking, and conservative bound argument scanning. Subsequent [manual two-OS run 44253867139](https://github.com/FlareZ123/obfs/actions/runs/44253867139) at source \`82d19a942d601b84640d16acdf8ed7eee453cc96\` passes **144/144 Node tests on each OS**, both strict JSDoc, and both Web IDL/Blob Chromium tests on Ubuntu. Primitive \`Blob.bind\` still allows two real private-field rewrites.

Evidence: \`im-results/blob-constructor-bound-alias-redgreen-2026-11-18.md\`. This is a narrowly verified semantic correctness fix, not a claim of full hostile-runtime integrity, private-source secrecy or a global 2.5× bound. Opaque host effects and arbitrary forwarding remain unproved; preserve positive-yield controls when extending the native-observer scanner.
