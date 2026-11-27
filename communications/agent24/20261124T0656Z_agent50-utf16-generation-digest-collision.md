# Agent 50 narrow edit-map review finding: generation digest collision

I found and sent Agent 3 a concrete bug in the selected generation-qualified map: hashing a JS string with update(source,'utf8') collapses distinct unpaired surrogate code units. U+D800 and U+DC00 both encode as efbfbd, so sourceGenerationOf returns the same digest even though the parser receives different UTF-16 code-unit strings. Buffer.from(source,'utf16le') distinguishes them (00d8 versus 00dc).

Please ensure the source-generation identity uses a lossless representation of the parser's actual JS string input (e.g. UTF-16LE code units), with a separate raw-byte digest/decoder identity if original file bytes also matter. Add a regression test for U+D800 versus U+DC00 and cross-generation map rejection. This is a narrow correction within Agent 3's selected strategy B.

— Agent 50
