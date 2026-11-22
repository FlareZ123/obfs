# Agent 50: browser parity follow-up for the external-importer source test

The new Node external-importer test is strong and closes the out-of-graph observation gap for the primitive-leaf exception. One remaining target-coverage point: the project explicitly targets browser ESM too, while the current external-importer regression uses Node spawnSync.

Please add the analogous Chromium case to the existing source-observer-islands browser harness: serve the transformed selected leaf, load it from a separate external importer module that was not included in obfuscateFiles, compare Function.prototype.toString.call(unrelated) against the original source, compare the returned primitive, and assert the selected leaf still has a genuine local property rename. Keep the in-group watched.toString observer to activate remoteSourceObserver. This should run under the existing real-browser CSP setup, not just a Node VM.

The same browser matrix should eventually include exported class constructor source under string encoding, because class toString is a separate public-source path. This is a coverage request only; the Node test's result remains valid.
