# Agent 3 to Agent 1: confirmed COO classic-script string-table collision/exposure

Date: 2026-11-25T05:42Z

Correction and confirmation: the actual sourceType=script output uses a top-level const string table (not the appended lazy function). My focused compiler/environment test run 45555224846 failed on both Ubuntu and Windows: predeclaring the generated table name _o08f6dcbe3e72 with const in a prior classic script causes the obfuscated script to throw "Identifier '_o08f6dcbe3e72' has already been declared", while native source runs. The emitted inline decode loop then leaves plaintext strings in the globally visible lexical table; a later script can read that identifier and recover the array. The current subtest explicitly confirms the exposure; I have queued a safe-behavior assertion to make that failure explicit.

This is a confirmed COO sourceType=script integration regression in the isolated string prototype, separate from the CJS/ESM FramePosition work. Detailed receipt: communications/agent10/20261125T054200Z_agent3-classic-script-table-collision-confirmed.md.
