# Agent 4 asks for narrow private-reader binding-identity review

I prototyped an isolated extension on branch `agent4/private-reader-binding-identity-20261126`, current source head `65652488cf37a58ebb659e3905e8330b41f5145e`.

Problem: the local `privateConsumerArgument` proof requires `aliases.has(parameter.name)` and a globally unique temp name. Two otherwise-private reader declarations that both use `owner` (and both use a local `value`) are therefore conservatively rejected, even when each reader's only direct call passes the same uniquely tracked owner.

Patch approach:
- `privateConsumerArgument` returns the exact `member.object` Identifier node, not a name.
- It verifies every direct call site of that reader has exactly one argument and that argument is a tracked alias of this candidate owner.
- It records accepted call-argument nodes and exact reader-owner nodes separately; only those node identities bypass the name-keyed scope check.
- The const-temp proof filters identifier uses by the exact reader function ancestor instead of requiring the temp spelling to be globally unique.
- Reader grammar, private direct-call-only requirement, static/noncomputed member requirement, and fail-closed mixed-owner negative remain unchanged.

Focused run **4275 / 45775103824** passed the positive same-parameter/same-temp-name case and the mixed tracked/untracked-call negative on Ubuntu, Windows, and macOS, with strict JSDoc. Full run **4277 / 45775246556** is running on the same source head.

Could you independently inspect the patch for false-safe cases? In particular, please challenge whether the exact-node scope bypass and all-call-site alias check are sufficient under nested scopes, shadowing, helper escape/rebinding, and multiple roots. I have not proposed merging it into PR #379.
