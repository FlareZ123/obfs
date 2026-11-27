# Agent 6 — receiver escape-boundary investigation (2026-11-25)

## Status

Intermediate research only. No production release or security claim.

Working branch: \`agent6/return-escape-boundary-20261125\`  
Branch checkpoint under validation: \`de1827a9fd8e5c0d78ab7d1697381dd21d26b263\`  
Base: Agent 5 explicit-this/call/apply branch commit \`2590bc17015b9dca0f782e4ef8d0f3732889c66c\`.

## Question

Can the receiver-bound ambient-call helper distinguish callable values that are genuinely observable at a host boundary from callable values that are only returned by an ordinary local function? The distinction matters because over-retention suppresses safe transformations, while under-retention can change host-observable behaviour.

## Initial counterexample and diagnosis

An independent 15-case suite was added at \`test/agent6-receiver-instance-override.test.js\`. It covered constructor writes, own class fields, inheritance, conditional/dynamic writes, post-construction writes, host-call returns, and returned arrow closures.

The older lexical-arrow donor initially passed 6/9 primitive/receiver cases. The three failures were conservative over-retentions involving a prototype method shadowed by an own primitive value. Reason tracing showed that the immediate cause was not just property lookup: the helper had two blanket return sinks that marked callable values from every \`ReturnStatement\` as host-held, regardless of whether the returning function escaped.

A property-resolver-only patch did not remove those false positives. The reason trace was decisive: the \`returned-callable-value\` reason originated from the prototype method's return expression even though that method was not the runtime value read from the instance.

## Changes on the research branch

### 1. Escape-sensitive return propagation

- Removed the whole-program blanket \`ReturnStatement\` sink.
- Removed the per-function blanket \`ReturnStatement\` sink.
- Added return propagation to \`hostHeldClosureQueue\`: callable values returned by a function are held only when that function is already known to be host-held.
- Changed external/module-export return propagation to use \`callableNodesForValueWithReceiver\` for both initial and transitive returned values. This preserves bound \`this\` flows through \`bind\`, \`call\`, \`apply\`, and \`Reflect.apply\`.
- Ordinary local return values remain local until a call result, wrapper, export, or host-call boundary proves that they escape.

### 2. Instance-property precedence

- Added a deliberately narrow \`classConstructorPropertyWrites\` proof for straight-line direct \`this.key = value\` assignments.
- The proof accepts only a static target key and a primitive or statically resolved callable RHS; an empty \`super()\` statement is allowed in a derived constructor.
- A guaranteed constructor write overrides class fields and prototype methods. Otherwise, the last own instance field shadows prototype members.
- Conditional, dynamic, receiver-dependent, unknown-call, and unrelated constructor statements remain opaque. Opaque constructors retain constructor, own-member, and inherited candidates rather than claiming a precise override.
- Inheritance lookup continues only when no own field or proven constructor write supplies the property.

### 3. Regression coverage

\`test/agent6-receiver-instance-override.test.js\` now includes 17 probes, including:
- constructor callable and primitive overrides;
- conditional and dynamic writes;
- post-construction writes;
- class-field and inherited-method shadowing;
- an unused local return remaining unheld;
- a local return passed directly to the host;
- returned arrow closure capture propagation;
- transitive wrapper returns;
- exported bound versus unbound receiver returns.

\`test/agent6-receiver-escape-boundary-cross-suite.test.js\` aggregates the repository's receiver-flow cross-suite, Agent 5's explicit-this/call/apply/bind suite, and the 17 independent probes.

## Validation evidence

- Older donor run \`45676198537\`: 15/15 focused runtime tests passed on Ubuntu and Windows under Node 22. The workflow still failed strict external JSDoc type-checking because that older donor had stale \`Set<unknown>\` signatures. This is not a clean validation result.
- The newer branch is based on Agent 5's corrected \`Set<number>\` / \`Set<AstNode>\` implementation.
- Focused aggregate workflow \`45678081748\` was dispatched on the branch checkpoint above and was queued as of this report. Its test results and type-check outcome are pending; do not describe the new branch as validated until they are retrieved.

## Limitations and next work

This is a static-analysis helper investigation, not a production obfuscator result. It does not establish tamper resistance, static/dynamic deobfuscation resistance, domain locking, browser compatibility beyond the tested fixtures, or the 2.5x runtime bound.

Next:
1. Retrieve workflow \`45678081748\` after the GitHub Actions API rate limit clears; inspect failed jobs only with a short log tail.
2. Confirm the aggregate actually executes all imported test suites, not just the wrapper.
3. If green, send Agent 5 and Agent 4 the exact branch, diff, test evidence, and remaining limitations.
4. If any tests fail, retain the failing counterexample and repair the escape model rather than restoring unconditional return sinks.
5. Review yield/throw escape propagation separately; do not broaden this change without corresponding host-boundary tests.
