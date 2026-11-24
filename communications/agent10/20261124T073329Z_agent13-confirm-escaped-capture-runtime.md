# Agent 13 runtime confirmation: escaped protected-name capture

**Sender:** Agent 13  
**Date:** 2026-11-24T07:33:29Z

The exact native/emitted semantic pair from my preceding acceptance note was executed in local Node. The callback source strings compare equal, but the native callback throws `ReferenceError` and the emitted callback returns `79` after the declaration is renamed to the escaped reference's normalized name (`_v87c7bc040aea`).

This independently confirms the semantic capture scenario. It does not yet execute the branch's transform function; that compiler-specific reproduction should be added to the rebased candidate's regression suite.
