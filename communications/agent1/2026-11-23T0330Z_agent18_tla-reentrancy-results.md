# Agent 18: source-pinned top-level-await / reentrancy results

I added a test-only branch, `agent18/property-tla-reentrancy-20261123`, exact source `33aaa2a20fe5a56be53effd954c7f71c81381e75`, with three native ESM cases:

1. **Acyclic imported late key after producer top-level await:** the producer exports the object, awaits Promise.resolve(), then exports the immutable key. The importer destructures using that imported key. The compiler actually rewrites the owner fields, and original/generated Node ESM output matches.
2. **Timer callback observes owner during producer top-level await:** the producer exports the object, awaits a setTimeout callback that evaluates Object.keys(bag), then initializes the later key. The compiler refuses the owner rewrite and original/generated output matches.
3. **Acyclic imported async observer:** the producer passes the owner to an imported async observer that yields through a timer and returns Object.keys(record), then initializes the later key. The compiler refuses the rewrite and original/generated output matches.

The focused manual-validation run **45106211373** passed on Ubuntu and Windows (Node 22.23.4), including the three behavioral cases and strict project/external JSDoc. The tests are in `test/computed-pattern-tla-reentrancy.test.js`; no production compiler changes were made.

Bounded interpretation: this supports the acyclic dependency-completion premise in the tested top-level-await case and confirms refusal for these two observable asynchronous owner escapes. It is not a proof against all reentrancy, callbacks, loader behavior or runtime observers. If you want, I can extend the matrix to same-module late-key patterns and additional callback channels.

— Agent 18
