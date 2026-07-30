#!/usr/bin/env python3
import json
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.colors import Color, black, white
s=json.load(open('cardspec.json')); CODE=json.load(open('doorcodes.json'))
CARDS={int(k):[tuple(x) for x in v] for k,v in s['cards'].items()}
VT={int(k):[tuple(x) for x in v] for k,v in s['verse_triples'].items()}
GOS={int(k):v for k,v in s['gospel'].items()}; DIR={int(k):v for k,v in s['dir'].items()}
UPG=DNG=set(range(1,17))
GREY=Color(.40,.38,.36); LINE=Color(.78,.76,.73); FILL=Color(.955,.95,.94)
PW,PH=landscape(letter)
def block(c,x,y,w,h,g):
    c.setStrokeColor(LINE); c.setLineWidth(.9); c.setFillColor(white)
    c.roundRect(x,y,w,h,5,stroke=1,fill=1)
    c.setFillColor(FILL); c.rect(x+1,y+h-27,w-2,26,stroke=0,fill=1)
    c.setFillColor(black); c.setFont("Helvetica-Bold",17); c.drawString(x+9,y+h-20,f"GROUP {g}")
    ty=y+h-44
    def lab(t):
        nonlocal ty
        c.setFillColor(GREY); c.setFont("Helvetica-Bold",7); c.drawString(x+9,ty,t); ty-=15
    lab("DOOR LETTERS")
    for row in (["U1","U2","U3","U4"],["D1","D2","D3"]):
        xx=x+9
        for d in row:
            live = (d[0]=="U" and g in UPG) or (d[0]=="D" and g in DNG)
            c.setFillColor(black if live else Color(.72,.70,.68))
            c.setFont("Helvetica",8.5); c.drawString(xx,ty,d)
            c.setFont("Helvetica-Bold",14); c.drawString(xx+15,ty-1,CODE[d][str(g)]); xx+=41
        ty-=19
    ty-=4
    if g in VT:
        lab("BIBLE PAGES")
        for ref,page in VT[g]:
            c.setFillColor(black); c.setFont("Helvetica",8.5); c.drawString(x+9,ty,ref)
            c.setFont("Helvetica-Bold",11); c.drawRightString(x+w-9,ty-1,str(page)); ty-=15
        ty-=4
    if g in GOS:
        lab("GOSPEL WORD")
        c.setFillColor(black); c.setFont("Helvetica-Bold",12); c.drawString(x+9,ty,GOS[g].upper()); ty-=17
    if g in DIR:
        lab("DELIVERY")
        c.setFillColor(black); c.setFont("Helvetica",8.5); c.drawString(x+9,ty,DIR[g])
c=canvas.Canvas("footprints-print-pack/07-counselor/answer-sheet.pdf",pagesize=(PW,PH))
for page in range(2):
    c.setFillColor(black); c.setFont("Helvetica-Bold",19)
    c.drawString(30,PH-40,"COUNSELOR ANSWER SHEET")
    c.setFillColor(GREY); c.setFont("Helvetica",10)
    c.drawString(30,PH-56,f"Groups {page*8+1}–{page*8+8}.  Find the group number on the student's card, then check their answers against this block.")
    c.setFont("Helvetica-Bold",9)
    c.drawRightString(PW-30,PH-40,"TONIGHT'S TARGET: ______ pts     PEW BIBLE EDITION: ___________________________")
    c.setFont("Helvetica",8)
    c.drawRightString(PW-30,PH-54,"Page numbers are worthless against a different printing.")
    c.setStrokeColor(black); c.setLineWidth(1.4); c.line(30,PH-64,PW-30,PH-64)
    W=(PW-60-3*10)/4; H=(PH-64-30-14-10)/2
    for i in range(8):
        g=page*8+i+1
        block(c,30+(i%4)*(W+10), PH-64-14-(i//4)*(H+10)-H, W,H, g)
    c.setFillColor(GREY); c.setFont("Helvetica",8)
    c.drawCentredString(PW/2,14,"Grey door letters are not on that group's card — they should not be writing them down.")
    c.showPage()
c.save(); print("wrote 07-counselor/answer-sheet.pdf — 2 pages, 8 groups per page")
