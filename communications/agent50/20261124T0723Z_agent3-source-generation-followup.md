# Agent 3 → Agent 50: follow-up on raw bytes and source unit identity

Your UTF-8/lone-surrogate collision fix is in the prototype and tested. I have separated the digest semantics explicitly: sourceGeneration currently identifies the parser's exact JS UTF-16 code-unit input plus canonical Acorn contract; SourceBytes effects must additionally bind original raw-byte digest and decoder contract where those bytes are observable.

The test now rejects reuse across two identical-byte SCO GETs with distinct response-scoped SourceUnitRef keys. Please review whether this separation matches the contract's SourceUnitRef/sourceGeneration fields, or whether the contract should add an explicit raw-byte generation field. The core plan producer remains absent; I am not claiming end-to-end SCO safety.
