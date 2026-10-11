"""Validate built HTML links, same-page anchors, resources and CSS asset URLs."""
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / 'dist'


class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []
        self.ids = set()

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if 'id' in attrs:
            self.ids.add(attrs['id'])
        if tag in ('a', 'img', 'script', 'link', 'source'):
            self.references.extend(attrs[key] for key in ('href', 'src') if key in attrs)


def verify():
    if not ROOT.is_dir():
        raise SystemExit('Build the site before checking internal links')
    documents = {}
    references = []
    for file in ROOT.rglob('*.html'):
        document = Document()
        document.feed(file.read_text())
        documents[file] = document
        references.extend((file, reference) for reference in document.references)
    stylesheets = list(ROOT.rglob('*.css'))
    for file in stylesheets:
        # Vite has already resolved CSS imports. Check every emitted font/image URL,
        # not just the handful of font segments exercised by a browser fixture.
        for match in re.finditer(r'url\(\s*([\'"]?)(.*?)\1\s*\)', file.read_text()):
            references.append((file, match.group(2)))

    count = 0
    broken = []
    for file, reference in references:
        url = urlsplit(reference)
        if url.scheme or url.netloc or (not url.path and not url.fragment):
            continue
        count += 1
        if not url.path:
            target = file
        elif url.path.startswith('/'):
            target = ROOT / unquote(url.path).lstrip('/')
        else:
            target = file.parent / unquote(url.path)
        target = target.resolve()
        if target.is_dir():
            target /= 'index.html'
        reason = None
        if not target.exists():
            reason = 'missing file'
        elif url.fragment and target in documents and unquote(url.fragment) not in documents[target].ids:
            reason = 'missing anchor'
        if reason:
            broken.append({'page': str(file.relative_to(ROOT)), 'ref': reference, 'reason': reason})

    result = {'html': len(documents), 'css': len(stylesheets), 'references': count, 'broken': broken}
    output = PROJECT / 'artifacts/product-quality'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'internal-links.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False))
    return bool(broken)


if __name__ == '__main__':
    raise SystemExit(verify())
