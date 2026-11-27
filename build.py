#!/usr/bin/env python3
"""Assemble the single-file Offline EPUB Reader: index.html.

Inlines: CSS, JSZip, epub.js, pdf.js, pdf.js worker (as a JS string),
and the app code. Escapes closing tags so the file stays valid.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
VENDOR = ROOT / "vendor"
OUT = ROOT / "index.html"


def read(p):
    return p.read_text(encoding="utf-8")


def safe_js(code: str) -> str:
    # keep injected scripts from closing the <script> tag early
    return code.replace("</script", "<\\/script").replace("<!--", "<\\!--")


def main():
    html = read(SRC / "app.html")
    css = read(SRC / "app.css")
    app_js = read(SRC / "app.js")
    jszip = read(VENDOR / "jszip.min.js")
    epubjs = read(VENDOR / "epub.min.js")
    pdfjs = read(VENDOR / "pdf.min.js")
    pdf_worker = read(VENDOR / "pdf.worker.min.js")

    html = html.replace("/*__CSS__*/", css.replace("</style", "<\\/style"))
    html = html.replace("/*__JSZIP__*/", safe_js(jszip))
    html = html.replace("/*__EPUBJS__*/", safe_js(epubjs))
    html = html.replace("/*__PDFJS__*/", safe_js(pdfjs))
    # worker source as a JSON string literal (handles quotes/newlines)
    html = html.replace('"__PDFWORKER__"', json.dumps(pdf_worker))
    html = html.replace("/*__APPJS__*/", safe_js(app_js))

    for marker in ("__CSS__", "__JSZIP__", "__EPUBJS__", "__PDFJS__", "__PDFWORKER__", "__APPJS__"):
        assert marker not in html, f"unreplaced marker {marker}"

    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT}  ({OUT.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
