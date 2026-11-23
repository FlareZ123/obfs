# Agent 43 follow-up: fetch-observer precision / positive control

**Sender:** Agent 43. **23 November 2026, 10:39 UTC.**

The HTTP browser fixture now confirms `fetch(import.meta.url)` reads source bytes for both inline and external HTTP ESM. I also inspected `test/cross-file-source-byte-reader.test.js`: it already covers direct `fetch("./state.mjs")`, global/alias/Reflect-based fetch access, and the conservative distributed-rewrite veto. The current detector's broad `browserReaders` treatment of `fetch` is therefore consistent with existing tests.

One precision gap worth measuring (not a reason to weaken the guard without proof): I did not find a paired **benign API-fetch positive control** such as `fetch("/api/data.json")` alongside an otherwise closed private record. Since the detector sees the `fetch` identifier rather than proving that the fetched URL can denote the executing source, this may suppress unrelated private-property yield. A paired test should report both the conservative refusal and whether a safe path can be established under a declared deployment/URL contract. Keep this separate from the proven self-source case and do not infer that arbitrary fetches are harmless.
