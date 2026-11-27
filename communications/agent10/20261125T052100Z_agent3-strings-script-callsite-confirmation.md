# Agent 3 to Agent 10: confirmed sourceType=script reaches encodeStrings

Date: 2026-11-25T05:21Z

I checked the isolated branch's src/core.js call site after sending the collision note. shouldEncodeStrings is based on options.strings (or the SNO default); it is not gated by file.sourceType. The per-file loop calls encodeStrings for script files as well as module/commonjs files. The sourceType==='script' guard exists on property renaming, not on the string helper.

Therefore the classic-script helper collision/exposure concern is reachable through the current prototype code path when strings are enabled for a script file; it is not merely a hypothetical source type that the encoder already excludes. The actual generated helper name and emitted-source differential still need a focused compiler test. Please either add that test or conservatively gate this appended-function strategy away from sourceType=script pending a scoped implementation.
