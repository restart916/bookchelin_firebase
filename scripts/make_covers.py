#!/usr/bin/env python3
"""
북슐랭 신간 표지 리디자인 — 4종 후보
심해_A / 심해_B / 심리학_A / 심리학_B

CC0/PD 사진 출처:
  ch01_1.jpg  : Openverse CC0 — underwater upward light shot
  ch07_1.jpg  : NOAA Ocean Exploration public domain — hydrothermal vent
  img10_1.jpg : Openverse CC-BY — sunrise tea plantation aerial (Supanut Arunoprayote)
  img07_1.jpg : Openverse CC0 — rain drops on window
"""

import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter

# ── 경로 ────────────────────────────────────────────────────────────────────
SIMHAE = "/tmp/bchelin_build/simhae/images"
SIMNI  = "/tmp/bchelin_build/simni/images"
OUT    = os.path.expanduser("~/Desktop/북슐랭_신간검토/표지후보")
os.makedirs(OUT, exist_ok=True)

KOPUB   = "/Users/yongsanglee/Code/bookchelin_firebase/vue-project/src/assets/fonts/KoPubWorld Batang_Pro Light.otf"
APPLESD = "/System/Library/Fonts/AppleSDGothicNeo.ttc"

# ── 캔버스 ───────────────────────────────────────────────────────────────────
# 렌더링: 1400×2100 고해상도 (폰트·그라데이션 품질 유지)
# 출력:   1000×1500 JPEG q83 → 약 90~160 KB (원본 PNG 대비 10~20x 절약)
# Storage 업로드 시 반드시 cacheControl='public, max-age=2592000' 설정.
W, H         = 1400, 2100
OUT_W, OUT_H = 1000, 1500
JPEG_QUALITY = 83
MARGIN       = 88        # 좌우 안전 여백

# ── 팔레트 ───────────────────────────────────────────────────────────────────
NAVY     = (8,  14, 28)     # 심해 딥네이비
CHARCOAL = (20, 20, 32)     # 심리학 차콜블루
WHITE    = (255, 255, 255)
OFFWHITE = (240, 237, 230)
MUTED    = (145, 142, 132)
WMARK_C  = (165, 160, 150)

# ── 폰트 ─────────────────────────────────────────────────────────────────────
def load_font(path, size, index=0):
    return ImageFont.truetype(path, size, index=index)

# ── 레이아웃 유틸 ─────────────────────────────────────────────────────────────

def fill_crop(src_path, tw, th, anchor='center'):
    """scale-to-fill + crop."""
    img = Image.open(src_path).convert('RGB')
    sw, sh = img.size
    scale  = max(tw / sw, th / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    img    = img.resize((nw, nh), Image.LANCZOS)
    ox = (nw - tw) // 2
    oy = {'top': 0, 'center': (nh - th) // 2, 'bottom': nh - th}[anchor]
    return img.crop((ox, oy, ox + tw, oy + th))

def gradient(size, color, a0=0, a1=220, y0_frac=0.35):
    """세로 그라데이션 RGBA 레이어."""
    w, h  = size
    arr   = np.zeros((h, w, 4), np.uint8)
    arr[:, :, :3] = color
    y0    = int(h * y0_frac)
    ramp  = np.zeros(h, np.uint8)
    ramp[y0:] = np.linspace(a0, a1, h - y0, dtype=float).clip(0, 255).astype(np.uint8)
    arr[:, :, 3] = ramp[:, np.newaxis]
    return Image.fromarray(arr, 'RGBA')

def color_grade(img_rgb, tint, strength=0.20):
    tint_img = Image.new('RGB', img_rgb.size, tint)
    return Image.blend(img_rgb, tint_img, strength)

def vignette(size, strength=0.35):
    """가장자리 어둡게 하는 빈네트 레이어."""
    w, h = size
    arr  = np.zeros((h, w, 4), np.uint8)
    cx, cy = w / 2, h / 2
    xs = np.linspace(0, 1, w) - 0.5
    ys = np.linspace(0, 1, h) - 0.5
    xx, yy = np.meshgrid(xs, ys)
    dist = np.sqrt(xx**2 + yy**2) * 2  # 0 center → 1+ edge
    alpha = (np.clip(dist - 0.4, 0, 1) * 1.6 * strength * 255).clip(0, 255).astype(np.uint8)
    arr[:, :, 3] = alpha
    return Image.fromarray(arr, 'RGBA')

def composite(base_rgba, overlay_rgba):
    return Image.alpha_composite(base_rgba, overlay_rgba)

def hline_layer(size, x1, x2, y, color, alpha, width=1):
    lyr = Image.new('RGBA', size, (0,0,0,0))
    d = ImageDraw.Draw(lyr)
    d.line([(x1, y), (x2, y)], fill=(*color, alpha), width=width)
    return lyr

def char_w(font, ch):
    try:
        bb = font.getbbox(ch)
        return bb[2] - bb[0]
    except Exception:
        return font.size

def str_w(font, text, ls):
    if not text:
        return 0
    return sum(char_w(font, c) + ls for c in text) - ls

def draw_str(draw, text, font, cx, y, fill, ls=6):
    """letter-spacing 적용, cx 기준 수평 중앙."""
    tw = str_w(font, text, ls)
    x  = cx - tw // 2
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += char_w(font, ch) + ls

# ── Variant A — 풀블리드 + 하단 그라데이션 ───────────────────────────────────

def variant_A(photo_path, outfile, title1, title2, subtitle, band_color,
               photo_anchor='center', grade_str=0.22):
    # 1. 사진 준비
    photo = fill_crop(photo_path, W, H, anchor=photo_anchor)
    photo = color_grade(photo, band_color, strength=grade_str)
    photo = ImageEnhance.Contrast(photo).enhance(1.13)

    canvas = photo.convert('RGBA')

    # 2. 빈네트
    vig = vignette((W, H), strength=0.30)
    canvas = composite(canvas, vig)

    # 3. 하단 그라데이션
    grad = gradient((W, H), band_color, a0=0, a1=225, y0_frac=0.32)
    canvas = composite(canvas, grad)

    draw = ImageDraw.Draw(canvas)
    cx = W // 2

    # ── 상단 워드마크 영역 ──────────────────────────────────────────────────
    canvas = composite(canvas, hline_layer((W,H), MARGIN, W-MARGIN, 60, WHITE, alpha=50))
    draw = ImageDraw.Draw(canvas)

    wm_font = load_font(APPLESD, 20, index=10)
    draw_str(draw, "B O O K C H E L I N", wm_font, cx, 70, fill=WMARK_C, ls=2)

    canvas = composite(canvas, hline_layer((W,H), MARGIN, W-MARGIN, 102, WHITE, alpha=50))
    draw = ImageDraw.Draw(canvas)

    # ── 제목 영역 ───────────────────────────────────────────────────────────
    f1    = load_font(KOPUB, 90)    # 첫 번째 줄 (컨텍스트)
    f2    = load_font(KOPUB, 132)   # 두 번째 줄 (포인트 단어)
    fsub  = load_font(APPLESD, 36, index=8)

    t1_h  = f1.getbbox("가")[3] - f1.getbbox("가")[1]
    t2_h  = f2.getbbox("가")[3] - f2.getbbox("가")[1]
    gap   = 22      # 줄 사이 간격

    # 하단 기준점 설정 — 부제 아래 여백 80px, 제목2↔부제 간격 58px
    sub_h  = fsub.getbbox("가")[3] - fsub.getbbox("가")[1]
    sub_y  = H - 80 - sub_h
    t2_y   = sub_y - 58 - t2_h
    t1_y   = t2_y - gap - t1_h

    # 제목 위 구분선
    canvas = composite(canvas, hline_layer((W,H), MARGIN, W-MARGIN, t1_y - 26, WHITE, alpha=60))
    draw   = ImageDraw.Draw(canvas)

    if title1:
        draw_str(draw, title1, f1, cx, t1_y, fill=OFFWHITE, ls=10)
    draw_str(draw, title2, f2, cx, t2_y, fill=WHITE, ls=14)
    draw_str(draw, subtitle, fsub, cx, sub_y, fill=MUTED, ls=2)

    result = canvas.convert('RGB').resize((OUT_W, OUT_H), Image.LANCZOS)
    result.save(outfile, 'JPEG', quality=JPEG_QUALITY, optimize=True, progressive=True)
    print(f"  ✓ {os.path.basename(outfile)}  {os.path.getsize(outfile)//1024} KB")

# ── Variant B — 에디토리얼 밴드 ─────────────────────────────────────────────

def variant_B(photo_path, outfile, title1, title2, subtitle, band_color,
               photo_anchor='center', grade_str=0.15, desat=0.0):
    TOP_H  = 188   # 상단 밴드 높이 (워드마크)
    BOT_Y  = 1595  # 하단 밴드 시작 y
    BLEND  = 120   # 사진-밴드 블렌드 높이

    photo_h = BOT_Y - TOP_H
    photo   = fill_crop(photo_path, W, photo_h, anchor=photo_anchor)

    if desat > 0:
        photo = ImageEnhance.Color(photo).enhance(1 - desat)
    photo = color_grade(photo, band_color, strength=grade_str)
    photo = ImageEnhance.Contrast(photo).enhance(1.08)

    # 캔버스: 밴드 색으로 채우기
    canvas = Image.new('RGBA', (W, H), (*band_color, 255))
    canvas.paste(photo.convert('RGBA'), (0, TOP_H))

    # 사진→하단밴드 연결 그라데이션
    blend_frac = (BOT_Y - BLEND) / H
    grad = gradient((W, H), band_color, a0=0, a1=255, y0_frac=blend_frac)
    canvas = composite(canvas, grad)

    # 상단 밴드 하단 구분선
    canvas = composite(canvas, hline_layer((W,H), MARGIN, W-MARGIN, TOP_H-1, WHITE, alpha=25))
    draw   = ImageDraw.Draw(canvas)
    cx     = W // 2

    # 상단 워드마크
    wm_font = load_font(APPLESD, 20, index=10)
    draw_str(draw, "B O O K C H E L I N", wm_font, cx, (TOP_H - 26)//2, fill=WMARK_C, ls=2)

    # 하단 밴드 상단 구분선
    canvas = composite(canvas, hline_layer((W,H), MARGIN, W-MARGIN, BOT_Y+40, WHITE, alpha=45))
    draw   = ImageDraw.Draw(canvas)

    # 제목
    f1    = load_font(KOPUB, 88)
    f2    = load_font(KOPUB, 130)
    fsub  = load_font(APPLESD, 35, index=8)

    t1_h  = f1.getbbox("가")[3] - f1.getbbox("가")[1]
    t2_h  = f2.getbbox("가")[3] - f2.getbbox("가")[1]
    sub_h = fsub.getbbox("가")[3] - fsub.getbbox("가")[1]

    # 하단 밴드 내에서 수직 중앙 정렬
    band_content_h = (t1_h + 20 + t2_h + 30 + sub_h) if title1 else (t2_h + 30 + sub_h)
    band_inner_top = BOT_Y + 40 + 10
    band_inner_h   = H - band_inner_top - 55
    start_y = band_inner_top + (band_inner_h - band_content_h) // 2

    if title1:
        draw_str(draw, title1, f1, cx, start_y, fill=OFFWHITE, ls=10)
        t2_y = start_y + t1_h + 20
    else:
        t2_y = start_y

    draw_str(draw, title2, f2, cx, t2_y, fill=WHITE, ls=14)
    sub_y = t2_y + t2_h + 30
    draw_str(draw, subtitle, fsub, cx, sub_y, fill=MUTED, ls=2)

    result = canvas.convert('RGB').resize((OUT_W, OUT_H), Image.LANCZOS)
    result.save(outfile, 'JPEG', quality=JPEG_QUALITY, optimize=True, progressive=True)
    print(f"  ✓ {os.path.basename(outfile)}  {os.path.getsize(outfile)//1024} KB")

# ── main ─────────────────────────────────────────────────────────────────────

def main():
    print("\n=== 북슐랭 표지 리디자인 ===\n")

    # 잠들기 전 심해
    print("[심해_A]  풀블리드 + 하단 그라데이션 (수중 빛줄기, CC0)")
    variant_A(
        f"{SIMHAE}/ch01_1.jpg", f"{OUT}/심해_A.jpg",
        title1="잠들기 전", title2="심해",
        subtitle="수심을 따라 내려가는 열 편의 이야기",
        band_color=NAVY, photo_anchor='top',
    )

    print("[심해_B]  에디토리얼 밴드 — 딥네이비 (열수분출공, NOAA PD)")
    variant_B(
        f"{SIMHAE}/ch07_1.jpg", f"{OUT}/심해_B.jpg",
        title1="잠들기 전", title2="심해",
        subtitle="수심을 따라 내려가는 열 편의 이야기",
        band_color=NAVY, photo_anchor='center',
    )

    # 일상의 심리학
    print("[심리학_A]  풀블리드 + 하단 그라데이션 (일몰 플랜테이션, CC-BY)")
    variant_A(
        f"{SIMNI}/img10_1.jpg", f"{OUT}/심리학_A.jpg",
        title1="일상의", title2="심리학",
        subtitle="우리 마음의 작동 방식",
        band_color=CHARCOAL, photo_anchor='center',
    )

    print("[심리학_B]  에디토리얼 밴드 — 차콜 (창문 빗방울, CC0)")
    variant_B(
        f"{SIMNI}/img07_1.jpg", f"{OUT}/심리학_B.jpg",
        title1="일상의", title2="심리학",
        subtitle="우리 마음의 작동 방식",
        band_color=CHARCOAL, photo_anchor='top',
        desat=0.35,    # 빗방울 배경 채도 낮춰 집중도 ↑
    )

    print(f"\n완료 → {OUT}")

if __name__ == "__main__":
    main()
