# build_sokdam_epub.py — 속담·관용구 모음집 EPUB + 표지 생성.
# 데이터: sokdam.json (속담은 전래=PD, 뜻풀이는 자체 작성 → 독점 콘텐츠).
# build_gongu_epubs.py 의 EPUB 2.0.1 구조·표지(headless Chrome) 방식을 따른다.
# 출력: /tmp/sokdam/epub_sokdam.epub, cover_sokdam.png

import os
import html as H
import uuid
import zipfile
import json
import subprocess
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = '/tmp/sokdam'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
DATA = os.path.join(SCRIPT_DIR, 'sokdam.json')
FILE = 'sokdam'

with open(DATA, encoding='utf-8') as f:
    BOOK = json.load(f)

XHTML = '''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko">
<head><title>{title}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>{body}</body></html>'''

CSS = '''body { line-height: 1.8; margin: 0 5%; word-break: keep-all; }
h1 { font-size: 1.6em; font-weight: normal; letter-spacing: 0.1em; text-align: center; margin: 2.5em 0 0.4em; }
h2 { font-size: 1.15em; letter-spacing: 0.12em; color: #b03a4e; border-bottom: 1px solid #eee; padding-bottom: 0.3em; margin: 2.2em 0 1em; }
.proverb { font-size: 1.08em; font-weight: bold; margin: 1.1em 0 0.2em; text-indent: 0; }
.meaning { color: #444; text-indent: 0; margin: 0 0 0.2em; }
.center { text-align: center; text-indent: 0; }
.muted { color: #888; font-size: 0.85em; text-indent: 0; }
.titlepage p { text-indent: 0; }
'''

CONTAINER = '''<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>'''

# 표지 — 한지 느낌 바탕에 붓 동그라미(낙관) 모티프
COVER_TPL = '''<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{{margin:0;padding:0}}</style></head><body>
<svg width="600" height="900" viewBox="0 0 600 900" xmlns="http://www.w3.org/2000/svg">
<rect width="600" height="900" fill="#f3ece0"/>
<circle cx="300" cy="250" r="92" fill="none" stroke="#b03a4e" stroke-width="10" opacity="0.85"/>
<circle cx="300" cy="250" r="92" fill="none" stroke="#b03a4e" stroke-width="3" opacity="0.4" transform="rotate(8 300 250)"/>
<text x="300" y="278" text-anchor="middle" font-family="AppleMyungjo" font-size="78" fill="#b03a4e">語</text>
<text x="300" y="110" text-anchor="middle" font-family="Apple SD Gothic Neo" font-size="17" letter-spacing="8" fill="#9a8a72">우리말 곁두리</text>
<line x1="240" y1="135" x2="360" y2="135" stroke="#c0b29a" stroke-width="1"/>
<text x="300" y="470" text-anchor="middle" font-family="AppleMyungjo" font-weight="bold" font-size="46" letter-spacing="4" fill="#2e2a24">곁에 두고 읽는</text>
<text x="300" y="540" text-anchor="middle" font-family="AppleMyungjo" font-weight="bold" font-size="60" letter-spacing="6" fill="#2e2a24">우리 속담</text>
<text x="300" y="600" text-anchor="middle" font-family="Apple SD Gothic Neo" font-size="21" letter-spacing="3" fill="#6a6052">자주 쓰는 속담·관용구 사전</text>
<text x="300" y="862" text-anchor="middle" font-family="Apple SD Gothic Neo" font-size="15" letter-spacing="4" fill="#9a8a72">북슐랭</text>
</svg></body></html>'''


def build_cover():
    os.makedirs(OUT_DIR, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8') as f:
        f.write(COVER_TPL)
        html_path = f.name
    png = os.path.join(OUT_DIR, f'cover_{FILE}.png')
    subprocess.run([CHROME, '--headless', '--disable-gpu', f'--screenshot={png}',
                    '--window-size=600,900', '--hide-scrollbars', f'file://{html_path}'],
                   check=True, capture_output=True)
    os.unlink(html_path)
    return png


def build_epub(cover_png):
    out = os.path.join(OUT_DIR, f'epub_{FILE}.epub')
    bid = str(uuid.uuid4())
    title = BOOK['title']

    cover_x = XHTML.format(title='표지', body=(
        '<div style="text-align:center;margin:0;padding:0;">'
        f'<img src="images/cover.png" alt="{H.escape(title)} 표지" style="max-width:100%;height:auto;"/></div>'))
    title_x = XHTML.format(title=H.escape(title), body=f'''<div class="titlepage center">
<p class="muted" style="margin-top:4em;letter-spacing:0.3em;">우리말 곁두리</p>
<h1>{H.escape(title)}</h1>
<p style="letter-spacing:0.2em;">{H.escape(BOOK['subtitle'])}</p>
<p class="muted" style="margin-top:3em;">북슐랭</p></div>''')
    intro_x = XHTML.format(title='여는 글', body=f'''<h1>여는 글</h1>
<p>{H.escape(BOOK['intro'])}</p>''')

    # 본문: 주제별 섹션
    sections = []
    for g in BOOK['groups']:
        rows = []
        for it in g['items']:
            rows.append(f'<p class="proverb">· {H.escape(it["proverb"])}</p>'
                        f'<p class="meaning">{H.escape(it["meaning"])}</p>')
        sections.append(f'<h2>{H.escape(g["theme"])}</h2>\n' + '\n'.join(rows))
    text_x = XHTML.format(title=H.escape(title),
                          body=f'<h1>{H.escape(title)}</h1>\n' + '\n'.join(sections))

    colo_x = XHTML.format(title='출처 및 안내', body='''<h2>출처 및 안내</h2>
<p class="muted">이 책에 실린 속담과 관용구는 오래도록 전해 내려온 우리말 유산(퍼블릭 도메인)이며,
뜻풀이는 북슐랭이 직접 정리해 담았습니다.</p>
<p class="muted">북슐랭 (Bookchelin) — 무제한 무료 독서 앱</p>''')

    pages = [('cover', cover_x), ('titlepage', title_x), ('intro', intro_x),
             ('text', text_x), ('colophon', colo_x)]

    manifest_items = '\n'.join(
        f'<item id="{pid}" href="{pid if pid!="titlepage" else "title"}.xhtml" media-type="application/xhtml+xml"/>'
        for pid, _ in pages)
    spine_items = ''
    for pid, _ in pages:
        extra = ' linear="no"' if pid == 'cover' else ''
        spine_items += f'<itemref idref="{pid}"{extra}/>'

    opf = f'''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
<dc:title>{H.escape(title)}</dc:title>
<dc:creator opf:role="aut">북슐랭</dc:creator>
<dc:language>ko</dc:language>
<dc:identifier id="bookid">urn:uuid:{bid}</dc:identifier>
<dc:publisher>북슐랭</dc:publisher>
<dc:rights>속담·관용구: 퍼블릭 도메인 / 뜻풀이: 북슐랭</dc:rights>
<meta name="cover" content="cover-image"/>
</metadata>
<manifest>
<item id="cover-image" href="images/cover.png" media-type="image/png"/>
<item id="css" href="style.css" media-type="text/css"/>
{manifest_items}
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
</manifest>
<spine toc="ncx">{spine_items}</spine>
<guide><reference type="cover" title="표지" href="cover.xhtml"/></guide>
</package>'''

    nav = [('표지', 'cover.xhtml'), ('여는 글', 'intro.xhtml'), (title, 'text.xhtml'),
           ('출처 및 안내', 'colophon.xhtml')]
    navpoints = ''.join(
        f'<navPoint id="np{i}" playOrder="{i}"><navLabel><text>{H.escape(label)}</text></navLabel>'
        f'<content src="{src}"/></navPoint>'
        for i, (label, src) in enumerate(nav, 1))
    ncx = f'''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="urn:uuid:{bid}"/><meta name="dtb:depth" content="1"/>
<meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>{H.escape(title)}</text></docTitle>
<navMap>{navpoints}</navMap>
</ncx>'''

    with zipfile.ZipFile(out, 'w') as z:
        z.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        z.writestr('META-INF/container.xml', CONTAINER, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/content.opf', opf, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/toc.ncx', ncx, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('OEBPS/style.css', CSS, compress_type=zipfile.ZIP_DEFLATED)
        for pid, content in pages:
            fname = 'title.xhtml' if pid == 'titlepage' else f'{pid}.xhtml'
            z.writestr(f'OEBPS/{fname}', content, compress_type=zipfile.ZIP_DEFLATED)
        z.write(cover_png, 'OEBPS/images/cover.png', compress_type=zipfile.ZIP_DEFLATED)
    return out


if __name__ == '__main__':
    n = sum(len(g['items']) for g in BOOK['groups'])
    png = build_cover()
    epub = build_epub(png)
    print(f'표지: {png}')
    print(f'EPUB: {epub} ({os.path.getsize(epub)//1024}KB, 속담 {n}개)')
