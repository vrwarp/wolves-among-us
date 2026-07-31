#!/usr/bin/env python3
import json
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.colors import Color, black, white
s=json.load(open('cardspec32.json'))
CODE=s['code']; DOORS=s['doors']; NG=s['groups']
VT={int(k):[tuple(x) for x in v] for k,v in s['verse_triples'].items()}
GOS={int(k):v for k,v in s['gospel'].items()}; DIR={int(k):v for k,v in s['dir'].items()}
GREY=Color(.40,.38,.36); LINE=Color(.76,.74,.71); FILL=Color(.955,.95,.94)
PW,PH=landscape(letter)

# ---------- 1. door code sheets ----------
c=canvas.Canvas("footprints-print-pack/05-doors/door-code-sheets.pdf",pagesize=(PW,PH))
for d in DOORS:
    floor="UPSTAIRS" if d[0]=="U" else "DOWNSTAIRS"
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",13)
    c.drawString(44,PH-54,f"{floor}  ·  AMONG US: FOOTPRINTS")
    c.setFillColor(black); c.setFont("Helvetica-Bold",78); c.drawString(44,PH-118,f"DOOR {d}")
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",16)
    c.drawRightString(PW-44,PH-100,"Find YOUR GROUP NUMBER.")
    c.drawRightString(PW-44,PH-120,"Copy BOTH letters next to it.")
    c.setStrokeColor(black); c.setLineWidth(2.5); c.line(44,PH-134,PW-44,PH-134)
    top=PH-150; colw=(PW-88)/4; rowh=52
    for i in range(NG):
        col,r=i%4,i//4
        x=44+col*colw; y=top-r*rowh
        c.setStrokeColor(LINE); c.setLineWidth(.8); c.line(x,y-rowh+8,x+colw-16,y-rowh+8)
        c.setFillColor(GREY); c.setFont("Helvetica-Bold",8); c.drawString(x,y-13,"GROUP")
        c.setFillColor(black); c.setFont("Helvetica-Bold",23); c.drawString(x,y-36,str(i+1))
        c.setStrokeColor(black); c.setLineWidth(2); c.setFillColor(white)
        c.rect(x+colw-92,y-42,70,36,stroke=1,fill=1)
        c.setFillColor(black); c.setFont("Helvetica-Bold",27)
        c.drawCentredString(x+colw-57,y-34,CODE[d][str(i+1)])
    c.setFillColor(GREY); c.setFont("Helvetica",9)
    c.drawCentredString(PW/2,44,"Tape all four corners.  ·  Do not remove this sheet.")
    c.showPage()
c.save(); print(f"door-code-sheets.pdf — {len(DOORS)} pages, {NG} rows each, 2-letter codes")

# ---------- 2. counselor answer sheet ----------
def block(c,x,y,w,h,g):
    c.setStrokeColor(LINE); c.setLineWidth(.9); c.setFillColor(white)
    c.roundRect(x,y,w,h,5,stroke=1,fill=1)
    c.setFillColor(FILL); c.rect(x+1,y+h-26,w-2,25,stroke=0,fill=1)
    c.setFillColor(black); c.setFont("Helvetica-Bold",16); c.drawString(x+8,y+h-19,f"GROUP {g}")
    ty=y+h-42
    def lab(t):
        nonlocal ty
        c.setFillColor(GREY); c.setFont("Helvetica-Bold",6.5); c.drawString(x+8,ty,t); ty-=14
    lab("DOOR CODES")
    for row in (DOORS[:4],DOORS[4:]):
        xx=x+8
        for d in row:
            c.setFillColor(GREY); c.setFont("Helvetica",7.5); c.drawString(xx,ty,d)
            c.setFillColor(black); c.setFont("Helvetica-Bold",11); c.drawString(xx+13,ty-1,CODE[d][str(g)])
            xx+=41
        ty-=17
    ty-=3
    if g in VT:
        lab("BIBLE PAGES")
        for ref,page in VT[g]:
            c.setFillColor(black); c.setFont("Helvetica",8); c.drawString(x+8,ty,ref)
            c.setFont("Helvetica-Bold",10.5); c.drawRightString(x+w-8,ty-1,str(page)); ty-=14
        ty-=3
    lab("GOSPEL WORD")
    c.setFillColor(black); c.setFont("Helvetica-Bold",12); c.drawString(x+8,ty,GOS[g].upper()); ty-=17
    if g in DIR:
        lab("RED BALL")
        c.setFillColor(black); c.setFont("Helvetica",8); c.drawString(x+8,ty,DIR[g])
c=canvas.Canvas("footprints-print-pack/07-counselor/answer-sheet.pdf",pagesize=(PW,PH))
per=8
for page in range((NG+per-1)//per):
    lo,hi=page*per+1,min(NG,(page+1)*per)
    c.setFillColor(black); c.setFont("Helvetica-Bold",18); c.drawString(42,PH-54,"COUNSELOR ANSWER SHEET")
    c.setFillColor(GREY); c.setFont("Helvetica",9.5)
    c.drawString(42,PH-68,f"Groups {lo}–{hi}.  Find the group number on the student's card, then check their answers here.")
    c.setFillColor(black); c.setFont("Helvetica-Bold",9)
    c.drawRightString(PW-42,PH-52,"TONIGHT'S TARGET: ______ pts     PEW BIBLE EDITION: ___________________________")
    c.setFillColor(GREY); c.setFont("Helvetica",7.5)
    c.drawRightString(PW-42,PH-66,"Page numbers are worthless against a different printing.")
    c.setStrokeColor(black); c.setLineWidth(1.4); c.line(42,PH-76,PW-42,PH-76)
    W=(PW-84-3*9)/4; H=(PH-76-44-9-14)/2
    for i in range(hi-lo+1):
        block(c,42+(i%4)*(W+9), PH-76-12-(i//4)*(H+9)-H, W,H, lo+i)
    c.setFillColor(GREY); c.setFont("Helvetica",7.5)
    c.drawCentredString(PW/2,44,f"page {page+1} of {(NG+per-1)//per}   ·   all four counselors carry all pages")
    c.showPage()
c.save(); print(f"answer-sheet.pdf — {(NG+per-1)//per} pages, {NG} group blocks")

# ---------- 3. gospel box signs ----------
SENT=[("GOD","created us to be with him."),
      ("PAYING","the price for sin, Jesus died and rose again."),
      ("OUR","sins separate us from God."),
      ("EVERYONE","who trusts in him alone has eternal life."),
      ("SINS","cannot be removed by good deeds."),
      ("LIFE","with Jesus starts now and lasts forever.")]
def wrap(c,t,f,sz,w):
    c.setFont(f,sz); out=[]; ln=""
    for word in t.split():
        cand=(ln+" "+word).strip()
        if c.stringWidth(cand,f,sz)<=w: ln=cand
        else: out.append(ln); ln=word
    if ln: out.append(ln)
    return out
c=canvas.Canvas("footprints-print-pack/06-signs/gospel-box-signs.pdf",pagesize=(PW,PH))
for word,rest in SENT:
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",14)
    c.drawString(44,PH-52,"G O S P E L   &   T H E M E   —   1   P O I N T")
    c.setStrokeColor(black); c.setLineWidth(3); c.line(44,PH-66,PW-44,PH-66)
    txt="________  "+rest
    sz=62
    while True:
        lines=wrap(c,txt,"Helvetica-Bold",sz,PW-88)
        if len(lines)<=3 or sz<=34: break
        sz-=2
    y=PH-150
    c.setFillColor(black)
    for ln in lines:
        c.setFont("Helvetica-Bold",sz); c.drawString(44,y,ln); y-=sz*1.16
    c.setStrokeColor(LINE); c.setLineWidth(1.5); c.line(44,y-4,PW-44,y-4)
    c.setFillColor(black); c.setFont("Helvetica-Bold",25)
    c.drawString(44,y-46,"Is your word the one that fits? Take ONE card.")
    c.setFillColor(GREY); c.setFont("Helvetica",19)
    c.drawString(44,y-78,"Then show it to any counselor. Wrong box, no mark.")
    c.setFillColor(GREY); c.setFont("Helvetica",8.5)
    c.drawRightString(PW-44,44,f"facilitator: this box holds the {word} cards")
    c.showPage()
c.save(); print(f"gospel-box-signs.pdf — {len(SENT)} pages")
