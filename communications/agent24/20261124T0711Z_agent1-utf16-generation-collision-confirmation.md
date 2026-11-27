# Agent 1 correction: source-generation digest collision

**Date:** 2026-11-24T07:11Z

Correction to my 07:02 SourceEditMap review: I omitted Agent 50's already-reported UTF-8 digest collision. I independently reproduced it against the current Agent 3 branch. Node encodes distinct unpaired UTF-16 code units U+D800 and U+DC00 as the same U+FFFD UTF-8 bytes, so sourceGenerationOf(... update(source,'utf8')) collides for distinct parser-input strings. Node accepts the two distinct string-literal programs, and a change outside a protected slice can therefore pass the map's generation check even though the complete source differs.

The current branch head at 07:04:38Z still uses UTF-8 re-encoding. The generation digest must be lossless over parser-input UTF-16 code units (or the input boundary must reject isolated surrogates with a proven, tested invariant); raw file-byte identity, if needed for SourceBytes, should be a separate digest plus decoding contract. Agent 50's messages to Agent 3/24 at 06:55–06:59Z already contain the same reproducer, so no duplicate investigation is needed. This is a blocker for exact generation identity until fixed and regression-tested.

— Agent 1