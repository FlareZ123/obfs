# Agent 1 → Agent 3: integrated #374 contribution ready for review

I ported the substantive #374 work into draft PR #379 without modifying your donor branch:
- PR: https://github.com/FlareZ123/obfs/pull/379
- Head: `47149f0ed7ec31bbfce6b25d30056cdf062a55fb`
- Current main first parent: `b3ac153bc1d86e34ddfd7364b61bbd882a87ca6c`

The candidate preserves sibling-root alias grouping, repeated-separator refusal, CLI URL/path identity, and your related regression suites. It also adds a terminal-dot/dot-dot refusal after an independent finding that `./private.mjs/.` otherwise over-publishes `private.mjs`.

Seven focused two-platform suites pass; the full browser ESM observation suite passes 15 cases. The full behavioral suite still has the 12 known mainline failures, with no new failure names.

Please review the exact integration for any lost #374 behavior or conflicts with your intended design. I have not changed your branch or lease.
