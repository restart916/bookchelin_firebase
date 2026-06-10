# 공유마당/위키문헌 만료저작물 → EPUB + 표지 빌드 (2026-06)
#
# 사용법: python3 build_gongu_epubs.py
#   1) gongu_books.json 의 작품들을 위키문헌 API 에서 수집 (전부 PD-old 만료 확인)
#   2) /tmp/gongu_books 에 표지 PNG(600x900, headless Chrome 필요)와
#      EPUB 2.0.1(NCX 포함, 표지 내장) 생성
#   3) 업로드는 upload_gongu_books.js 로 별도 실행
#
# 책 메타데이터는 gongu_books.json 단일 소스. 신규 추가 시 그 파일에 항목만 추가하면
# 이 스크립트(표지·EPUB)와 upload_gongu_books.js(Storage·Firestore)가 함께 처리한다.
#
# 클라이언트 호환: Android=epublibDroid(EPUB2/NCX), iOS=WebView → EPUB 2.0.1 사용.

import json
import os
import subprocess
import urllib.parse
import urllib.request
import uuid
import zipfile
import html as H
from html.parser import HTMLParser

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BOOKS_JSON = os.path.join(SCRIPT_DIR, 'gongu_books.json')
OUT_DIR = '/tmp/gongu_books'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
USER_AGENT = 'BookchelinBot/1.0 (contact: yongsanglee@odkmedia.net)'

SOURCE_NOTE = (
    '이 책의 본문은 저작권 보호기간이 만료된 퍼블릭 도메인 저작물로, '
    '위키문헌(ko.wikisource.org)과 공유마당(한국저작권위원회)에 공개된 원문을 바탕으로 제작되었습니다.'
)

# 작가 사망 1962년 이전(구법 50년 만료분)만 추가할 것. 염상섭(1963 사망)은 2033년까지 보호.
with open(BOOKS_JSON, encoding='utf-8') as f:
    BOOKS = json.load(f)


class Extractor(HTMLParser):
    """위키문헌 parse HTML 에서 본문 <p>만 추출 (헤더/라이선스 박스 제외)."""

    def __init__(self):
        super().__init__()
        self.skip_depth = 0
        self.in_p = False
        self.cur = []
        self.paras = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get('class', '')
        if self.skip_depth or tag in ('style', 'script') or 'ws-noexport' in cls \
                or 'noprint' in cls or 'licenseBanner' in cls:
            self.skip_depth += 1
            return
        if tag == 'p':
            self.in_p = True
            self.cur = []
        if tag == 'br' and self.in_p:
            self.cur.append('\n')

    def handle_endtag(self, tag):
        if self.skip_depth:
            self.skip_depth -= 1
            return
        if tag == 'p' and self.in_p:
            self.in_p = False
            t = ''.join(self.cur).strip()
            if t:
                self.paras.append(t)

    def handle_data(self, d):
        if not self.skip_depth and self.in_p:
            self.cur.append(d)


def fetch_paras(book):
    url = ('https://ko.wikisource.org/w/api.php?action=parse&page='
           + urllib.parse.quote(book['page'])
           + '&prop=text|categories&format=json&formatversion=2&redirects=1')
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req) as r:
        d = json.load(r)
    cats = [c['category'] for c in d['parse'].get('categories', [])]
    assert any(c.startswith('PD-') for c in cats), f"{book['title']}: PD 분류 없음 — 수동 확인 필요: {cats}"
    ex = Extractor()
    ex.feed(d['parse']['text'])
    paras = ex.paras
    # 선행 문단이 제목/작가명만 반복되는 경우 제거 (위키문헌 페이지가 제목을 본문 머리에 넣는 경우)
    norm = lambda s: s.replace(' ', '').strip()
    drop = {norm(book['title']), norm(book['author'])}
    while paras and len(paras[0]) < 20 and norm(paras[0]) in drop:
        paras = paras[1:]
    return paras


# ---------- 표지 (시리즈 팔레트, JSON 순서대로 deterministic) ----------
# "한국 단편소설 선" 시리즈로 통일감을 주는 미니멀 표지. 책마다 팔레트만 순환한다.
PALETTES = [
    ('#2b3a4a', '#f2ede3', '#aebccb'),  # 짙은 청회색
    ('#1d2440', '#f5efdc', '#9aa3c7'),  # 남색
    ('#4a3526', '#efe3d0', '#b59f86'),  # 흙갈색
    ('#3c4a2e', '#f4eede', '#9aa888'),  # 올리브
    ('#42283a', '#f3e6ef', '#bb9bb0'),  # 자주
    ('#26414a', '#e8f1f2', '#9ec2c8'),  # 청록
    ('#4a2e2e', '#f3e3e0', '#c39a96'),  # 적갈
    ('#2e3142', '#ececf4', '#a6a8c0'),  # 진회보라
    ('#1f3a34', '#e6f2ee', '#92c0b3'),  # 진초록
    ('#473a1f', '#f4eddc', '#c2b07f'),  # 카키골드
]

COVER_TPL = '''<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{{margin:0;padding:0}}</style></head><body>
<svg width="600" height="900" viewBox="0 0 600 900" xmlns="http://www.w3.org/2000/svg">
<rect width="600" height="900" fill="{bg}"/>
<rect x="40" y="40" width="520" height="820" fill="none" stroke="{sub}" stroke-width="1.5" opacity="0.5"/>
<text x="300" y="120" text-anchor="middle" font-family="Apple SD Gothic Neo" font-size="17" letter-spacing="8" fill="{sub}">{series}</text>
<line x1="250" y1="150" x2="350" y2="150" stroke="{sub}" stroke-width="1"/>
<text x="300" y="430" text-anchor="middle" font-family="AppleMyungjo" font-weight="bold" font-size="{ts}" letter-spacing="3" fill="{fg}">{title}</text>
<line x1="270" y1="480" x2="330" y2="480" stroke="{fg}" stroke-width="1" opacity="0.6"/>
<text x="300" y="525" text-anchor="middle" font-family="Apple SD Gothic Neo" font-size="24" letter-spacing="10" fill="{fg}" opacity="0.9">{author}</text>
<text x="300" y="838" text-anchor="middle" font-family="Apple SD Gothic Neo" font-size="15" letter-spacing="4" fill="{sub}">북슐랭</text>
</svg></body></html>'''


def build_cover(book, idx):
    bg, fg, sub = PALETTES[idx % len(PALETTES)]
    series = '한국 동화선' if book.get('category') == '4' else '한국 단편소설 선'
    n = len(book['title'])
    ts = 64 if n <= 6 else (52 if n <= 9 else 42)
    html_path = os.path.join(OUT_DIR, f"cover_{book['file']}.html")
    png_path = os.path.join(OUT_DIR, f"cover_{book['file']}.png")
    with open(html_path, 'w') as f:
        f.write(COVER_TPL.format(bg=bg, fg=fg, sub=sub, series=series, ts=ts,
                                 title=H.escape(book['title']), author=H.escape(book['author'])))
    subprocess.run([CHROME, '--headless', '--disable-gpu', f'--screenshot={png_path}',
                    '--window-size=600,900', '--hide-scrollbars', f'file://{html_path}'],
                   check=True, capture_output=True)
    return png_path


# ---------- EPUB 2.0.1 ----------

XHTML = '''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko">
<head><title>{title}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>{body}</body></html>'''

CSS = '''body { line-height: 1.9; margin: 0 4%; word-break: keep-all; }
h1 { font-size: 1.6em; font-weight: normal; letter-spacing: 0.1em; text-align: center; margin: 3em 0 0.5em; }
h2 { font-size: 1.05em; letter-spacing: 0.2em; color: #555; margin: 2.5em 0 1em; }
p { text-indent: 1em; margin: 0 0 0.45em; }
.center { text-align: center; text-indent: 0; }
.muted { color: #888; font-size: 0.85em; text-indent: 0; }
.titlepage p { text-indent: 0; }
'''

CONTAINER = '''<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>'''


def build_epub(book, paras, cover_png):
    out = os.path.join(OUT_DIR, f"epub_{book['file']}.epub")
    bid = str(uuid.uuid4())
    body_ps = '\n'.join('<p>' + H.escape(p).replace('\n', '<br/>') + '</p>' for p in paras)

    cover_x = XHTML.format(title='표지', body=(
        '<div style="text-align:center;margin:0;padding:0;">'
        f'<img src="images/cover.png" alt="{H.escape(book["title"])} 표지" style="max-width:100%;height:auto;"/></div>'))
    title_x = XHTML.format(title=H.escape(book['title']), body=f'''<div class="titlepage" style="text-align:center;">
<p class="muted" style="margin-top:4em;letter-spacing:0.3em;">한국 단편소설 선</p>
<h1>{H.escape(book['title'])}</h1>
<p style="letter-spacing:0.25em;">{H.escape(book['author'])}</p>
<p class="muted" style="margin-top:3em;">{H.escape(book['pub'])}</p></div>''')
    intro_x = XHTML.format(title='작품 소개', body=f'''<h2>작품 소개</h2>
<p style="text-indent:0;">{H.escape(book['desc'])}</p>
<p class="muted" style="margin-top:2em;">{H.escape(book['author'])} ({book['life']})</p>''')
    text_x = XHTML.format(title=H.escape(book['title']),
                          body=f"<h1>{H.escape(book['title'])}</h1>\n{body_ps}")
    colo_x = XHTML.format(title='출처 및 저작권 안내', body=f'''<h2>출처 및 저작권 안내</h2>
<p class="muted">{H.escape(book['title'])} — {H.escape(book['author'])} ({book['life']})<br/>{H.escape(book['pub'])}</p>
<p class="muted">{H.escape(SOURCE_NOTE)}</p>
<p class="muted">북슐랭 (Bookchelin)</p>''')

    opf = f'''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
<dc:title>{H.escape(book['title'])}</dc:title>
<dc:creator opf:role="aut">{H.escape(book['author'])}</dc:creator>
<dc:language>ko</dc:language>
<dc:identifier id="bookid">urn:uuid:{bid}</dc:identifier>
<dc:publisher>북슐랭</dc:publisher>
<dc:rights>퍼블릭 도메인 (저작권 보호기간 만료)</dc:rights>
<meta name="cover" content="cover-image"/>
</metadata>
<manifest>
<item id="cover-image" href="images/cover.png" media-type="image/png"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
<item id="titlepage" href="title.xhtml" media-type="application/xhtml+xml"/>
<item id="intro" href="intro.xhtml" media-type="application/xhtml+xml"/>
<item id="text" href="text.xhtml" media-type="application/xhtml+xml"/>
<item id="colophon" href="colophon.xhtml" media-type="application/xhtml+xml"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
</manifest>
<spine toc="ncx">
<itemref idref="cover" linear="no"/>
<itemref idref="titlepage"/>
<itemref idref="intro"/>
<itemref idref="text"/>
<itemref idref="colophon"/>
</spine>
<guide><reference type="cover" title="표지" href="cover.xhtml"/></guide>
</package>'''

    navpoints = ''.join(
        f'<navPoint id="np{i}" playOrder="{i}"><navLabel><text>{H.escape(label)}</text></navLabel>'
        f'<content src="{src}"/></navPoint>'
        for i, (label, src) in enumerate(
            [('표지', 'cover.xhtml'), ('작품 소개', 'intro.xhtml'),
             (book['title'], 'text.xhtml'), ('출처 및 저작권 안내', 'colophon.xhtml')], 1))
    ncx = f'''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="urn:uuid:{bid}"/><meta name="dtb:depth" content="1"/>
<meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>{H.escape(book['title'])}</text></docTitle>
<navMap>{navpoints}</navMap>
</ncx>'''

    with zipfile.ZipFile(out, 'w') as z:
        z.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        z.writestr('META-INF/container.xml', CONTAINER, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/content.opf', opf, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/toc.ncx', ncx, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/style.css', CSS, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/cover.xhtml', cover_x, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/title.xhtml', title_x, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/intro.xhtml', intro_x, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/text.xhtml', text_x, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/colophon.xhtml', colo_x, compress_type=zipfile.ZIP_DEFLATED)
        z.write(cover_png, 'OEBPS/images/cover.png', compress_type=zipfile.ZIP_DEFLATED)
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for idx, book in enumerate(BOOKS):
        paras = fetch_paras(book)
        cover = build_cover(book, idx)
        epub = build_epub(book, paras, cover)
        print(f"{book['title']}: {len(paras)} paras → {epub} ({os.path.getsize(epub) // 1024}KB)")


if __name__ == '__main__':
    main()
