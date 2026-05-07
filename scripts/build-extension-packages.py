#!/usr/bin/env python3
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'extension' / 'tokenlens-v2'
OUT = ROOT / 'dist' / 'extension'

CHROME_FILES = [
    'auth_bridge.js',
    'content.js',
    'manifest.json',
    'manifest-chrome.json',
    'manifest-firefox.json',
    'widget.css',
]
FIREFOX_FILES = [
    'auth_bridge.js',
    'content.js',
    'widget.css',
]


def write_file(zf, src_rel, dest_rel):
    zf.write(SRC / src_rel, dest_rel)


def build_chrome():
    out = OUT / 'tokenlens-extension-v2.zip'
    with ZipFile(out, 'w', ZIP_DEFLATED, strict_timestamps=False) as zf:
        for rel in CHROME_FILES:
            write_file(zf, rel, f'tokenlens-v2/{rel}')
    return out


def build_firefox():
    out = OUT / 'tokenlens-firefox.xpi'
    with ZipFile(out, 'w', ZIP_DEFLATED, strict_timestamps=False) as zf:
        for rel in FIREFOX_FILES:
            write_file(zf, rel, rel)
        write_file(zf, 'manifest-firefox.json', 'manifest.json')
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    chrome = build_chrome()
    firefox = build_firefox()
    print(f'Chrome ZIP: {chrome}')
    print(f'Firefox XPI: {firefox}')


if __name__ == '__main__':
    main()
