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


# ---------- 표지 (작품별 모티프 + 팔레트) ----------
# 책마다 주제에 맞는 모티프와 색을 주어 개성을 살린다. COVER_SPEC 에 없으면 팔레트 순환.
import random


def _rain(c):
    random.seed(1); out = []
    for _ in range(60):
        x, y = random.uniform(-50, 650), random.uniform(0, 900); l = random.uniform(20, 60)
        out.append(f'<line x1="{x:.0f}" y1="{y:.0f}" x2="{x+l*0.25:.0f}" y2="{y+l:.0f}" stroke="{c}" stroke-width="2" opacity="{random.uniform(0.15,0.5):.2f}"/>')
    return '\n'.join(out)


def _buckwheat(c):
    random.seed(7); out = ['<circle cx="300" cy="235" r="95" fill="#f5efdc" opacity="0.95"/>']
    for _ in range(160):
        x, y = random.uniform(0, 600), random.uniform(560, 900)
        out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{random.uniform(1.5,4):.1f}" fill="{c}" opacity="{random.uniform(0.4,0.95):.2f}"/>')
    return '\n'.join(out)


def _camellia(c):
    random.seed(3); out = []
    for cx, cy, n in [(110, 690, 7), (480, 170, 5), (500, 760, 6), (90, 200, 4)]:
        for _ in range(n):
            x, y = cx + random.uniform(-55, 55), cy + random.uniform(-55, 55)
            out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{random.uniform(7,16):.0f}" fill="{c}" opacity="{random.uniform(0.55,0.95):.2f}"/>')
    return '\n'.join(out)


def _wing(c):
    return (f'<path d="M 80 660 Q 300 480 540 620" stroke="{c}" stroke-width="5" fill="none" opacity="0.9"/>'
            f'<path d="M 110 710 Q 305 560 510 680" stroke="{c}" stroke-width="3.5" fill="none" opacity="0.6"/>'
            f'<path d="M 145 755 Q 310 635 480 735" stroke="{c}" stroke-width="2.5" fill="none" opacity="0.35"/>')


def _potato(c):
    random.seed(5); out = []
    for _ in range(9):
        x, y = random.uniform(80, 520), random.uniform(620, 840)
        rx = random.uniform(28, 55); ry = rx * random.uniform(0.6, 0.8); rot = random.uniform(-30, 30)
        out.append(f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="{rx:.0f}" ry="{ry:.0f}" fill="{c}" opacity="{random.uniform(0.25,0.6):.2f}" transform="rotate({rot:.0f} {x:.0f} {y:.0f})"/>')
    return '\n'.join(out)


def _crescent(c):  # 봉별기 — 이별의 밤, 초승달 + 별
    random.seed(11)
    out = [f'<path d="M 470 170 a 70 70 0 1 0 2 0 a 54 54 0 1 1 -2 0 Z" fill="{c}" opacity="0.9"/>']
    for _ in range(40):
        x, y = random.uniform(0, 600), random.uniform(0, 900)
        out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{random.uniform(0.8,2.2):.1f}" fill="{c}" opacity="{random.uniform(0.3,0.8):.2f}"/>')
    return '\n'.join(out)


def _letter(c):  # B사감과 러브레터 — 편지/봉투
    out = []
    for x, y, r in [(120, 690, -8), (430, 720, 10), (250, 770, -3)]:
        out.append(f'<g transform="rotate({r} {x+70} {y+45})" opacity="0.85">'
                   f'<rect x="{x}" y="{y}" width="140" height="90" rx="4" fill="none" stroke="{c}" stroke-width="2.5"/>'
                   f'<path d="M {x} {y} L {x+70} {y+50} L {x+140} {y}" fill="none" stroke="{c}" stroke-width="2.5"/></g>')
    return '\n'.join(out)


def _flame(c):  # 광염 소나타 — 광기의 불꽃
    return (f'<path d="M 300 820 C 230 720 290 690 280 600 C 350 670 330 730 360 700 '
            f'C 380 760 350 800 300 820 Z" fill="{c}" opacity="0.85"/>'
            f'<path d="M 300 815 C 270 760 300 730 296 680 C 330 720 318 760 332 745 '
            f'C 342 778 326 802 300 815 Z" fill="#f5e6c8" opacity="0.55"/>')


def _sprout(c):  # 봄봄 — 새싹/언덕
    random.seed(13); out = [f'<path d="M -20 840 Q 300 760 620 840 L 620 900 L -20 900 Z" fill="{c}" opacity="0.25"/>']
    for _ in range(11):
        x = random.uniform(60, 540); h = random.uniform(40, 90); y = random.uniform(800, 850)
        out.append(f'<path d="M {x:.0f} {y:.0f} q -16 -{h*0.5:.0f} 0 -{h:.0f} q 16 {h*0.5:.0f} 0 {h:.0f}" fill="{c}" opacity="0.7"/>'
                   f'<path d="M {x:.0f} {y-h*0.4:.0f} q 18 -10 26 -28 q -20 4 -26 28" fill="{c}" opacity="0.6"/>')
    return '\n'.join(out)


def _haze(c):  # 술 권하는 사회 — 취기의 안개, 동심원
    out = []
    for r in range(40, 260, 34):
        out.append(f'<circle cx="300" cy="240" r="{r}" fill="none" stroke="{c}" stroke-width="2" opacity="{max(0.08, 0.5-r/520):.2f}"/>')
    return '\n'.join(out)


def _stripes(c):  # 치숙 — 풍자/엇갈린 시선, 대각선
    out = []
    for i in range(-2, 14):
        x = i * 60
        out.append(f'<line x1="{x}" y1="900" x2="{x+260}" y2="0" stroke="{c}" stroke-width="14" opacity="0.10"/>')
    return '\n'.join(out)


def _books(c):  # 빈처 — 가난한 작가, 책 더미
    out = []
    base = 800
    for i, (w, h, dx) in enumerate([(46, 150, 150), (40, 120, 205), (52, 175, 255), (38, 110, 318), (44, 140, 365)]):
        out.append(f'<rect x="{dx}" y="{base-h}" width="{w}" height="{h}" fill="none" stroke="{c}" stroke-width="2.5" opacity="0.8"/>'
                   f'<line x1="{dx}" y1="{base-h+14}" x2="{dx+w}" y2="{base-h+14}" stroke="{c}" stroke-width="1.5" opacity="0.6"/>')
    return '\n'.join(out)


def _window(c):  # 경희 — 신여성, 창밖을 보다
    return (f'<rect x="210" y="150" width="180" height="240" fill="none" stroke="{c}" stroke-width="3" opacity="0.85"/>'
            f'<line x1="300" y1="150" x2="300" y2="390" stroke="{c}" stroke-width="2" opacity="0.7"/>'
            f'<line x1="210" y1="270" x2="390" y2="270" stroke="{c}" stroke-width="2" opacity="0.7"/>'
            f'<rect x="218" y="158" width="76" height="104" fill="{c}" opacity="0.12"/>'
            f'<rect x="306" y="278" width="76" height="104" fill="{c}" opacity="0.12"/>')


def _waterwheel(c):  # 물레방아 — 물레방아 + 물결
    out = [f'<circle cx="300" cy="250" r="120" fill="none" stroke="{c}" stroke-width="3" opacity="0.85"/>',
           f'<circle cx="300" cy="250" r="30" fill="none" stroke="{c}" stroke-width="3" opacity="0.85"/>']
    import math
    for k in range(8):
        a = k * math.pi / 4
        out.append(f'<line x1="{300+30*math.cos(a):.0f}" y1="{250+30*math.sin(a):.0f}" x2="{300+120*math.cos(a):.0f}" y2="{250+120*math.sin(a):.0f}" stroke="{c}" stroke-width="2.5" opacity="0.8"/>')
    for y in (780, 815, 850):
        out.append(f'<path d="M -20 {y} q 75 -22 150 0 t 150 0 t 150 0 t 150 0" fill="none" stroke="{c}" stroke-width="2.5" opacity="0.5"/>')
    return '\n'.join(out)


def _gold(c):  # 금 따는 콩밭 — 흙 속 금
    random.seed(17); out = [f'<path d="M -20 760 Q 300 720 620 760 L 620 900 L -20 900 Z" fill="#000" opacity="0.18"/>']
    for _ in range(26):
        x, y = random.uniform(40, 560), random.uniform(770, 880)
        s = random.uniform(4, 11)
        out.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{s:.0f}" height="{s*0.7:.0f}" rx="2" fill="{c}" opacity="{random.uniform(0.6,1):.2f}" transform="rotate({random.uniform(0,90):.0f} {x:.0f} {y:.0f})"/>')
    return '\n'.join(out)


def _harvest(c):  # 만무방 — 벼 이삭
    random.seed(19); out = []
    import math
    for _ in range(9):
        x = random.uniform(70, 530); base = random.uniform(820, 860); h = random.uniform(150, 230)
        out.append(f'<line x1="{x:.0f}" y1="{base:.0f}" x2="{x:.0f}" y2="{base-h:.0f}" stroke="{c}" stroke-width="2" opacity="0.6"/>')
        for j in range(6):
            yy = base - h + j * (h/7); off = 9 + j
            out.append(f'<path d="M {x:.0f} {yy:.0f} q {off} -6 {off+6} -16" fill="none" stroke="{c}" stroke-width="1.6" opacity="0.55"/>'
                       f'<path d="M {x:.0f} {yy:.0f} q -{off} -6 -{off+6} -16" fill="none" stroke="{c}" stroke-width="1.6" opacity="0.55"/>')
    return '\n'.join(out)


def _playful(c):  # 황소와 도깨비 (동화) — 밝은 도형/별
    random.seed(23); out = []
    import math
    for _ in range(22):
        x, y = random.uniform(40, 560), random.uniform(620, 870)
        k = random.random()
        if k < 0.4:
            out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{random.uniform(6,16):.0f}" fill="{c}" opacity="{random.uniform(0.5,0.9):.2f}"/>')
        elif k < 0.7:
            s = random.uniform(12, 26)
            out.append(f'<polygon points="{x:.0f},{y-s:.0f} {x+s*0.9:.0f},{y+s*0.6:.0f} {x-s*0.9:.0f},{y+s*0.6:.0f}" fill="{c}" opacity="{random.uniform(0.5,0.9):.2f}"/>')
        else:
            pts = []
            for i in range(10):
                a = math.pi/2 + i*math.pi/5; rr = (16 if i%2==0 else 7)
                pts.append(f'{x+rr*math.cos(a):.0f},{y-rr*math.sin(a):.0f}')
            out.append(f'<polygon points="{" ".join(pts)}" fill="{c}" opacity="{random.uniform(0.6,0.95):.2f}"/>')
    return '\n'.join(out)


def _sea(c):  # 배따라기 — 바다 물결 + 돛단배
    out = []
    # 수평선 위 작은 돛단배
    out.append(f'<path d="M 270 250 L 270 180 L 330 230 Z" fill="{c}" opacity="0.85"/>')
    out.append(f'<path d="M 250 252 q 50 18 100 0 l -12 22 q -38 12 -76 0 Z" fill="{c}" opacity="0.7"/>')
    # 겹겹의 물결
    for i, y in enumerate(range(300, 880, 36)):
        op = 0.18 + 0.45 * (i / 16)
        out.append(f'<path d="M -20 {y} q 75 -20 150 0 t 150 0 t 150 0 t 150 0" fill="none" stroke="{c}" stroke-width="2.5" opacity="{op:.2f}"/>')
    return '\n'.join(out)


def _railroad(c):  # 고향 — 소실점으로 뻗는 철길 + 들판 지평선
    out = [f'<line x1="-20" y1="300" x2="620" y2="300" stroke="{c}" stroke-width="1.5" opacity="0.4"/>']
    # 소실점(300,300)에서 하단으로 벌어지는 두 레일
    out.append(f'<line x1="300" y1="300" x2="180" y2="890" stroke="{c}" stroke-width="3" opacity="0.7"/>')
    out.append(f'<line x1="300" y1="300" x2="420" y2="890" stroke="{c}" stroke-width="3" opacity="0.7"/>')
    # 침목 — 아래로 갈수록 넓고 성기게
    for i in range(12):
        t = i / 11.0
        y = 320 + t * t * 560
        hw = 14 + t * 110
        out.append(f'<line x1="{300-hw:.0f}" y1="{y:.0f}" x2="{300+hw:.0f}" y2="{y:.0f}" stroke="{c}" stroke-width="{2+t*3:.0f}" opacity="{0.3+t*0.4:.2f}"/>')
    return '\n'.join(out)


def _peak(c):  # 산 — 산봉우리 실루엣 + 별
    out = []
    random.seed(31)
    for _ in range(18):
        x, y = random.uniform(40, 560), random.uniform(150, 300)
        out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{random.uniform(1.5,3):.1f}" fill="{c}" opacity="{random.uniform(0.4,0.9):.2f}"/>')
    # 겹친 산 능선
    out.append(f'<path d="M -20 760 L 140 560 L 280 700 L 430 500 L 620 720 L 620 900 L -20 900 Z" fill="{c}" opacity="0.45"/>')
    out.append(f'<path d="M -20 820 L 200 660 L 380 790 L 560 640 L 620 690 L 620 900 L -20 900 Z" fill="{c}" opacity="0.7"/>')
    return '\n'.join(out)


def _jar(c):  # 백치 아다다 — 깨진 질그릇 조각
    out = []
    random.seed(37)
    import math
    # 금이 간 항아리 윤곽
    out.append(f'<path d="M 240 600 q -40 -90 60 -130 q 100 40 60 130 q 0 70 -60 75 q -60 -5 -60 -75 Z" fill="none" stroke="{c}" stroke-width="3" opacity="0.8"/>')
    out.append(f'<path d="M 300 470 l 14 70 l -26 28 l 20 55" fill="none" stroke="{c}" stroke-width="2" opacity="0.7"/>')
    # 흩어진 깨진 조각
    for _ in range(14):
        x, y = random.uniform(120, 480), random.uniform(700, 860)
        s = random.uniform(10, 26)
        a = random.uniform(0, 360)
        out.append(f'<polygon points="{x:.0f},{y:.0f} {x+s:.0f},{y+s*0.3:.0f} {x+s*0.5:.0f},{y+s:.0f}" fill="{c}" opacity="{random.uniform(0.4,0.8):.2f}" transform="rotate({a:.0f} {x:.0f} {y:.0f})"/>')
    return '\n'.join(out)


def _sun(c):  # 땡볕 — 내리쬐는 태양 + 빛살
    out = []
    import math
    cx, cy = 300, 230
    for k in range(24):
        a = k * math.pi / 12
        r1, r2 = 70, 70 + (150 if k % 2 == 0 else 95)
        out.append(f'<line x1="{cx+r1*math.cos(a):.0f}" y1="{cy+r1*math.sin(a):.0f}" x2="{cx+r2*math.cos(a):.0f}" y2="{cy+r2*math.sin(a):.0f}" stroke="{c}" stroke-width="3" opacity="0.55"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="60" fill="{c}" opacity="0.9"/>')
    # 지면의 아지랑이
    for y in (800, 835, 868):
        out.append(f'<path d="M -20 {y} q 60 -14 120 0 t 120 0 t 120 0 t 120 0 t 120 0" fill="none" stroke="{c}" stroke-width="2" opacity="0.35"/>')
    return '\n'.join(out)


# file → (motif_fn, motif_color, (bg, fg, sub))
COVER_SPEC = {
    # 기존 5권 (라이브 유지 — 재업로드 안 함, 재현용)
    '운수_좋은_날': (_rain, '#8fa3b8', ('#2b3a4a', '#f2ede3', '#aebccb')),
    '메밀꽃_필_무렵': (_buckwheat, '#f5efdc', ('#1d2440', '#f5efdc', '#9aa3c7')),
    '동백꽃': (_camellia, '#e3b820', ('#f4eede', '#3c4a2e', '#7a8463')),
    '날개': (_wing, '#262421', ('#efedea', '#262421', '#8a857d')),
    '감자': (_potato, '#c8a374', ('#4a3526', '#efe3d0', '#b59f86')),
    # 신규 12권 — 작품별 모티프 + 다양한 컬러
    '봉별기': (_crescent, '#e8e2c8', ('#222a44', '#f0ece0', '#8a90b8')),
    'B사감과_러브레터': (_letter, '#c8966e', ('#f3ece0', '#5a3e3a', '#a98e74')),
    '광염_소나타': (_flame, '#d2622e', ('#2a1c1c', '#f3e0d2', '#b07a5a')),
    '봄봄': (_sprout, '#7faa4a', ('#eef2e2', '#3a4a2a', '#88996a')),
    '술_권하는_사회': (_haze, '#b8bcc4', ('#2e3540', '#e6e2d8', '#9aa0aa')),
    '치숙': (_stripes, '#c9a14a', ('#3a3630', '#f0e6d0', '#b0a080')),
    '빈처': (_books, '#c79a6a', ('#3e2f26', '#f0e2d2', '#b59a82')),
    '경희': (_window, '#e8d2dd', ('#403040', '#f3e8ee', '#bba0b4')),
    '물레방아': (_waterwheel, '#a9cfc8', ('#234044', '#e6f0ee', '#8fbab4')),
    '금_따는_콩밭': (_gold, '#e8c24a', ('#2e2820', '#f2e8d0', '#b8a060')),
    '만무방': (_harvest, '#cdb45a', ('#3a3320', '#f2ead2', '#bbab78')),
    '황소와_도깨비': (_playful, '#ffd24a', ('#2b6e8c', '#fff6e8', '#bfe2ef')),
    # 신규 5권 (2026-06-11)
    '배따라기': (_sea, '#6f95ad', ('#1c2e3e', '#e8eef2', '#7fa0b5')),
    '고향_현진건': (_railroad, '#b0a080', ('#3a3328', '#f0e8d8', '#a89878')),
    '산_이효석': (_peak, '#7fa888', ('#23362a', '#e8f0e2', '#8fb494')),
    '백치_아다다': (_jar, '#c0a0ae', ('#3e3036', '#f2e8ec', '#b39aa8')),
    '땡볕': (_sun, '#e0a838', ('#3a2a1a', '#f5e8d2', '#c89a5a')),
}

FALLBACK_PALETTE = ('#2e3142', '#ececf4', '#a6a8c0')

COVER_TPL = '''<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{{margin:0;padding:0}}</style></head><body>
<svg width="600" height="900" viewBox="0 0 600 900" xmlns="http://www.w3.org/2000/svg">
<rect width="600" height="900" fill="{bg}"/>
{motif}
<text x="300" y="100" text-anchor="middle" font-family="Apple SD Gothic Neo" font-size="17" letter-spacing="8" fill="{sub}">{series}</text>
<line x1="240" y1="125" x2="360" y2="125" stroke="{sub}" stroke-width="1"/>
<text x="300" y="430" text-anchor="middle" font-family="AppleMyungjo" font-weight="bold" font-size="{ts}" letter-spacing="3" fill="{fg}">{title}</text>
<text x="300" y="505" text-anchor="middle" font-family="Apple SD Gothic Neo" font-size="24" letter-spacing="10" fill="{fg}" opacity="0.92">{author}</text>
<text x="300" y="862" text-anchor="middle" font-family="Apple SD Gothic Neo" font-size="15" letter-spacing="4" fill="{sub}">북슐랭</text>
</svg></body></html>'''


def build_cover(book, idx):
    spec = COVER_SPEC.get(book['file'])
    if spec:
        motif_fn, mc, (bg, fg, sub) = spec
        motif = motif_fn(mc)
    else:
        bg, fg, sub = FALLBACK_PALETTE
        motif = ''
    series = '한국 동화선' if book.get('category') == '4' else '한국 단편소설 선'
    n = len(book['title'])
    ts = 64 if n <= 6 else (52 if n <= 9 else 42)
    html_path = os.path.join(OUT_DIR, f"cover_{book['file']}.html")
    png_path = os.path.join(OUT_DIR, f"cover_{book['file']}.png")
    with open(html_path, 'w') as f:
        f.write(COVER_TPL.format(bg=bg, fg=fg, sub=sub, series=series, ts=ts, motif=motif,
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
