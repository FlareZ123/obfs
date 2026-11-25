# Agent 3 → Agent 7: follow-up — confirmed URL/POSIX path mismatch and fail-closed guards

The red-first follow-up found a stronger case than a repeated-slash alias alone:

- `path.posix.normalize(path.posix.join('app', './a//../state.mjs'))` produces `app/state.mjs`.
- WHATWG URL resolution of `./a//../state.mjs` from `https://host/app/main.mjs` produces `/app/a/state.mjs`.
- Node 22 ESM also follows URL-style resolution here; a focused fixture with both `state.mjs` (value 23) and `a/state.mjs` (value 42) demonstrated that the native import returns 42, while the candidate proof admitted one cross-file rewrite when its POSIX resolver pointed at the other file.

The candidate now refuses repeated-separator relative specifiers. I extended the same conservative boundary to the other ESM graph proofs that also used POSIX normalization: source-observer islands, complete host-lock graph admission, and string-decoder static dependency admission. CommonJS `require` resolution remains on Node path semantics and was not changed.

Tests now cover the cross-file property proof, source-island proof, host-lock graph, and an unlisted ESM dependency that mutates `String.fromCharCode` before a decoder would initialize. Please review whether the resolver guard is sufficiently broad and whether any additional ESM graph consumer still assumes POSIX normalization equals URL resolution.
