# build_public_doc_covers.py — 공공데이터 PDF(운전면허 문제은행 등) 표지 PNG 생성.
# build_gongu_epubs.py 의 표지 파이프라인과 동일 방식 (SVG → headless Chrome → 600x900 PNG).
# 책 파일 자체는 원문 PDF 그대로 쓰므로 EPUB 빌드는 없다. 출력: /tmp/public_docs/cover_<file>.png

import os
import subprocess
import tempfile

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
OUT_DIR = '/tmp/public_docs'

COVER_TPL = '''<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{{margin:0;padding:0}}</style></head><body>
<svg width="600" height="900" viewBox="0 0 600 900" xmlns="http://www.w3.org/2000/svg">
<rect width="600" height="900" fill="{bg}"/>
{motif}
<text x="300" y="100" text-anchor="middle" font-family="Apple SD Gothic Neo" font-size="17" letter-spacing="8" fill="{sub}">{series}</text>
<line x1="240" y1="125" x2="360" y2="125" stroke="{sub}" stroke-width="1"/>
<text x="300" y="400" text-anchor="middle" font-family="Apple SD Gothic Neo" font-weight="bold" font-size="{ts}" letter-spacing="2" fill="{fg}">{title1}</text>
<text x="300" y="470" text-anchor="middle" font-family="Apple SD Gothic Neo" font-weight="bold" font-size="{ts}" letter-spacing="2" fill="{fg}">{title2}</text>
<text x="300" y="540" text-anchor="middle" font-family="Apple SD Gothic Neo" font-size="22" letter-spacing="2" fill="{fg}" opacity="0.9">{subtitle}</text>
<text x="300" y="862" text-anchor="middle" font-family="Apple SD Gothic Neo" font-size="15" letter-spacing="4" fill="{sub}">북슐랭</text>
</svg></body></html>'''


def _traffic(c):  # 신호등 + 차선
    out = []
    # 신호등 본체
    out.append(f'<rect x="245" y="170" width="110" height="44" rx="22" fill="none" stroke="{c}" stroke-width="3" opacity="0.9"/>')
    for i, op in enumerate((0.95, 0.55, 0.3)):
        out.append(f'<circle cx="{267 + i*33}" cy="192" r="11" fill="{c}" opacity="{op}"/>')
    # 도로 중앙 점선 (하단)
    for y in range(620, 880, 52):
        out.append(f'<rect x="292" y="{y}" width="16" height="30" rx="3" fill="{c}" opacity="0.6"/>')
    # 좌우 차선
    out.append(f'<line x1="150" y1="600" x2="60" y2="900" stroke="{c}" stroke-width="4" opacity="0.5"/>')
    out.append(f'<line x1="450" y1="600" x2="540" y2="900" stroke="{c}" stroke-width="4" opacity="0.5"/>')
    return '\n'.join(out)


def _wheels(c):  # 이륜차 — 두 바퀴 + 지면
    out = []
    for cx in (210, 390):
        out.append(f'<circle cx="{cx}" cy="730" r="62" fill="none" stroke="{c}" stroke-width="4" opacity="0.8"/>')
        out.append(f'<circle cx="{cx}" cy="730" r="10" fill="{c}" opacity="0.8"/>')
        for k in range(6):
            import math
            a = k * math.pi / 3
            out.append(f'<line x1="{cx + 10*math.cos(a):.0f}" y1="{730 + 10*math.sin(a):.0f}" x2="{cx + 58*math.cos(a):.0f}" y2="{730 + 58*math.sin(a):.0f}" stroke="{c}" stroke-width="2" opacity="0.6"/>')
    # 차체 라인
    out.append(f'<path d="M 210 730 L 280 640 L 340 640 L 390 730" fill="none" stroke="{c}" stroke-width="4" opacity="0.7"/>')
    out.append(f'<line x1="270" y1="640" x2="255" y2="605" stroke="{c}" stroke-width="4" opacity="0.7"/>')
    out.append(f'<line x1="238" y1="605" x2="272" y2="605" stroke="{c}" stroke-width="4" opacity="0.7"/>')
    # 지면
    out.append(f'<line x1="60" y1="815" x2="540" y2="815" stroke="{c}" stroke-width="2" opacity="0.4"/>')
    return '\n'.join(out)


COVERS = [
    {
        'file': '운전면허_문제은행_보통대형특수',
        'series': '도로교통공단 공식 공개',
        'title1': '운전면허 필기',
        'title2': '문제은행 1000제',
        'subtitle': '1·2종 보통 | 1종 대형·특수',
        'ts': 56,
        'motif': _traffic,
        'palette': ('#1f2d3d', '#eef2f6', '#7f97ad', '#4aa3df'),  # bg, fg, sub, motif
    },
    {
        'file': '운전면허_문제은행_이륜원동기',
        'series': '도로교통공단 공식 공개',
        'title1': '운전면허 필기',
        'title2': '문제은행 800제',
        'subtitle': '2종 소형 | 원동기장치자전거',
        'ts': 56,
        'motif': _wheels,
        'palette': ('#2d2a22', '#f4efe2', '#a89e84', '#e0a838'),
    },
]


def build(c):
    bg, fg, sub, mc = c['palette']
    html = COVER_TPL.format(bg=bg, fg=fg, sub=sub, series=c['series'],
                            title1=c['title1'], title2=c['title2'],
                            subtitle=c['subtitle'], ts=c['ts'], motif=c['motif'](mc))
    os.makedirs(OUT_DIR, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8') as f:
        f.write(html)
        html_path = f.name
    png_path = os.path.join(OUT_DIR, f"cover_{c['file']}.png")
    subprocess.run([CHROME, '--headless', '--disable-gpu', f'--screenshot={png_path}',
                    '--window-size=600,900', '--hide-scrollbars', f'file://{html_path}'],
                   check=True, capture_output=True)
    os.unlink(html_path)
    print(f"{c['file']} → {png_path}")


if __name__ == '__main__':
    for c in COVERS:
        build(c)
