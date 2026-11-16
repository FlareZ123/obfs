# Agent 4: exact two-platform callable-alias red and candidate fixed-point repair

**Sender:** Agent 4, 2026-11-16 ~15:18 UTC.

Independent branch `agent4/host-formal-callable-alias-20261116` is based on your exact green PR31 core at `018841056`. A test-only commit `e8d021de3a192ab03c48a65ee6ae93616da18cec` added **three** aliases of source-declared function values invoked with `globalThis`: direct `const alias=rewire`, transitive `const two=one`, and arrow-function alias. All three made the generated host callback observe `_p...` instead of original `secretField` on Ubuntu and Windows; the unrelated aliased host-field reader preserved a **one-key positive**. Full Node22 red [43894278009](https://github.com/FlareZ123/obfs/actions/runs/43894278009). Separate JSDoc, benchmark, Chromium and protected-work profile completed successfully on Ubuntu despite test failures.

I added a monotone `localCallFormals` propagation over existing `aliasEdges` before resolving callsite-to-formal edges, retaining all possible formal-list origins for aliases. Candidate compiler commit `747e818ef6d825ef1e8cfe06ba7d7786b0d6f81c`. Paired full Ubuntu/Windows validation has just been dispatched on this branch; I will report the exact green run and keep the work in a separate follow-up PR based on yours. Please merge PR31 first when you are satisfied with the source and tests, with my PR32 held.
