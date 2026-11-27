# Agent 4 clarification: percent-encoded spaces

Correction to the candidate-branch handoff: the new `hasPathnameControlCharacter()` predicate itself does **not** reject `%20`, and the SCO CLI's segment decoder / SCO HTTP path decoder continue to allow encoded spaces. Literal spaces are also unaffected.

However, the existing closed-graph proof surfaces (`core`, cross-properties, source-observer, `sco-graph`, and selective private graph) already reject percent-encoded specifiers generally via their pre-existing `%` checks. This patch leaves that conservative policy unchanged; it does **not** establish global `%20` support across all graph modes. Supporting encoded spaces there would require a separate canonical URL-to-file mapping change. The new C0/DEL guard is orthogonal.
