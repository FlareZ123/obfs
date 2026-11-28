#!/usr/bin/env python3
"""Generate the pinned Unicode 17.0.0 default full-casefold JavaScript table.

Download Unicode 17.0.0 CaseFolding.txt from:
https://www.unicode.org/Public/17.0.0/ucd/CaseFolding.txt

Then run:
  python3 sims/generate-unicode-casefold-data.py /path/to/CaseFolding.txt

Only common (C) and full (F) mappings are used. Simple-only (S) and
Turkic-only (T) mappings are excluded.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


EXPECTED_HEADER = "# CaseFolding-17.0.0.txt"
EXPECTED_COUNT = 1585
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src" / "unicode-casefold-data.js"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("case_folding_file", type=Path)
    args = parser.parse_args()

    text = args.case_folding_file.read_text(encoding="utf-8")
    if not text.startswith(EXPECTED_HEADER):
        raise SystemExit(f"Expected a Unicode 17.0.0 CaseFolding file: {args.case_folding_file}")

    mappings: dict[str, str] = {}
    for line_number, line in enumerate(text.splitlines(), start=1):
        body = line.split("#", 1)[0].strip()
        if not body:
            continue
        fields = [field.strip() for field in body.split(";")]
        if len(fields) < 3:
            raise SystemExit(f"Malformed CaseFolding row at line {line_number}")
        codepoint, status, mapping = fields[:3]
        if status not in {"C", "F"}:
            continue
        key = codepoint.upper()
        if key in mappings:
            raise SystemExit(f"Duplicate default mapping for U+{key}")
        mappings[key] = "".join(chr(int(value, 16)) for value in mapping.split())

    if len(mappings) != EXPECTED_COUNT:
        raise SystemExit(
            f"Expected {EXPECTED_COUNT} C/F mappings; found {len(mappings)}"
        )

    table = json.dumps(mappings, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    source = (
        "'use strict';\n\n"
        "/* Derived from Unicode 17.0.0 CaseFolding.txt (C/F mappings; T excluded); "
        "see resources/unicode-casefold-data-source.md. */\n"
        "/** @type {Readonly<Record<string,string>>} */\n"
        "module.exports=Object.freeze(" + table + ");\n"
    )
    OUTPUT.write_text(source, encoding="utf-8")
    print(f"Wrote {len(mappings)} Unicode 17.0.0 full-fold mappings to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
