#!/usr/bin/env python3
"""Gospel & Theme completion cards — 6 phrases, 2x3 grid, full Letter page, cut-safe."""
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import Color
GREY=Color(.40,.38,.36); LINE=Color(.62,.62,.62)
PW,PH=letter                       # 612 x 792 portrait
SAFE=40; CUTIN=20
CX=PW/2; CY1=PH/3; CY2=2*PH/3      # cuts at 306 / 264 / 528
PHRASES=["created us to be with him.",
         "the price for sin, Jesus died and rose again.",
         "sins separate us from God.",
         "who trusts in him alone has eternal life.",
         "cannot be removed by good deeds.",
         "with Jesus starts now and lasts forever."]
def wrap(c,t,f,sz,w):
    out=[]; ln=""
    for word in t.split():
        cand=(ln+" "+word).strip()
        if c.stringWidth(cand,f,sz)<=w: ln=cand
        else: out.append(ln); ln=word
    if ln: out.append(ln)
    return out
c=canvas.Canvas("footprints-print-pack/06-signs/gospel-completion-cards.pdf",pagesize=(PW,PH))
cells=[]
for row,(yb,yt) in enumerate([(CY2+CUTIN,PH-SAFE),(CY1+CUTIN,CY2-CUTIN),(SAFE,CY1-CUTIN)]):
    for col,(xl,xr) in enumerate([(SAFE,CX-CUTIN),(CX+CUTIN,PW-SAFE)]):
        cells.append((xl,xr,yb,yt))
for (xl,xr,yb,yt),phrase in zip(cells,PHRASES):
    w=xr-xl
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",8)
    c.drawString(xl,yt-11,"G O S P E L   &   T H E M E   —   1   P O I N T")
    txt="________  "+phrase
    sz=24
    while True:
        ls=wrap(c,txt,"Helvetica-Bold",sz,w)
        if len(ls)*sz*1.3<=yt-yb-34 and len(ls)<=4: break
        sz-=1
    block=len(ls)*sz*1.3
    y=yt-24-((yt-yb-24)-block)/2-sz
    c.setFillColor(Color(.1,.1,.1))
    for ln in ls:
        c.setFont("Helvetica-Bold",sz); c.drawString(xl,y,ln); y-=sz*1.3
# cut guides
c.setStrokeColor(LINE); c.setLineWidth(.6); c.setDash(4,4)
c.line(CX,SAFE,CX,PH-SAFE); c.line(SAFE,CY1,PW-SAFE,CY1); c.line(SAFE,CY2,PW-SAFE,CY2)
c.setDash(); c.setFillColor(GREY); c.setFont("Helvetica",6.5)
c.drawString(CX+4,SAFE+2,"cut"); c.drawString(SAFE+2,CY1+4,"cut"); c.drawString(SAFE+2,CY2+4,"cut")
c.save()
print("wrote 06-signs/gospel-completion-cards.pdf — 1 page, 2x3, six phrases")
print(f"  card size after cutting: {CX/72:.2f} x {CY1/72:.2f} in · content ≥{CUTIN/72:.2f}in from cuts, ≥{SAFE/72:.2f}in from page edges")
