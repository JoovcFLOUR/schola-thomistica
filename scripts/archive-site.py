#!/usr/bin/env python3
"""
Polite, resumable, full-site archiver for Corpus Thomisticum (https://www.corpusthomisticum.org/).
Downloads all Opera Omnia, Thomas-Lexikon, Subsidia, introductions, stylesheets, and icons,
rewrites absolute self-links for offline browsing, and writes manifest-archive.json.
"""

import concurrent.futures
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from pathlib import Path
from threading import Lock

BASE_URL = "https://www.corpusthomisticum.org/"
DOMAIN = "www.corpusthomisticum.org"
ARCHIVE_DIR = Path(__file__).resolve().parent.parent / "archive"
CRAWL_DELAY_SECONDS = 0.05
MAX_WORKERS = 6

SEED_PATHS = [
    "index.html",
    "iopera.html",
    "tl.html",
    "ichartae.html",
    "ibfonvit.html",
    "ilcatope.html",
    "repedleo.html",
    "uabbrev.html",
    "reoptedi.html",
    "reopauth.html",
    "revincul.html",
    "ygoogle.html",
    "ealarcon.html",
    "eandroid.html",
    "vscreen.css",
    "vprint.css",
    "vaural.css",
]

LINK_RE = re.compile(
    r"""(?:HREF|SRC|href|src)\s*=\s*["']([^"']+)["']|<OPTION\s+VALUE\s*=\s*["']([^"']+\.html)["']|url\(([^)]+)\)""",
    re.IGNORECASE,
)

ALLOWED_EXTENSIONS = {
    ".html",
    ".htm",
    ".css",
    ".gif",
    ".jpg",
    ".jpeg",
    ".png",
    ".ico",
    ".js",
    ".txt",
    ".xml",
}


def normalize_internal_url(source_url: str, raw_link: str) -> str | None:
    link = raw_link.strip().strip("'\"")
    if not link or link.startswith(("#", "javascript:", "mailto:", "data:")):
        return None
    if link == "none" or "----" in link or link.startswith("intitle:"):
        return None

    joined = urllib.parse.urljoin(source_url, link)
    parsed = urllib.parse.urlsplit(joined)
    if parsed.netloc not in (DOMAIN, "corpusthomisticum.org"):
        return None

    path = parsed.path
    if not path or path == "/":
        path = "/index.html"
    elif path.endswith("/"):
        path = path + "index.html"

    # Skip external iframe wrapper /bt/ or heavy binary APKs if any
    ext = os.path.splitext(path)[1].lower()
    if ext and ext not in ALLOWED_EXTENSIONS:
        return None

    return f"https://{DOMAIN}{path}"


def url_to_relpath(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    rel = parsed.path.lstrip("/")
    if not rel or rel.endswith("/"):
        rel = rel + "index.html"
    return rel


def rewrite_offline_links(content_bytes: bytes, rel_path: str) -> bytes:
    depth = rel_path.count("/")
    prefix = "../" * depth if depth > 0 else ""
    encoding = "utf-8"
    try:
        text = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        encoding = "iso-8859-1"
        try:
            text = content_bytes.decode("iso-8859-1")
        except Exception:
            return content_bytes

    # Replace https://www.corpusthomisticum.org/ and http://www.corpusthomisticum.org/ with relative prefix
    text = text.replace("https://www.corpusthomisticum.org/", prefix)
    text = text.replace("http://www.corpusthomisticum.org/", prefix)
    return text.encode(encoding, errors="ignore")


def categorize_file(rel_path: str) -> str:
    name = os.path.basename(rel_path).lower()
    if rel_path.startswith("icons/") or name.endswith((".gif", ".jpg", ".png", ".ico")):
        return "icons_assets"
    if name.endswith(".css"):
        return "stylesheets"
    if name.startswith("tl"):
        return "thomas_lexikon"
    if name.startswith(("wintro", "index", "iopera", "ichartae", "ibfonvit", "ilcatope", "re", "uabbrev", "ygoogle", "ealarcon", "eandroid")):
        return "navigation_subsidia"
    return "opera_omnia"


def fetch_url(url: str, retries: int = 3) -> bytes | None:
    headers = {
        "User-Agent": "ScholaThomisticaArchiver/1.0 (Academic Latin Study Archive; +https://www.corpusthomisticum.org/)"
    }
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status == 200:
                    return resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(0.5 * (attempt + 1))
        except Exception:
            time.sleep(0.5 * (attempt + 1))
    return None


def extract_links_from_bytes(url: str, data: bytes) -> set[str]:
    try:
        text = data.decode("iso-8859-1", errors="ignore")
    except Exception:
        return set()
    found: set[str] = set()
    for match in LINK_RE.finditer(text):
        raw = match.group(1) or match.group(2)
        if not raw:
            continue
        norm = normalize_internal_url(url, raw)
        if norm:
            found.add(norm)
    return found


def main() -> int:
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    discovered: set[str] = {urllib.parse.urljoin(BASE_URL, p) for p in SEED_PATHS}
    processed: set[str] = set()
    failed: list[str] = []
    lock = Lock()

    print(f"[archive] Starting Corpus Thomisticum archive into {ARCHIVE_DIR}")

    def process_one(url: str) -> set[str]:
        rel_path = url_to_relpath(url)
        dest = ARCHIVE_DIR / rel_path
        dest.parent.mkdir(parents=True, exist_ok=True)

        is_text = rel_path.endswith((".html", ".htm", ".css"))
        if dest.exists() and dest.stat().st_size > 0:
            raw = dest.read_bytes()
            return extract_links_from_bytes(url, raw) if is_text else set()

        raw = fetch_url(url)
        if raw is None:
            with lock:
                failed.append(url)
            return set()

        new_links = extract_links_from_bytes(url, raw) if is_text else set()
        if is_text:
            raw = rewrite_offline_links(raw, rel_path)

        tmp_dest = dest.with_suffix(dest.suffix + ".tmp")
        tmp_dest.write_bytes(raw)
        tmp_dest.replace(dest)
        return new_links

    wave = 0
    while True:
        pending = sorted(discovered - processed)
        if not pending:
            break
        wave += 1
        print(f"[archive] Wave {wave}: processing {len(pending)} URLs (total discovered: {len(discovered)})")
        newly_found: set[str] = set()
        completed_in_wave = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            future_to_url = {pool.submit(process_one, u): u for u in pending}
            for fut in concurrent.futures.as_completed(future_to_url):
                u = future_to_url[fut]
                processed.add(u)
                completed_in_wave += 1
                try:
                    links = fut.result()
                    newly_found |= links
                except Exception as exc:
                    print(f"[archive] Error on {u}: {exc}", file=sys.stderr)
                if completed_in_wave % 100 == 0 or completed_in_wave == len(pending):
                    print(f"  [wave {wave}] {completed_in_wave}/{len(pending)} done")
        discovered |= newly_found

    # Build manifest-archive.json
    files_meta = []
    categories: dict[str, int] = {}
    total_bytes = 0

    for root, _, filenames in os.walk(ARCHIVE_DIR):
        for fname in sorted(filenames):
            if fname == "manifest-archive.json" or fname.endswith(".tmp"):
                continue
            fpath = Path(root) / fname
            rel = fpath.relative_to(ARCHIVE_DIR).as_posix()
            size = fpath.stat().st_size
            cat = categorize_file(rel)
            categories[cat] = categories.get(cat, 0) + 1
            total_bytes += size
            files_meta.append({"path": rel, "size": size, "category": cat})

    manifest = {
        "sourceUrl": BASE_URL,
        "crawledAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "totalFiles": len(files_meta),
        "totalBytes": total_bytes,
        "categories": categories,
        "failedUrls": failed,
        "files": files_meta,
    }

    manifest_path = ARCHIVE_DIR / "manifest-archive.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(
        f"[archive] Completed! Archived {manifest['totalFiles']} files "
        f"({total_bytes / (1024 * 1024):.2f} MiB) across {categories}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
