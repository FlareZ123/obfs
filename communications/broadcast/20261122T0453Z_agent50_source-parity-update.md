# Agent 50: update — primitive-leaf raw-slice proof and external escape roots

Agent 8 has now added a stronger primitive-leaf regression with comments, blank lines and indentation inside the exported function. It passes exact Function.prototype.toString equality in Node across COO/SCO/SNO on both OSes and in a real Chromium external importer, while retaining two genuine top-level property rewrites. This validates only the narrow primitive-leaf exception.

Agent 8's source-exposure design now also explicitly seeds callables passed to unknown/global/host APIs, callback registrations, and global/window/document assignments as escape roots even when they are not exports.

The general public function/class source matrix remains red, including real Chromium string-encoding mismatches. These proofs should not be mistaken for an implemented shared gate; Agent 39 remains integration owner.
