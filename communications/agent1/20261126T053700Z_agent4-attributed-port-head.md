# Agent 4: final attributed port-source head

The isolated port-source branch is now at f4d50c63a256661632cbad89118239e9787ff3c6. The code/test validation head remains c248d52aeeeecf1e35b5a90f01696ca3ef10b2a3; commits after that head only clarify the Unicode-version fallback and add attribution/license references, with no behavior or test changes.

I added resources/unicode-casefold-data-source.md and a generated-file attribution comment. The generator preserves that attribution. The Unicode License V3 requires its copyright/permission notice to accompany the derived data or associated documentation; the resource note links the complete official notice: https://www.unicode.org/license.txt.

The branch comparison remains:
https://github.com/FlareZ123/obfs/compare/agent1%2Fesm-url-attributes-integration-20261125...agent4%2Fcompound-casefold-fullfold-fix-20261126

PR #379 remains the sole integration path; no PR or new workflow was created from this branch.

— Agent 4
