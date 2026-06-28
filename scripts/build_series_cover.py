#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
북슐랭 자체제작 교양 시리즈 통일 표지 생성기  (2026-06 확정)

두 시리즈, 두 고정 포맷 — 신규 책을 추가할 때도 이 스크립트로 만들면 표지가 통일된다.

  ┌─────────────────────────────────────────────────────────────────────┐
  │ "잠들기 전 …" 시리즈  →  format = "jamdeulgi"                          │
  │   · 풀블리드 사진 + 상단 2단 제목(제목이 위)                            │
  │   · 제목 폰트: Pretendard Bold (앱 브랜드체, 산세리프)                  │
  │   · 제목 아래 짧은 골드 밑줄 → 그 아래 한 줄 부제                        │
  │   · 하단 중앙 "북슐랭" 워드마크                                          │
  │   · ⚠️ 상단 "북슐랭 교양 시리즈" 배지는 넣지 않는다 (2026-06 제거 결정) │
  ├─────────────────────────────────────────────────────────────────────┤
  │ "일상의 …" 시리즈     →  format = "ilsang"  (= 기존 make_covers VariantA)│
  │   · 풀블리드 사진 + 하단 2단 제목(제목이 아래) + 하단 그라데이션         │
  │   · 제목 폰트: KoPubWorld Batang (명조/세리프) — 심리학·경제·몸과 동일   │
  │   · 상단 가는 구분선 + "BOOKCHELIN" 워드마크                             │
  └─────────────────────────────────────────────────────────────────────┘

출력: 1000×1500 JPEG q83 (모든 시리즈 표지 공통 규격, 2:3)

사진 소스 규칙: 반드시 저작권 안전한 CC0 / 퍼블릭도메인만 사용.
  · 일반: Openverse API (license=cc0,pdm)  https://api.openverse.org/v1/images/
  · 우주(성운): NASA/ESA Hubble 등 퍼블릭도메인도 가능
  소스 사진은 scripts/series_photos/<topic>.jpg 에 두고 BOOKS 에 등록한다.

업로드(별도): Storage cover/북슐랭_<파일키>_photo.jpg (cacheControl 30일) →
  books/<id>.image_url 교체.  (scripts 의 admin SDK 키 사용)

신규 책 추가 절차:
  1) CC0/PD 사진을 series_photos/<topic>.jpg 로 저장
  2) 아래 BOOKS 에 {topic, series, subtitle, anchor, tint} 항목 추가
  3) python3 build_series_cover.py  → out/<topic>.jpg 확인
  4) Storage 업로드 + books.image_url 교체
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

# ── 경로 (실행 시 인자나 환경변수로 덮어쓸 수 있음) ──────────────────────────
PHOTO_DIR = os.environ.get("SERIES_PHOTO_DIR", os.path.join(os.path.dirname(__file__), "series_photos"))
OUT_DIR   = os.environ.get("SERIES_OUT_DIR",   os.path.join(os.path.dirname(__file__), "series_out"))

# ── 폰트 ─────────────────────────────────────────────────────────────────────
PRET_BOLD = "/Users/yongsanglee/Code/bookchelin_flutter/assets/fonts/Pretendard/Pretendard-Bold.otf"
PRET_REG  = "/Users/yongsanglee/Code/bookchelin_flutter/assets/fonts/Pretendard/Pretendard-Regular.otf"
KOPUB     = "/Users/yongsanglee/Code/bookchelin_firebase/vue-project/src/assets/fonts/KoPubWorld Batang_Pro Light.otf"
APPLESD   = "/System/Library/Fonts/AppleSDGothicNeo.ttc"

# ── 캔버스 ───────────────────────────────────────────────────────────────────
W, H         = 1400, 2100      # 렌더 해상도
OUT_W, OUT_H = 1000, 1500      # 출력 규격 (2:3)
JPEG_QUALITY = 83
MARGIN       = 88

WHITE    = (245, 246, 252)
OFFWHITE = (236, 238, 246)
SUBC     = (200, 207, 226)
GOLD     = (210, 192, 150)
MUTED    = (150, 147, 138)
WMARK_C  = (170, 165, 152)

# ── 시리즈별 색조 ────────────────────────────────────────────────────────────
NAVY     = (8, 14, 28)
CHARCOAL = (20, 20, 32)


def font(path, size, index=0):
    return ImageFont.truetype(path, size, index=index)


def fill_crop(src, tw, th, anchor="center"):
    img = Image.open(src).convert("RGB")
    sw, sh = img.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    img = img.resize((nw, nh), Image.LANCZOS)
    ox = (nw - tw) // 2
    oy = {"top": 0, "center": (nh - th) // 2, "bottom": nh - th}[anchor]
    return img.crop((ox, oy, ox + tw, oy + th))


def color_grade(img, tint, strength=0.20):
    return Image.blend(img, Image.new("RGB", img.size, tint), strength)


def vgrad(size, color, a0, a1, y0_frac, y1_frac=1.0, invert=False):
    """세로 그라데이션 RGBA. invert=True면 위가 진하고 아래로 사라진다(상단 제목용)."""
    w, h = size
    arr = np.zeros((h, w, 4), np.uint8)
    arr[:, :, :3] = color
    ramp = np.zeros(h, float)
    y0, y1 = int(h * y0_frac), int(h * y1_frac)
    if invert:
        seg = np.linspace(a1, a0, max(1, y1 - y0))
        ramp[y0:y1] = seg
        ramp[:y0] = a1
    else:
        ramp[y0:y1] = np.linspace(a0, a1, max(1, y1 - y0))
        ramp[y1:] = a1
    arr[:, :, 3] = ramp.clip(0, 255).astype(np.uint8)[:, None]
    return Image.fromarray(arr, "RGBA")


def vignette(size, strength=0.30):
    w, h = size
    xs = np.linspace(0, 1, w) - 0.5
    ys = np.linspace(0, 1, h) - 0.5
    xx, yy = np.meshgrid(xs, ys)
    dist = np.sqrt(xx**2 + yy**2) * 2
    a = (np.clip(dist - 0.4, 0, 1) * 1.6 * strength * 255).clip(0, 255).astype(np.uint8)
    arr = np.zeros((h, w, 4), np.uint8)
    arr[:, :, 3] = a
    return Image.fromarray(arr, "RGBA")


def cw_(f, ch):
    bb = f.getbbox(ch)
    return bb[2] - bb[0]


def strw(f, t, ls):
    return sum(cw_(f, c) + ls for c in t) - ls if t else 0


def draw_str(d, t, f, cx, y, fill, ls=6):
    x = cx - strw(f, t, ls) // 2
    for ch in t:
        d.text((x, y), ch, font=f, fill=fill)
        x += cw_(f, ch) + ls


def hline(d, x1, x2, y, color, alpha, width=1):
    d.line([(x1, y), (x2, y)], fill=(*color, alpha), width=width)


# ── 포맷 1: 잠들기 전 … (상단 제목, Pretendard, 배지 없음) ───────────────────
def cover_jamdeulgi(photo, prefix, topic, subtitle, outfile, anchor="center", tint=NAVY):
    base = fill_crop(photo, W, H, anchor)
    base = color_grade(base, tint, 0.22)
    base = ImageEnhance.Contrast(base).enhance(1.10)
    cv = base.convert("RGBA")
    cv = Image.alpha_composite(cv, vignette((W, H), 0.30))
    # 상단 가독성 그라데이션(위가 진함 → 50% 지점에서 사라짐)
    cv = Image.alpha_composite(cv, vgrad((W, H), tint, a0=0, a1=175, y0_frac=0.0, y1_frac=0.52, invert=True))
    d = ImageDraw.Draw(cv, "RGBA")
    cx = W // 2

    f_pre = font(PRET_BOLD, 92)
    f_top = font(PRET_BOLD, 212)
    f_sub = font(PRET_REG, 46)
    f_brand = font(PRET_REG, 44)

    y_pre = int(H * 0.085)
    draw_str(d, prefix, f_pre, cx, y_pre, OFFWHITE, ls=14)
    y_top = y_pre + 118
    draw_str(d, topic, f_top, cx, y_top, WHITE, ls=6)

    # 골드 밑줄
    ul_y = y_top + 252
    hline(d, cx - 92, cx - 0, ul_y, GOLD, 230, width=6)
    hline(d, cx + 0, cx + 92, ul_y, GOLD, 230, width=6)

    draw_str(d, subtitle, f_sub, cx, ul_y + 36, SUBC, ls=3)

    # 하단 워드마크
    draw_str(d, "북슐랭", f_brand, cx, int(H * 0.94), (224, 210, 170), ls=10)

    out = cv.convert("RGB").resize((OUT_W, OUT_H), Image.LANCZOS)
    out.save(outfile, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    print(f"  ✓ [잠들기] {os.path.basename(outfile)}  {os.path.getsize(outfile)//1024} KB")


# ── 포맷 2: 일상의 … (하단 제목, KoPub 명조 = 기존 make_covers VariantA) ─────
def cover_ilsang(photo, prefix, topic, subtitle, outfile, anchor="center", tint=CHARCOAL):
    base = fill_crop(photo, W, H, anchor)
    base = color_grade(base, tint, 0.22)
    base = ImageEnhance.Contrast(base).enhance(1.13)
    cv = base.convert("RGBA")
    cv = Image.alpha_composite(cv, vignette((W, H), 0.30))
    cv = Image.alpha_composite(cv, vgrad((W, H), tint, a0=0, a1=225, y0_frac=0.32))
    d = ImageDraw.Draw(cv, "RGBA")
    cx = W // 2

    # 상단 워드마크
    hline(d, MARGIN, W - MARGIN, 60, WHITE, 50)
    draw_str(d, "B O O K C H E L I N", font(APPLESD, 20, index=10), cx, 70, WMARK_C, ls=2)
    hline(d, MARGIN, W - MARGIN, 102, WHITE, 50)

    f1 = font(KOPUB, 90)
    f2 = font(KOPUB, 132)
    fsub = font(APPLESD, 36, index=8)
    t1h = f1.getbbox("가")[3] - f1.getbbox("가")[1]
    t2h = f2.getbbox("가")[3] - f2.getbbox("가")[1]
    subh = fsub.getbbox("가")[3] - fsub.getbbox("가")[1]
    sub_y = H - 80 - subh
    t2_y = sub_y - 58 - t2h
    t1_y = t2_y - 22 - t1h
    hline(d, MARGIN, W - MARGIN, t1_y - 26, WHITE, 60)

    if prefix:
        draw_str(d, prefix, f1, cx, t1_y, OFFWHITE, ls=10)
    draw_str(d, topic, f2, cx, t2_y, WHITE, ls=14)
    draw_str(d, subtitle, fsub, cx, sub_y, MUTED, ls=2)

    out = cv.convert("RGB").resize((OUT_W, OUT_H), Image.LANCZOS)
    out.save(outfile, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    print(f"  ✓ [일상의] {os.path.basename(outfile)}  {os.path.getsize(outfile)//1024} KB")


FORMATS = {"jamdeulgi": cover_jamdeulgi, "ilsang": cover_ilsang}

# ── 책 등록표 (신규 추가 시 여기에 한 줄) ────────────────────────────────────
#   topic     = 표지에 크게 들어갈 단어 / 사진 파일명(series_photos/<topic>.jpg) / 출력명
#   series    = "잠들기 전" | "일상의"  (제목 1행)
#   fmt       = "jamdeulgi" | "ilsang"
BOOKS = [
    {"topic": "우주", "series": "잠들기 전", "fmt": "jamdeulgi",
     "subtitle": "밤하늘 너머, 우주를 거니는 열 밤", "anchor": "center", "tint": (10, 12, 30)},
    {"topic": "심해", "series": "잠들기 전", "fmt": "jamdeulgi",
     "subtitle": "수심을 따라 내려가는 열 편의 이야기", "anchor": "center", "tint": (8, 16, 34)},
    {"topic": "극지", "series": "잠들기 전", "fmt": "jamdeulgi",
     "subtitle": "극야와 오로라, 얼음의 시간", "anchor": "top", "tint": (10, 18, 34)},
    {"topic": "숲", "series": "잠들기 전", "fmt": "jamdeulgi",
     "subtitle": "해 진 뒤, 숲을 천천히 걷는 밤", "anchor": "center", "tint": (8, 22, 16)},
    {"topic": "과학", "series": "일상의", "fmt": "ilsang",
     "subtitle": "매일 마주치는 현상 속 과학 이야기", "anchor": "center", "tint": CHARCOAL},
]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for b in BOOKS:
        photo = os.path.join(PHOTO_DIR, b["topic"] + ".jpg")
        if not os.path.exists(photo):
            print(f"  ! 사진 없음, 건너뜀: {photo}")
            continue
        out = os.path.join(OUT_DIR, b["topic"] + ".jpg")
        FORMATS[b["fmt"]](photo, b["series"], b["topic"], b["subtitle"], out, b["anchor"], b["tint"])


if __name__ == "__main__":
    main()
