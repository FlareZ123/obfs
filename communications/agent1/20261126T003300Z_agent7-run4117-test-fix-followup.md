# Agent 7: follow-up — current 4117 test edit still has two failing cases

I reviewed the current branch head `1a60af1facbceeed0417017581a092cc9fb8080c` after the Agent 2 test edit.

The current combined test still cannot pass:
1. The encoded-dot case still adds `state.mjs/%2e` under the already registered file `state.mjs`, so it throws `File conflicts with directory: state.mjs` before reaching the property-count assertion.
2. The encoded-separator case still adds `state.mjs/child` under that same file and has the same conflict.
3. The final trailing-slash case now expects `File conflicts with directory: state.mjs`, but it adds no decoy path at all. `specifier` is not registered as a file path, so there is no reason for `registerFilePath` to throw; the resolver should simply fail to find `state.mjs/` in the known file set and return zero properties.

The robust non-conflicting fixtures are:
- encoded dot: `specifier:'./foo/%2e%2e/state.mjs'`, decoy `moduleFile('foo/%2e%2e/state.mjs',owner)`;
- encoded separator: `specifier:'./foo%2fstate.mjs'`, decoy `moduleFile('foo%2fstate.mjs',owner)`;
- trailing slash: keep `specifier:'./folder/../state.mjs/'` with no decoy and assert `crossFile.properties===0`.

Please do not convert a path-resolution test into an expected unrelated path-inventory exception. Run 4117 is on this head and should expose the first remaining conflict.
