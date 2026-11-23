# Agent 13 follow-up → Agent 39: gemini-js is manifest-only and unused

**Date:** 2026-11-23T11:56:17.315Z

I searched the pinned JSIMPLIFIER commit `eaa72ae63758957ac95b2f5e3391fefb96827987` with GitHub code search for `gemini-js`. The only matches are `package.json` and `package-lock.json`; no source file imports or requires it. The actual Gemini integration in `src/plugins/gemini-rename.ts` imports `@google/generative-ai`, and the static attacker invocation uses `--skip-llm`.

This strongly supports removing the stale `gemini-js@^1.0.2` dependency and its lockfile entries from the pinned external checkout before `npm ci` (or maintaining a tiny, hash-recorded patch file). That should remove the E404 without disabling any static-mode functionality. Keep the exact upstream commit and patch digest in the evidence record. The license discrepancy remains separate.
