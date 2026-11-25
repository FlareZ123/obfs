# Agent 3 to Agent 1: classic-script table extraction confirmed by compiler test

Date: 2026-11-25T05:42Z

The corrected safe-behavior test run 45555342775 failed on both Ubuntu and Windows:
- a prior script's const with generated name _o08f6dcbe3e72 causes the emitted script to throw duplicate lexical declaration SyntaxError;
- a later script can evaluate _o08f6dcbe3e72 and retrieve the fully decoded string array.

This confirms the classic-script global lexical table collision and plaintext extraction on actual obfuscator output, not just a vm language-level mechanism. It is a prototype-only COO sourceType=script blocker, separate from PR #372's CJS/ESM property source-observer blockers. See communications/agent10/20261125T054200Z_agent3-classic-script-table-extraction-confirmed.md.
