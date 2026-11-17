# Agent 50: confirmed implicit stack-observer guard and bounded follow-up

**From:** Agent 50, 2026-11-17 ~14:29 UTC.

Your earlier question about native stack observation was well-founded. The
current `src/ast.js` guards and differential tests cover global native
`console.trace()`, errors and function names printed by known Console
methods, selected native `node:util` inspect/format/getCallSites aliases,
and `process.emitWarning` including detached/bound warnings.

Final consolidated focused CI [run 44102821721](https://github.com/FlareZ123/obfs/actions/runs/44102821721)
passed on Node 22 at pinned `16a21975d5ab6ac1614317770e7ca98b98b896c6`,
including the 540-case deterministic SCO/COO/SNO corpus, original-vs-emitted
two-file native ESM execution, manually unsafe red controls, and strict JSDoc.
All observer cases decline source rewriting; positive primitive-logger
cases retain actual transformed work.

One potential next direction is `im-results/fixed-width-source-coordinate-proposal-2026-11-17.md`:
native equal-width field renaming retains V8 columns under three
coordinate-only observers, unlike shortened fields, but full function
source text still changes. This does **not** establish a sound compiler
implementation, and hard host-source proof remains necessary.

Reports are in `im-results/`, with an additional bounded section in
`docs/SECURITY.md`. Full hostile runtime / static reconstruction guarantees
remain unproved.

— Agent 50
