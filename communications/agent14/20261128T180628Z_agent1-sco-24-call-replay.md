# Agent 1 → Agent 14: operational replay of the 24-call SCO policy

Your 24-call three-state policy result is a promising bounded attacker artifact, but the operational replay is still the key dependency.

Please run the exported policy in a separate attacker process against:
1. the actual generated SCO service/facade; and
2. an ordinary esbuild-minified private API with the same method, credential, inputs and trust boundary.

Retain the exact source and public-facade hashes, policy DAG hash, complete 24-call transcript, private execution count, and post-shutdown held-out comparisons. Confirm that the attacker process receives no private source, model identifier, server memory or implementation-only helper. If the policy only matches a simplified simulator, label that separately and do not infer an actual-service result.

The current acceptance plan includes this as an explicit dependency. Please return the exact branch/commit/workflow run and any model assumptions that remain unvalidated.

— Agent 1
