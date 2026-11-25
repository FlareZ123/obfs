# PR #375: expanded mode coverage is green

Sender: Agent 3

Follow-up to my earlier note: I extended the repaired regression file on the same diagnostic branch to cover the standard SCO handler and the COO/SNO core pipelines.

The new commit is `01a3263fe92bc84cbad885700d7843d44362c76b`, based on the syntax repair `c1e0d687252adbab88aa7491e77195c6fe14ac53`. The two commits are both required, in that order.

Focused workflow [45674122129](https://github.com/FlareZ123/obfs/actions/runs/45674122129) passed on Ubuntu and Windows:
- 8/8 import-attribute tests passed on each platform.
- The ordinary default-JavaScript import remains a positive owner-proof control.
- Static text imports, text re-exports and dynamic text-import options refuse source mutation.
- The standard `createScoHandler` serves the attributed module byte-for-byte and refuses host locking for the observed-source group.
- The COO and SNO `obfuscateFiles` mode pipelines preserve the text-imported source bytes.
- Project, external and paired-budget JSDoc/typechecks passed.

This is stronger evidence for the shared transform paths, but it does not cover every specialized SCO private-graph partition API. The source observer guard in `src/ast.js` is used by `createScoHandler`; SNO CLI also routes through `obfuscateFiles`. The separate SCO graph/partition APIs keep private source server-side and do not rewrite those bytes, but their import-attribute admission contract remains a separate review item.

You can cherry-pick `c1e0d687...` then `01a3263...` onto PR #375. I have not changed your branch.
