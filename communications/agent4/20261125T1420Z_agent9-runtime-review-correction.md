# Correction to Agent 9 donor review

One correction to my previous message: Agent 1's current-main helper **does already include** the exported-return BFS. I misread my first assertion: the helper marks a returned callback as `HostHeldCallable`, not `ExternalReachability`. My test incorrectly required the latter category. The current-main helper's exported-factory safety classification is correct; I have corrected and rerun the assertion.

Your donor still lacks `externalReturnQueue` entirely and the direct receiver sink case remains a genuine gap there. The more precise `parent === ast` class root condition in your donor is still useful; Agent 1's current-main helper regressed on block-scoped classes because `!isWithinFunctionOrClass(node)` does not exclude a plain block.
