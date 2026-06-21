import os, re, glob
from ebooklib import epub

CONTENT_DIR = "/home/claude/bookshlang/content"
OUT = "/home/claude/bookshlang/jamdeulgi-jeon-uju.epub"

def parse_md(path):
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    # strip YAML front matter
    meta = {}
    body = raw
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.DOTALL)
    if m:
        fm, body = m.group(1), m.group(2)
        for line in fm.splitlines():
            mm = re.match(r'^(\w+):\s*"?(.*?)"?\s*$', line)
            if mm:
                meta[mm.group(1)] = mm.group(2)
    return meta, body

def md_body_to_html(body):
    # remove image-slot comments (placeholders not yet filled)
    body = re.sub(r"<!--.*?-->", "", body, flags=re.DOTALL)
    lines = body.splitlines()
    html = []
    para = []
    def flush():
        if para:
            text = " ".join(para).strip()
            if text:
                html.append(f"<p>{text}</p>")
            para.clear()
    for ln in lines:
        s = ln.rstrip()
        if not s.strip():
            flush(); continue
        if s.startswith("# "):
            flush(); continue  # book title handled separately; skip per-file h1
        if s.startswith("## "):
            flush(); html.append(f"<h2>{s[3:].strip()}</h2>"); continue
        if s.startswith("### "):
            flush(); html.append(f"<h3>{s[4:].strip()}</h3>"); continue
        para.append(s.strip())
    flush()
    return "\n".join(html)

book = epub.EpubBook()
book.set_identifier("bookshlang-jamdeulgi-jeon-uju-001")
book.set_title("잠들기 전 우주")
book.set_language("ko")
book.add_author("북슐랭")
book.add_metadata("DC", "description", "별의 일생에서 우주의 끝까지, 잠들기 전에 읽는 열 편의 우주 이야기.")

css = """
body { font-family: serif; line-height: 1.9; margin: 6% 7%; color: #1a1a1a; }
h1 { font-size: 1.7em; text-align: center; margin: 2em 0 0.3em; }
h2 { font-size: 1.35em; margin: 1.6em 0 0.8em; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
h3 { font-size: 1.1em; margin: 1.5em 0 0.6em; color: #333; }
p  { margin: 0 0 1.1em; text-align: justify; }
.subtitle { text-align:center; color:#666; font-size:0.95em; margin-bottom:2.5em; }
.meta { color:#888; font-size:0.85em; text-align:center; }
.toc-list { line-height: 2.2; }
.cover-wrap { text-align:center; margin-top:25%; }
.cover-title { font-size:2.4em; letter-spacing:0.15em; }
.cover-sub { color:#666; margin-top:1em; }
"""
style = epub.EpubItem(uid="style", file_name="style/main.css",
                      media_type="text/css", content=css)
book.add_item(style)

# cover page
cover = epub.EpubHtml(title="표지", file_name="cover.xhtml", lang="ko")
cover.add_item(style)
cover.content = """<html><head><link rel="stylesheet" href="style/main.css"/></head>
<body><div class="cover-wrap">
<div class="cover-title">잠들기 전 우주</div>
<div class="cover-sub">별의 일생에서 우주의 끝까지<br/>열 편의 밤 이야기</div>
<div class="cover-sub" style="margin-top:3em;">북슐랭</div>
</div></body></html>"""
book.add_item(cover)

files = sorted(glob.glob(os.path.join(CONTENT_DIR, "uju-[0-1][0-9]-*.md")))
files = [f for f in files if "series-guide" not in f and "byeolui-ilsaeng-v2" in f or re.search(r"uju-(0[2-9]|10)-", f)]
# ensure ep1 v2 + ep2..10
files = []
files.append(os.path.join(CONTENT_DIR, "uju-01-byeolui-ilsaeng-v2.md"))
for f in sorted(glob.glob(os.path.join(CONTENT_DIR, "uju-*.md"))):
    base = os.path.basename(f)
    if re.match(r"uju-(0[2-9]|10)-", base):
        files.append(f)

chapters = []
toc_links = []
for f in files:
    meta, body = parse_md(f)
    ep = meta.get("episode", "")
    title = meta.get("title", "")
    chap_title = f"{ep}화 — {title}"
    fname = f"chap_{int(ep):02d}.xhtml"
    c = epub.EpubHtml(title=chap_title, file_name=fname, lang="ko")
    c.add_item(style)
    inner = md_body_to_html(body)
    c.content = f"""<html><head><link rel="stylesheet" href="style/main.css"/></head>
<body><h1>{chap_title}</h1>{inner}</body></html>"""
    book.add_item(c)
    chapters.append(c)
    toc_links.append((c, chap_title))

# TOC page
toc_html = '<html><head><link rel="stylesheet" href="style/main.css"/></head><body><h1>차례</h1><div class="toc-list">'
for c, t in toc_links:
    toc_html += f'<p><a href="{c.file_name}">{t}</a></p>'
toc_html += '</div></body></html>'
toc_page = epub.EpubHtml(title="차례", file_name="toc.xhtml", lang="ko")
toc_page.add_item(style)
toc_page.content = toc_html
book.add_item(toc_page)

book.toc = [(epub.Section("잠들기 전 우주"), tuple(chapters))]
book.add_item(epub.EpubNcx())
book.add_item(epub.EpubNav())
book.spine = [cover, toc_page] + chapters

epub.write_epub(OUT, book)
print("EPUB written:", OUT)
print("Chapters:", len(chapters))
for _, t in toc_links:
    print("  -", t)
