"""Stamps a footer on every page of a PDF: author link, series name and page number.
Usage: python3 tools/stamp-footer.py in.pdf out.pdf     (needs: pip install pymupdf)"""
import sys, pymupdf
URL = "https://altafrehmani.netlify.app/"
AUTHOR, SERIES = "Altaf Rehmani", "LLM Primer - How LLMs work"
doc = pymupdf.open(sys.argv[1])
n = len(doc)
for i, page in enumerate(doc):
    w, h = page.rect.width, page.rect.height
    y = h - 22
    f, size = "helv", 9.5
    left = f"{AUTHOR}"
    mid = f"   |   {SERIES}"
    tw = pymupdf.get_text_length(left + mid, f, size)
    x = (w - tw) / 2
    page.draw_line((36, h - 38), (w - 36, h - 38), color=(0.78, 0.84, 0.82), width=0.8)
    page.insert_text((x, y), left, fontname=f, fontsize=size, color=(0.04, 0.48, 0.46))
    lw = pymupdf.get_text_length(left, f, size)
    page.insert_text((x + lw, y), mid, fontname=f, fontsize=size, color=(0.32, 0.39, 0.37))
    page.insert_link({"kind": pymupdf.LINK_URI, "from": pymupdf.Rect(x, y - size, x + lw, y + 3), "uri": URL})
    page.draw_line((x, y + 1.5), (x + lw, y + 1.5), color=(0.04, 0.48, 0.46), width=0.6)
    page.insert_text((w - 36 - pymupdf.get_text_length(f"{i+1} / {n}", f, 9), y), f"{i+1} / {n}", fontname=f, fontsize=9, color=(0.32, 0.39, 0.37))
doc.save(sys.argv[2], garbage=3, deflate=True)
