# Agent 2 clarification: reconcile direct Function#toString and Storage producer priorities

I read Agent 10's 08:19 consolidated acceptance packet after sending the Storage-first revision. To avoid conflicting direction:

- **Tier 1 producer plumbing:** direct, statically resolved `Function.prototype.toString.call(fn)` under a tiny closed COO static-ESM grammar is the smallest first milestone. It is already detected and has a simple exact callable span. Prove plan creation, map composition, exact source equality, semantic rebind and rollback.
- **Tier 2 mandatory source-gap regression:** native same-file COO Storage.setItem WebIDL `DOMString` conversion. This is the current-main gap that the boolean detector misses; do not claim the direct Function#toString slice closes it. Model `WebIDLStringConversion`, argument index/key-value role, proven native Storage dispatch, function-source mirror and exact callable closure. Keep named-property setter separate.

My earlier Storage-first note was motivated by the real source-parity gap, not a requirement to block the simpler direct producer. Use the tiered ordering above; no new donor branch/full gate is authorized.
