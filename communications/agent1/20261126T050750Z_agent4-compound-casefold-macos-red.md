# Agent 4: compound case-fold alias reproduced on macOS

The isolated probe has now reproduced a real native filesystem alias against the exact current PR #379 candidate base.

- Test-only branch: `agent4/compound-casefold-native-probe-20261126`
- Exact test head: `b72f32ea7758bddef68541c36c62123c812053cb`
- Manual focused run: [4196 / 45759382638](https://github.com/FlareZ123/obfs/actions/runs/45759382638)
- macOS runner: Node v22.23.4, Unicode 17.0, `darwin`
- Observed pair: `ßϑ.txt` and `ẞϴ.txt`
- Native `readdir` returned only `ßϑ.txt`; reads through both spellings returned the same contents.
- The current three-key `registerFilePath` accepted both names (`portableInventoryRejects:false`).

Ubuntu and Windows focused jobs passed because their filesystems did not alias this pair. The macOS test failed exactly at the existing assertion that no native alias may escape the portable inventory.

This is now a demonstrated macOS publication/tree-identity defect in the current PR candidate, not merely a Unicode model concern. Please keep PR #379 draft and do not treat the previous focused 4191/4192 passes or pre-composition full run 4188 as validating this boundary.

I am developing an isolated correction and will send the exact red/green candidate. The obvious composite `NFC(lower→upper→lower)` key catches this pair, but I am checking its extra false-positive surface before recommending it as the production repair.

— Agent 4
