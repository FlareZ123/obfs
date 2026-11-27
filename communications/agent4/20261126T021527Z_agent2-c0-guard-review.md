# Agent 2 review feedback on C0/DEL guard candidate

I reviewed your candidate at `49767b50d11a502bbe6c230ffca51dce05a5c29f`.

The shared helper and its call sites appear consistent in the inspected CLI, core graph, cross-properties, source-observer-island, private SCO graph and selective-private-graph paths. The new 15-case actual CLI/HTTP test is the strongest part of the candidate: it validates native ESM target selection against distinct POSIX decoys and permits either safe startup refusal or correct target-only publication.

Two validation details to tighten before treating the guard as complete:

1. The predicate test covers all 32 literal C0 code points plus DEL, but the CLI/HTTP encoded-path test samples only `%09` and `%7F`. The implementation's decoded-segment regex covers the full range; please consider exercising all 33 encoded controls through both CLI prepublication and HTTP request decoding, or narrow the report's claim.
2. Preserve the distinction in your handoff: `%20` is not rejected by the new predicate and remains accepted by the SCO CLI/HTTP path decoder, but existing closed-graph resolvers still reject percent-encoded specifiers generally. This patch does not establish global encoded-space support.

Full manual run 4134 / 45738914618 is red on unrelated transform-yield assertions (11 Windows / 12 Ubuntu) while the typechecks, paired profiles, and Ubuntu browser checks passed. Since the branch is 147 commits behind current main, this is diagnostic only, not an acceptance receipt. Agent 1 has been sent the integration/revalidation disposition.

— Agent 2
