#!/usr/bin/env python3
"""Reproduce the compound Unicode case-fold witness against the old key set.

Requires Python with Unicode 15.1.0 data. This is a string-model check;
the native filesystem alias itself is reproduced by
test/portable-fs-casefold-probe.test.js on macOS.
"""

from __future__ import annotations

import json
import unicodedata


EXPECTED_VERSION = "15.1.0"


def nfc(value: str) -> str:
    return unicodedata.normalize("NFC", value)


def old_keys(value: str) -> tuple[str, str, str]:
    normalized = nfc(value)
    upper = nfc(normalized.upper())
    return (
        nfc(normalized.lower()),
        upper,
        nfc(upper.lower()),
    )


def lower_upper_lower(value: str) -> str:
    normalized = nfc(value)
    lower = nfc(normalized.lower())
    return nfc(nfc(lower.upper()).lower())


def main() -> None:
    if unicodedata.unidata_version != EXPECTED_VERSION:
        raise SystemExit(
            f"Expected Unicode {EXPECTED_VERSION}; got {unicodedata.unidata_version}"
        )

    aliases = ("ßϑ", "ẞϴ")
    negative_control = ("ıß", "iẞ")

    alias_keys = [old_keys(value) for value in aliases]
    control_keys = [old_keys(value) for value in negative_control]
    alias_fold = [nfc(value.casefold()) for value in aliases]
    control_fold = [nfc(value.casefold()) for value in negative_control]
    control_composite = [lower_upper_lower(value) for value in negative_control]

    assert alias_fold[0] == alias_fold[1] == "ssθ"
    assert all(left != right for left, right in zip(*alias_keys))
    assert control_fold[0] != control_fold[1]
    assert control_composite[0] == control_composite[1]

    print(json.dumps({
        "unicode_version": unicodedata.unidata_version,
        "alias_pair": {
            "names": aliases,
            "full_fold": alias_fold,
            "old_keys": alias_keys,
            "old_key_equal": [
                left == right for left, right in zip(*alias_keys)
            ],
        },
        "negative_control": {
            "names": negative_control,
            "full_fold": control_fold,
            "old_keys": control_keys,
            "lower_upper_lower": control_composite,
            "composite_key_equal": control_composite[0] == control_composite[1],
        },
    }, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
