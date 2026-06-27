#!/usr/bin/env python3
"""Persistent Argos Translate worker for RO <-> EN.

Input:  {"from": "ro", "to": "en", "text": "..."}
Output: {"text": "...", "from": "ro", "to": "en"}
"""

import json
import os
import sys

PAIRS = [("ro", "en"), ("en", "ro")]


def ensure_packages():
    import argostranslate.package
    import argostranslate.translate

    installed = argostranslate.translate.get_installed_languages()
    have = set()
    for lang in installed:
        for trans in lang.translations_to:
            have.add((trans.from_lang.code, trans.to_lang.code))

    missing = [pair for pair in PAIRS if pair not in have]
    if not missing:
        return None

    if os.getenv("ARGOS_AUTO_INSTALL", "1") == "0":
        return f"Missing language pairs: {missing}. Set ARGOS_AUTO_INSTALL=1 or install manually."

    argostranslate.package.update_package_index()
    available = argostranslate.package.get_available_packages()
    for from_code, to_code in missing:
        pkg = next(
            (p for p in available if p.from_code == from_code and p.to_code == to_code),
            None,
        )
        if not pkg:
            return f"No Argos package for {from_code}->{to_code}"
        path = pkg.download()
        argostranslate.package.install_from_path(path)
    return None


def translate_text(text: str, from_code: str, to_code: str) -> str:
    import argostranslate.translate

    from_lang = next((l for l in argostranslate.translate.get_installed_languages() if l.code == from_code), None)
    if not from_lang:
        raise RuntimeError(f"Language not installed: {from_code}")

    to_lang = next((l for l in argostranslate.translate.get_installed_languages() if l.code == to_code), None)
    if not to_lang:
        raise RuntimeError(f"Language not installed: {to_code}")

    translation = from_lang.get_translation(to_lang)
    if not translation:
        raise RuntimeError(f"No translation model {from_code}->{to_code}")

    return translation.translate(text)


def main():
    try:
        err = ensure_packages()
        if err:
            print(json.dumps({"ready": False, "error": err}), flush=True)
            sys.exit(1)
        print(json.dumps({"ready": True, "pairs": PAIRS}), flush=True)
    except Exception as e:
        print(json.dumps({"ready": False, "error": str(e)}), flush=True)
        sys.exit(1)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            text = (data.get("text") or "").strip()
            from_code = (data.get("from") or "ro").lower()
            to_code = (data.get("to") or "en").lower()

            if not text:
                print(json.dumps({"text": "", "from": from_code, "to": to_code}), flush=True)
                continue

            translated = translate_text(text, from_code, to_code)
            print(json.dumps({"text": translated, "from": from_code, "to": to_code}), flush=True)
        except Exception as e:
            print(json.dumps({"error": str(e), "text": ""}), flush=True)


if __name__ == "__main__":
    main()
