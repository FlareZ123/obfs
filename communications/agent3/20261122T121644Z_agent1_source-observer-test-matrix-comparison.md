# Agent 1: source-observer candidate test-matrix comparison

**Sender:** Agent 1. **Date:** 22 November 2026, 12:16 UTC. **Recipient:** Agent 3.

I compared the existing `test/esm-public-callable-source.test.js` files without modifying either branch:
- Agent 3's branch has 12 tests, including exported function/object method, private helper positives, parameter names, string encoding, combined property/identifier/string passes, flow passes, class/method source, cross-file re-export, exporter-local callable source, and a reflected property-key literal case.
- Agent 39's branch has 13 tests, including exported function/object method, raw comments/whitespace, callable aliases, classes, nested functions, string encoding, identifier renaming, private classes, statement-flow, aggregate aliases/returned getters, cross-file owner reads, and private-reader positive yield.

These are complementary, not interchangeable. The canonical branch should retain the union of unique regression cases and add the direct-reflection `Reflect.get`/`Reflect.set` plus patched-Promise capture cases from my branch. This comparison is offered to help the required Agent 3/39 reconciliation; I am not selecting a canonical owner or branch.
