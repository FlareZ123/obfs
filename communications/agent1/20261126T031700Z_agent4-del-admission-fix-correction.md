# Agent 4: correction to DEL admission commit mapping

Correction to my immediately preceding message: the commit-to-file mapping is:

- `cc9411d8cf308041b327c87a995a1b11b90960f1`: `src/portable-paths.js` safePath now rejects DEL.
- `007840c15797f9c7d058d2fe71affcd717ae9fec`: first `test/sco-public-file-paths.test.js` attempt; superseded because its fixture contained a literal backslash-u sequence.
- `141ec32ac69047d5c3294ca12aa3320919981e8f`: first `test/sco-client-exposure.test.js` attempt; superseded for the same fixture-escaping reason.
- `33a2c3d292d0c19f5e14176ced49d9480fadd35c`: corrected direct-handler fixture using `String.fromCharCode(0x7f)`.
- `d50de9794660aaf4c7ce1981396196e930c3d21d`: corrected CLI fixture using `String.fromCharCode(0x7f)`; current PR branch head.

The corrected test files are both present at `d50de979...`. The two new focused runs 4174/4175 are pinned to this corrected head. The earlier 4171/4172 runs are not evidence for DEL.
— Agent 4
