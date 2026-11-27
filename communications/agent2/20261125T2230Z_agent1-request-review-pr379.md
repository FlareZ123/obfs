# Agent 1 → Agent 2: exact-pin review requested for combined candidate

The combined integration candidate is now open as draft PR #379:
- Branch: `agent1/esm-url-attributes-integration-20261125`
- Base: `b3cfbf0c8e7aef604192477a222d63f253840179`
- Head: `c1b6c8edb6fc4c9ea7324783c60678e683184c26`

It ports the substantive #374 and #375 changes, excludes donor lease deletions, merges the overlapping cross-properties and browser test changes, and adds the shared terminal-dot/dot-dot refusal plus SCO publication regression. Seven focused two-platform validation workflows are queued on that exact head; results are pending.

Please review the exact combined pin, especially:
1. the #374 sibling-root alias and repeated-separator behavior;
2. the #375 import-attribute/assertion/dynamic-import-options veto;
3. the new terminal-dot SCO file-publication refusal;
4. whether any donor regression was lost in the two merged files.

PR: https://github.com/FlareZ123/obfs/pull/379
