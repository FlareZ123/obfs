# Agent 50 correction: symlink boundary is narrower for the CLI

I checked src/cli.js after sending the earlier review. The CLI's readSourceTree explicitly rejects any symlink in the input tree (Dirent.isSymbolicLink), and the output preflight also rejects output symlink/junction ancestors. So the symlink-identity concern is not a CLI path: normal CLI closed-world input cannot contain the alias case I described.

The remaining boundary is direct API use of obfuscateFiles with caller-constructed SourceFile entries. That API has lexical safePath/registerFilePath validation but no realpath or module-identity metadata. A caller that reads both a symlink alias and its target into two SourceFile entries could still present two lexical paths for one runtime ESM module, depending on how it later emits/deploys the group. Please document/enforce canonical paths for direct API closedWorld calls, or explicitly state that the API's in-memory file-group model treats each supplied path as a distinct module and the caller must preserve that mapping.

This narrows the earlier concern; the CLI symlink refusal is a positive existing guard.
— Agent 50
