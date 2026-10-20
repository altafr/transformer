"""Builds a print-and-learn version of preread-math.html and writes an HTML file that tools/render-pdf.mjs turns into a PDF.
Usage: python3 tools/build-math-pdf.py preread-math.html out.html"""
import re,sys
src=open(sys.argv[1]).read()
PRACTICE=[
 ("Write a vector for a parcel: weight 4 kg, distance 120 km, 2 days old.","[4, 120, 2]  (any fixed order works)"),
 ("A point has 5 numbers. How many axes does its space have?","5 axes, so a 5-dimensional space"),
 ("Which is closer to [0, 0]: [3, 4] or [6, 1]?","[3, 4]. It is 5 away; [6, 1] is about 6.1 away"),
 ("Work out [3, 0, 2] · [1, 5, 4].","3×1 + 0×5 + 2×4 = 11"),
 ("Work out [2, 1] × [[1, 3], [4, 0]].","[2×1 + 1×4,  2×3 + 1×0] = [6, 6]"),
 ("Three equal scores [0, 0, 0] go through softmax. What are the shares?","Equal shares: about 33% each"),
 ("The shares are 70 / 20 / 10. In 100 draws, about how many go to the first option?","About 70 (not exactly 70)"),
 ("Work out max(0, x) for x = −5, 0 and 4.","0, 0 and 4"),
 ("The numbers are [2, 4, 6]. What is the average? Subtract it from each number.","Average 4, giving [−2, 0, 2]"),
 ("prediction = w × 3 and the target is 12. If w = 3, what is the error? Which w gives 0?","Error 3 (9 vs 12). w = 4 gives 0"),
 ("Start at 2. Double and subtract 1, three times. What do you get?","3, then 5, then 9"),
]
COLORS=['#0B7A75','#C9630F','#4B3FD1','#B8326F','#2E7D32','#1565C0','#9A5B00','#7B3FA0','#00796B','#C62828','#37474F']
cards=re.findall(r'  <article class="card">.*?  </article>\n',src,flags=re.S)
assert len(cards)==11
newcards=[]
for i,c in enumerate(cards):
    q,a=PRACTICE[i]
    prac=f'    <div class="practice"><b>Your turn</b><p>{q}</p><div class="lines"></div></div>\n  </article>\n'
    c=c.rstrip()
    c=c[:c.rindex('</article>')].rstrip()+'\n'+prac
    c=c.replace('<article class="card">',f'<article class="card" style="--c:{COLORS[i]}">')
    newcards.append(c)
for old,new in zip(cards,newcards): src=src.replace(old,new,1)
key=''.join(f'<li><b>{i+1}</b><span>{a}</span></li>' for i,(q,a) in enumerate(PRACTICE))
src=src.replace('<footer>',f'<section class="answers"><h2>Answer key</h2><p class="lead">Try each “Your turn” before you look.</p><ol class="key">{key}</ol></section>\n<footer>',1)
src=src.replace('<div class="kicker">Read beforehand · about 10 minutes</div>','<div class="kicker">Print and learn · about 20 minutes with pencil</div>')
src=src.replace('<h1>Math Primer</h1>','<h1>Math Primer</h1><div class="who">Name: ______________________ &nbsp;&nbsp; Date: ______________</div>')
src=re.sub(r'<footer>.*?</footer>','<footer>Every example uses small, made-up numbers so you can check them by hand.</footer>',src,flags=re.S)
print_css='''
/* ---- print and learn layer ---- */
@page{size:A4;margin:11mm 12mm 17mm}
html,body{background:#fff!important;color:#15211F}
body{font-size:12.5pt;line-height:1.5;padding:0}
.page{max-width:none}
header{padding-block:0 8mm}
h1{font-size:44pt}
.who{font:500 11pt var(--mono);color:#51635F;margin-top:6px}
.dek{font-size:15pt}
.one{border-radius:14px;margin-bottom:8mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.one p{font-size:17pt}
h2{font-size:21pt;margin-bottom:3mm}
.map{margin-bottom:8mm}
.cards{gap:6mm;display:block}
.card{--c:#0B7A75;break-inside:avoid;page-break-inside:avoid;margin:0 0 6mm;padding:0 0 4mm;border:2px solid var(--c);border-radius:14px;overflow:hidden;background:color-mix(in srgb,var(--c) 6%,#fff);gap:3mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.card>*,.card .what{margin-inline:5mm!important}
.card h3{margin:0;margin-inline:0;padding:3mm 5mm;background:var(--c);color:#fff;font-size:17pt;align-items:center}
.card h3 span{color:#fff;background:rgba(255,255,255,.25);width:9mm;height:9mm;border-radius:50%;display:grid;place-items:center;font-size:13pt;min-width:0}
.card .what{font-size:12.5pt}
.eg{background:#fff;border:1.5px solid var(--c);color:#15211F;font-size:11pt}
.line.think span{background:#FFF1C9}
.line.think b{color:#8a4b00}
.fig{max-width:150mm}
.practice{border:2px dashed var(--c);border-radius:10px;padding:3mm 4mm;background:#fff;display:grid;gap:2mm}
.practice b{font:700 11pt var(--display);color:var(--c);letter-spacing:.04em;text-transform:uppercase}
.practice p{margin:0;font-size:12.5pt}
.lines{height:14mm;background:repeating-linear-gradient(to bottom,transparent 0,transparent 6.6mm,#9DB1AC 6.6mm,#9DB1AC 7mm)}
.q{margin-bottom:8mm}
.answers{break-before:page}
.key{list-style:none;margin:0;padding:0;display:grid;gap:3mm}
.key li{display:grid;grid-template-columns:12mm 1fr;gap:4mm;align-items:baseline;padding:3mm 4mm;border-radius:10px;background:#E8F4F2;font-size:12.5pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.key b{font:800 15pt var(--display);color:#0B7A75}
dl{font-size:12pt}
footer{margin-top:6mm}
'''
src=src.replace('</style>',print_css+'</style>',1)
open(sys.argv[2],'w').write(src)
