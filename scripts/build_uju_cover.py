#!/usr/bin/env python3
# 잠들기 전 우주 — 표지 v2 (세련/미니멀, 고리 행성 + 트래킹 타이포)
# 2x 슈퍼샘플링 후 축소 → 매끈한 엣지/텍스트
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

S = 2
W, H = 600 * S, 900 * S
FONT_B = "/tmp/NanumGothicBold.ttf"
FONT_R = "/tmp/NanumGothic.ttf"

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

# ---- 배경: 3-스톱 세로 그라데이션 + 비네트 ---------------------------------
top = (30, 24, 64)     # 깊은 인디고/바이올렛
mid = (14, 13, 38)
bot = (6, 6, 16)
bg = Image.new("RGB", (W, H), bot)
px = bg.load()
for y in range(H):
    t = y / (H - 1)
    c = lerp(top, mid, t * 1.6) if t < 0.55 else lerp(mid, bot, (t - 0.55) / 0.45)
    for x in range(W):
        px[x, y] = c

# 비네트(가장자리 어둡게)
vig = Image.new("L", (W, H), 0)
vd = ImageDraw.Draw(vig)
vd.ellipse([-W * 0.35, -H * 0.25, W * 1.35, H * 1.25], fill=255)
vig = vig.filter(ImageFilter.GaussianBlur(160 * S // 2))
dark = Image.new("RGB", (W, H), (2, 2, 8))
bg = Image.composite(bg, dark, vig)

img = bg.convert("RGB")
draw = ImageDraw.Draw(img, "RGBA")

# ---- 미세한 별먼지 (적게, 의도적으로) -------------------------------------
import random
random.seed(7)
star_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(star_layer)
for _ in range(90):
    x = random.randint(0, W - 1); y = random.randint(0, int(H * 0.62))
    r = random.choice([0.6, 0.8, 1.0, 1.3]) * S
    a = random.randint(40, 150)
    sd.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, a))
img.paste(star_layer, (0, 0), star_layer)
draw = ImageDraw.Draw(img, "RGBA")

# 또렷한 별 3개 + 십자 글린트
def glint(cx, cy, L, a=210):
    g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    gd.line([cx - L, cy, cx + L, cy], fill=(255, 255, 255, a), width=1 * S)
    gd.line([cx, cy - L, cx, cy + L], fill=(255, 255, 255, a), width=1 * S)
    gd.ellipse([cx - 2 * S, cy - 2 * S, cx + 2 * S, cy + 2 * S], fill=(255, 255, 255, 255))
    img.paste(g, (0, 0), g.filter(ImageFilter.GaussianBlur(0.4 * S)))
for (cx, cy, L) in [(int(W*0.18), int(H*0.16), 9*S), (int(W*0.80), int(H*0.40), 7*S), (int(W*0.30), int(H*0.46), 6*S)]:
    glint(cx, cy, L)
draw = ImageDraw.Draw(img, "RGBA")

# ---- 행성 (구체 + 고리) ----------------------------------------------------
cx, cy, R = int(W * 0.50), int(H * 0.31), int(95 * S)

# 외곽 글로우
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([cx - R*1.5, cy - R*1.5, cx + R*1.5, cy + R*1.5], fill=(120, 120, 200, 70))
glow = glow.filter(ImageFilter.GaussianBlur(40 * S))
img.paste(glow, (0, 0), glow)

# 뒤쪽 고리 (반타원, 행성 뒤를 지나가는 부분)
ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
rd = ImageDraw.Draw(ring)
rw, rh = int(R * 2.15), int(R * 0.62)
for i, a in [(0, 150), (6 * S, 60)]:
    rd.ellipse([cx - rw, cy - rh + i, cx + rw, cy + rh + i], outline=(210, 200, 170, a), width=max(1, 2 * S - 1))
ring = ring.rotate(-18, center=(cx, cy), resample=Image.BICUBIC)
img.paste(ring, (0, 0), ring)
draw = ImageDraw.Draw(img, "RGBA")

# 구체: 라디얼 그라데이션 (우상단 광원)
sphere = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sp = sphere.load()
lx, ly = cx + R * 0.45, cy - R * 0.5  # 광원 방향
base_lit = (60, 70, 120)     # 밝은 면 (차분한 블루)
base_dark = (16, 18, 40)     # 그림자 면
for yy in range(cy - R, cy + R + 1):
    for xx in range(cx - R, cx + R + 1):
        dx, dy = xx - cx, yy - cy
        if dx*dx + dy*dy <= R*R:
            d = math.hypot(xx - lx, yy - ly) / (R * 1.9)
            d = max(0.0, min(1.0, d))
            sp[xx, yy] = (*lerp(base_lit, base_dark, d), 255)
# 가장자리 살짝 부드럽게
sphere = sphere.filter(ImageFilter.GaussianBlur(0.6 * S))
img.paste(sphere, (0, 0), sphere)

# 앞쪽 고리 (행성 앞을 지나가는 절반) — 행성 아래쪽만 보이게
ring2 = Image.new("RGBA", (W, H), (0, 0, 0, 0))
r2 = ImageDraw.Draw(ring2)
r2.ellipse([cx - rw, cy - rh, cx + rw, cy + rh], outline=(225, 215, 185, 200), width=2 * S)
ring2 = ring2.rotate(-18, center=(cx, cy), resample=Image.BICUBIC)
# 앞부분(행성 중심선 아래)만 남기기 위해 위쪽 절반 마스크 제거
mask = Image.new("L", (W, H), 0)
md = ImageDraw.Draw(mask)
md.rectangle([0, cy + int(R*0.05), W, H], fill=255)
img.paste(ring2, (0, 0), Image.composite(ring2.split()[3], Image.new("L", (W, H), 0), mask))
draw = ImageDraw.Draw(img, "RGBA")

# ---- 타이포그래피 (트래킹/자간) -------------------------------------------
def tracked(y, text, font, fill, tracking):
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = (W - total) / 2
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += w + tracking

title_f = ImageFont.truetype(FONT_B, 72 * S)
sub_f = ImageFont.truetype(FONT_R, 23 * S)
brand_f = ImageFont.truetype(FONT_R, 25 * S)

WHITE = (240, 242, 252, 255)
SUBC = (172, 182, 214, 255)
GOLD = (206, 188, 142, 255)

tracked(560 * S, "잠들기 전 우주", title_f, WHITE, 6 * S)

# 얇은 구분선 + 가운데 점
ly2 = 690 * S
draw.line([W/2 - 64*S, ly2, W/2 - 10*S, ly2], fill=(150, 160, 205, 150), width=max(1, S))
draw.line([W/2 + 10*S, ly2, W/2 + 64*S, ly2], fill=(150, 160, 205, 150), width=max(1, S))
draw.ellipse([W/2 - 2*S, ly2 - 2*S, W/2 + 2*S, ly2 + 2*S], fill=(190, 200, 235, 220))

tracked(722 * S, "별의 일생에서 우주의 끝까지", sub_f, SUBC, 2 * S)
tracked(758 * S, "열 편의 밤 이야기", sub_f, SUBC, 2 * S)

# 브랜드 (넓은 자간)
tracked(835 * S, "B O O K C H E L I N", ImageFont.truetype(FONT_R, 16 * S), GOLD, 3 * S)
tracked(862 * S, "북슐랭", brand_f, (224, 210, 170, 255), 8 * S)

# ---- 다운스케일 (안티에일리어싱) ------------------------------------------
out = img.resize((600, 900), Image.LANCZOS)
out.save("/tmp/uju_cover.png", "PNG")
print("saved /tmp/uju_cover.png", out.size)
