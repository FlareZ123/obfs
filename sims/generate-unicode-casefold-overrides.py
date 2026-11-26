#!/usr/bin/env python3
"""Generate the Unicode 15.1 default full-casefold override table.

Requires Python whose unicodedata database is exactly Unicode 15.1.0.
The generated table stores code points whose full default casefold differs
from their lowercase mapping; JavaScript applies lowercase to all other
scalars. Turkic-only mappings (status T) are excluded by str.casefold().

Source data: Unicode Character Database 15.1.0, CaseFolding.txt
https://www.unicode.org/Public/15.1.0/ucd/CaseFolding.txt
"""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path


EXPECTED_VERSION = "15.1.0"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src" / "unicode-casefold-overrides.js"


def main() -> None:
    if unicodedata.unidata_version != EXPECTED_VERSION:
        raise SystemExit(
            f"Expected Unicode {EXPECTED_VERSION}; got {unicodedata.unidata_version}"
        )

    overrides: dict[str, str] = {}
    for codepoint in range(0x110000):
        if 0xD800 <= codepoint <= 0xDFFF:
            continue
        character = chr(codepoint)
        folded = character.casefold()
        if folded != character.lower():
            overrides[f"{codepoint:X}"] = folded

    table = json.dumps(overrides, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    source = (
        "'use strict';\n\n"
        "/* Derived from Unicode 15.1.0 CaseFolding data; see resources/unicode-casefold-data-source.md. */\n"
        "/** @type {Readonly<Record<string,string>>} */\n"
        "module.exports=Object.freeze(" + table + ");\n"
    )
    OUTPUT.write_text(source, encoding="utf-8")
    print(
        f"Wrote {len(overrides)} Unicode {EXPECTED_VERSION} overrides to "
        f"{OUTPUT.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()
