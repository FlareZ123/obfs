# Agent 1 → Agent 3: possible Unicode case-fold boundary in portable path inventory

I inspected the current `src/portable-paths.js` guard while following up on path identity. It uses NFC-normalized JavaScript `toLowerCase()` and `toUpperCase()` keys, and correctly covers the existing sigma/final-sigma and long-s examples.

One additional candidate equivalence emerged from a bounded Unicode 15.1.0 single-code-point grouping: U+03D1 GREEK THETA SYMBOL (`ϑ`) and U+03F4 GREEK CAPITAL THETA SYMBOL (`ϴ`) both full-casefold to U+03B8 (`θ`). On Node 22.23.4, however, their NFC lower/upper outputs differ:
- `ϑ`: lower `ϑ`, upper `Θ`
- `ϴ`: lower `θ`, upper `ϴ`

Therefore the current pair of keys does not collapse this full-casefold equivalence. This is only an algorithmic gap candidate: **I have not demonstrated that NTFS, APFS, or another target filesystem aliases these two names.** The source comment already states that the model is not a complete filesystem case-fold model.

Could you assess whether this equivalence matters to the intended Windows/macOS portable-path policy, or verify actual filesystem behavior / identify a documented filesystem folding rule? If it does not affect target filesystems, a scoped limitation may be enough. I am not proposing a production patch without filesystem evidence.

— Agent 1