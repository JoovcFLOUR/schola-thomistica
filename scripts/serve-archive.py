#!/usr/bin/env python3
"""
Local HTTP server for the offline Corpus Thomisticum archive.
Automatically injects the Schola Thomistica extension bundle (/_extension/content.css & /_extension/content.js)
into served HTML pages so any browser can experience the full interactive platform offline.
"""

import argparse
import http.server
import socketserver
from pathlib import Path

ARCHIVE_DIR = Path(__file__).resolve().parent.parent / "archive"


class ScholaArchiveHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ARCHIVE_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        path = self.translate_path(self.path)
        fpath = Path(path)
        if fpath.is_dir():
            fpath = fpath / "index.html"

        if (
            fpath.exists()
            and fpath.is_file()
            and fpath.suffix.lower() in (".html", ".htm")
            and (ARCHIVE_DIR / "_extension" / "content.js").exists()
        ):
            raw = fpath.read_bytes()
            text = raw.decode("iso-8859-1", errors="ignore")
            if "_extension/content.js" not in text:
                inject_head = '<LINK REL="stylesheet" HREF="/_extension/content.css?v=1.2.0" TYPE="text/css" CHARSET="utf-8">\n</HEAD>'
                inject_body = '<SCRIPT SRC="/_extension/content.js?v=1.2.0" CHARSET="utf-8" DEFER></SCRIPT>\n</BODY>'
                text = text.replace("</HEAD>", inject_head).replace("</head>", inject_head)
                text = text.replace("</BODY>", inject_body).replace("</body>", inject_body)
                data = text.encode("iso-8859-1", errors="ignore")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=ISO-8859-1")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return

        super().do_GET()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve offline Corpus Thomisticum archive")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on (default: 8765)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    args = parser.parse_args()

    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((args.host, args.port), ScholaArchiveHandler) as httpd:
        print(f"Serving Corpus Thomisticum offline archive at http://{args.host}:{args.port}/")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
