# 공유마당/위키문헌 만료저작물 단편소설 → EPUB + 표지 빌드 (2026-06)
#
# 사용법: python3 build_gongu_epubs.py
#   1) 위키문헌 API 에서 원문 수집 (전부 PD-old 만료 저작물 확인됨)
#   2) /tmp/gongu_books 에 표지 PNG(600x900, headless Chrome 필요)와
#      EPUB 2.0.1(NCX 포함, 표지 내장) 생성
#   3) 업로드는 upload_gongu_books.js 로 별도 실행
#
# 클라이언트 호환: Android=epublibDroid(EPUB2/NCX), iOS=WebView 기반 → EPUB 2.0.1 사용.

import json
import os
import random
import subprocess
import urllib.parse
import urllib.request
import uuid
import zipfile
import html as H
from html.parser import HTMLParser

OUT_DIR = '/tmp/gongu_books'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
USER_AGENT = 'BookchelinBot/1.0 (contact: yongsanglee@odkmedia.net)'

SOURCE_NOTE = (
    '이 책의 본문은 저작권 보호기간이 만료된 퍼블릭 도메인 저작물로, '
    '위키문헌(ko.wikisource.org)과 공유마당(한국저작권위원회)에 공개된 원문을 바탕으로 제작되었습니다.'
)

# 주의: 작가 사망 1962년 이전(구법 50년 만료분)만 추가할 것. 염상섭(1963 사망)은 2033년까지 보호.
BOOKS = [
    dict(file='운수_좋은_날', page='운수 좋은 날', title='운수 좋은 날', author='현진건', life='1900–1943',
         pub='1924년 《개벽》 발표',
         desc='인력거꾼 김 첨지의 하루를 통해 일제강점기 도시 하층민의 비극을 그린 현진건의 대표 단편. '
              '모처럼 손님이 끊이지 않는 "운수 좋은" 날, 아픈 아내를 위해 설렁탕을 사 들고 돌아온 그를 기다리는 것은….'),
    dict(file='메밀꽃_필_무렵', page='메밀꽃 필 무렵', title='메밀꽃 필 무렵', author='이효석', life='1907–1942',
         pub='1936년 《조광》 발표',
         desc='달빛 아래 소금을 뿌린 듯 흐드러진 메밀꽃밭을 배경으로, '
              '장돌뱅이 허 생원의 평생 잊지 못할 하룻밤 인연을 그린 한국 서정 단편의 백미.'),
    dict(file='동백꽃', page='동백꽃', title='동백꽃', author='김유정', life='1908–1937',
         pub='1936년 《조광》 발표',
         desc="닭싸움을 빌미로 시비를 걸어오는 점순이와 눈치 없는 '나'의 풋풋한 사랑을 해학적으로 그린 김유정의 대표작. "
              '알싸한 노란 동백꽃(생강나무 꽃) 향기 속에 묻히는 결말이 백미.'),
    dict(file='날개', page='날개', title='날개', author='이상', life='1910–1937',
         pub='1936년 《조광》 발표',
         desc='"박제가 되어 버린 천재를 아시오?" — 식민지 지식인의 무력한 자의식을 실험적 문체로 그려낸 '
              '한국 모더니즘 문학의 정점.'),
    dict(file='감자', page='감자', title='감자', author='김동인', life='1900–1951',
         pub='1925년 《조선문단》 발표',
         desc='가난 때문에 칠성문 밖 빈민굴로 흘러든 복녀가 도덕적으로 몰락해 가는 과정을 차갑게 응시한 '
              '김동인의 자연주의 대표 단편.'),
]


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
    # 첫 문단이 작가명만 있는 경우 제거
    if paras and len(paras[0]) < 12 and book['author'].replace(' ', '') in paras[0].replace(' ', ''):
        paras = paras[1:]
    return paras


# ---------- 표지 (SVG → headless Chrome → PNG 600x900) ----------

def motif_rain(c):
    random.seed(1)
    out = []
    for _ in range(60):
        x, y = random.uniform(-50, 650), random.uniform(0, 900)
        l = random.uniform(20, 60)
        out.append(f'<line x1="{x:.0f}" y1="{y:.0f}" x2="{x + l * 0.25:.0f}" y2="{y + l:.0f}" '
                   f'stroke="{c}" stroke-width="2" opacity="{random.uniform(0.15, 0.5):.2f}"/>')
    return '\n'.join(out)


def motif_buckwheat(c):
    random.seed(7)
    out = ['<circle cx="300" cy="235" r="95" fill="#f5efdc" opacity="0.95"/>']
    for _ in range(160):
        x, y = random.uniform(0, 600), random.uniform(560, 900)
        out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{random.uniform(1.5, 4):.1f}" '
                   f'fill="{c}" opacity="{random.uniform(0.4, 0.95):.2f}"/>')
    return '\n'.join(out)


def motif_camellia(c):
    random.seed(3)
    out = []
    for cx, cy, n in [(110, 690, 7), (480, 170, 5), (500, 760, 6), (90, 200, 4)]:
        for _ in range(n):
            x, y = cx + random.uniform(-55, 55), cy + random.uniform(-55, 55)
            out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{random.uniform(7, 16):.0f}" '
                       f'fill="{c}" opacity="{random.uniform(0.55, 0.95):.2f}"/>')
    return '\n'.join(out)


def motif_wing(c):
    return (f'<path d="M 80 660 Q 300 480 540 620" stroke="{c}" stroke-width="5" fill="none" opacity="0.9"/>'
            f'<path d="M 110 710 Q 305 560 510 680" stroke="{c}" stroke-width="3.5" fill="none" opacity="0.6"/>'
            f'<path d="M 145 755 Q 310 635 480 735" stroke="{c}" stroke-width="2.5" fill="none" opacity="0.35"/>')


def motif_potato(c):
    random.seed(5)
    out = []
    for _ in range(9):
        x, y = random.uniform(80, 520), random.uniform(620, 840)
        rx = random.uniform(28, 55)
        ry = rx * random.uniform(0.6, 0.8)
        rot = random.uniform(-30, 30)
        out.append(f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="{rx:.0f}" ry="{ry:.0f}" fill="{c}" '
                   f'opacity="{random.uniform(0.25, 0.6):.2f}" transform="rotate({rot:.0f} {x:.0f} {y:.0f})"/>')
    return '\n'.join(out)


COVER_STYLES = {
    '운수_좋은_날': dict(bg='#2b3a4a', fg='#f2ede3', sub='#aebccb', motif=lambda: motif_rain('#8fa3b8')),
    '메밀꽃_필_무렵': dict(bg='#1d2440', fg='#f5efdc', sub='#9aa3c7', motif=lambda: motif_buckwheat('#f5efdc')),
    '동백꽃': dict(bg='#f4eede', fg='#3c4a2e', sub='#7a8463', motif=lambda: motif_camellia('#e3b820')),
    '날개': dict(bg='#efedea', fg='#262421', sub='#8a857d', motif=lambda: motif_wing('#262421')),
    '감자': dict(bg='#4a3526', fg='#efe3d0', sub='#b59f86', motif=lambda: motif_potato('#c8a374')),
}

COVER_TPL = '''<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{{margin:0;padding:0}}</style></head><body>
<svg width="600" height="900" viewBox="0 0 600 900" xmlns="http://www.w3.org/2000/svg">
<rect width="600" height="900" fill="{bg}"/>
{motif}
<text x="300" y="100" text-anchor="middle" font-family="Apple SD Gothic Neo" font-size="17" letter-spacing="8" fill="{sub}">한국 단편소설 선</text>
<line x1="240" y1="125" x2="360" y2="125" stroke="{sub}" stroke-width="1"/>
<text x="300" y="425" text-anchor="middle" font-family="AppleMyungjo" font-weight="bold" font-size="{ts}" letter-spacing="4" fill="{fg}">{title}</text>
<text x="300" y="505" text-anchor="middle" font-family="Apple SD Gothic Neo" font-size="26" letter-spacing="12" fill="{fg}" opacity="0.92">{author}</text>
<text x="300" y="862" text-anchor="middle" font-family="Apple SD Gothic Neo" font-size="15" letter-spacing="4" fill="{sub}">북슐랭</text>
</svg></body></html>'''


def build_cover(book):
    s = COVER_STYLES[book['file']]
    ts = 64 if len(book['title']) <= 7 else 52
    html_path = os.path.join(OUT_DIR, f"cover_{book['file']}.html")
    png_path = os.path.join(OUT_DIR, f"cover_{book['file']}.png")
    with open(html_path, 'w') as f:
        f.write(COVER_TPL.format(bg=s['bg'], fg=s['fg'], sub=s['sub'], motif=s['motif'](),
                                 ts=ts, title=book['title'], author=book['author']))
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
    for book in BOOKS:
        paras = fetch_paras(book)
        cover = build_cover(book)
        epub = build_epub(book, paras, cover)
        print(f"{book['title']}: {len(paras)} paras → {epub} ({os.path.getsize(epub) // 1024}KB)")


if __name__ == '__main__':
    main()
