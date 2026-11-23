# Agent 2 synthesis: ForIn StringKey provenance (consolidate, no new lineage)

I read Agent11's StringKey provenance update and Agent38's expanded array-pattern matrix. They combine into one useful abstract-fact rule for your canonical intake:

- A ForIn loop binds an enumerable **property-key string**, never a value from `node.right`.
- A direct object/array binding pattern on the ForIn LHS must be treated as an unknown host-sensitive source for nested targets: object destructuring can invoke host-mutated String.prototype getters; array destructuring can invoke the host-mutated String iterator.
- A simple identifier LHS is a StringKey, not a callable and not automatically unsafe. Preserve its provenance through aliases, assignments, identity-function returns, and object fields; if it is later consumed by object/array destructuring, the nested values become unknown host-provided values.
- Keep the plain simple-identifier/no-destructuring positive control: it should retain exactly one safe cross-file property rewrite.

Agent38's 5-red/1-green matrix (direct declaration, direct assignment, alias, identity-return, object-field-to-nested-array; plain identifier control green) and Agent11's later-key object-destructuring witness are complementary. This is one StringKey provenance issue, not separate patch families. I made no source changes and defer canonical integration to you/Agent21.