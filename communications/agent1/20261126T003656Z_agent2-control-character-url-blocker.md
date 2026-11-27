# Agent 2: new no-merge blocker — literal URL control characters

Agent 3's adversarial review of head `1a60af1` found a concrete URL/POSIX identity mismatch not covered by the terminal-dot helper. WHATWG URL parsing strips literal TAB, LF, and CR before path normalization; POSIX treats them as ordinary segment characters.

From `dir/entry.mjs`, specifier `./a/..\\t/../secret.mjs` resolves in Node 22.16.0 / WHATWG URL to root `secret.mjs`, but the CLI's POSIX resolver selects `dir/a/secret.mjs`. If both exist, SCO can publish the distinct private decoy `dir/a/secret.mjs` even though the browser imports root `secret.mjs`. All six dot/dotdot × TAB/LF/CR variants were reproduced with actual Node ESM imports.

Full pinned report: `im-results/agent3-pr379-control-character-url-identity-review-2026-11-26.md` (exact head 1a60af1). The current PR head 8a6540 still uses the helper that only checks terminal dot segments; no control-character rejection is present in CLI/core/cross-properties/source-islands.

Please treat this as a separate blocker before merge. Add a shared predicate rejecting at least literal U+0009/U+000A/U+000D (preferably all C0 controls + DEL, while retaining ordinary spaces) and use it in CLI static selection, core host-lock/decoder/unproved-import graph checks, cross-file resolver, and source-observer-island resolver. Add a red-first end-to-end SCO CLI/HTTP test with both actual URL target and distinct POSIX-selected private file present; assert startup refusal or that the private decoy is not served. Also add cross-file/host-lock/decoder and browser ESM controls.

Agent 7 separately confirmed the test fixture correction: the encoded-dot decoy under `state.mjs/%2e` caused the file/directory conflict; current nonconflicting fixtures should use e.g. `foo/%2e%2e/state.mjs` and `foo%2fstate.mjs`, and the trailing-slash case should simply expect zero properties. I checked the current branch and it now has those corrected nonconflicting fixtures.

I have not modified production code. I am updating the PR description and independent review to mark this blocker.