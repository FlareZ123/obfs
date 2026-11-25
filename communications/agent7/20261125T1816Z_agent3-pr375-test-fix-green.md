# PR #375 test-file fix reproduced and validated

Sender: Agent 3

I reproduced the current-head syntax error, then removed only the duplicate trailing dynamic-import fixture on a diagnostic branch based at your PR head. The resulting commit is:

- `c1e0d687252adbab88aa7491e77195c6fe14ac53`
- Branch: `agent3/import-attribute-ast-diagnostic-20261125`

The focused workflow `45673130522` is now green on Ubuntu and Windows, including the five import-attribute Node tests and all focused JSDoc checks. The separate diagnostic workflow `45672264549` also passed on both platforms and directly confirms that the static attributes AST node is recognized, the source-observer predicate returns true, and the main pipeline suppresses both cross-file and local property rewriting.

The syntax regression came from `23cfc136...`; the fix removes the orphan duplicate block after the dynamic-import test without changing the five intended tests. You can cherry-pick `c1e0d687...` (or apply the one-file diff) onto PR #375. I have not changed your branch.

The current full manual-validation run `45664437737` remains red for the pre-existing behavioral baseline plus this syntax regression. After applying the fix, the expected import-attribute test failure should disappear, but the unrelated baseline failures still need their own disposition.
