#!/usr/bin/env python3
import json
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.colors import Color, black, white

s=json.load(open('cardspec.json'))
CARDS={int(k):[tuple(x) for x in v] for k,v in s['cards'].items()}
VT={int(k):[tuple(x) for x in v] for k,v in s['verse_triples'].items()}
DIR={int(k):v for k,v in s['dir'].items()}; GOS={int(k):v for k,v in s['gospel'].items()}
DOORS=s['doors']
PTS={'I Can Fly':3,'Verse Order':3,'Cup Stack':2,'Apple Stack':2,'Simple Maze':2,'Sudoku':2,
     'Special Delivery':2,'Doors':1,'Gospel & Theme':1}
CARD_TOTAL=11; QUOTA=8
RENAME={'Verse Order':'Find the Verse'}
GREY=Color(.40,.38,.36); LINE=Color(.80,.78,.75)
PW,PH=landscape(letter); CW=PW/2
M=20; IW=CW-2*M
TASKW=224; PTSX=238; BOXX=278; BOX=50
HEADER=46; COLH=16; MINROW=54; VROW=86; DOORROW=84
DEAD_TOP=118; DEADBOX=46; NDEAD=6

def detail(g,n):
    if n=='I Can Fly':        return ["Stage — get it past the far line.","Unlimited tries."]
    if n=='Apple Stack':      return ["Stage — 3 apples, standing 3 seconds."]
    if n=='Cup Stack':        return ["Stage — 15 cups, then reset the lane."]
    if n in ('Simple Maze','Sudoku'): return ["Take a sheet, solve it, show a counselor."]
    if n=='Special Delivery': return [f"Red ball, {DIR[g]}."]
    if n=='Gospel & Theme':   return [f"Word: {GOS[g].upper()}. Find the matching card."]
    return []

def wrap(c,t,f,sz,w):
    c.setFont(f,sz); out=[]; ln=""
    for word in t.split():
        cand=(ln+" "+word).strip()
        if c.stringWidth(cand,f,sz)<=w: ln=cand
        else: out.append(ln); ln=word
    if ln: out.append(ln)
    return out

def rh(c,g,n):
    if n=='Verse Order': return VROW
    if n=='Doors': return DOORROW
    lines=sum(len(wrap(c,d,"Helvetica",11.5,TASKW)) for d in detail(g,n))
    return max(MINROW,22+14*max(1,lines)+12)

def card(c,ox,g):
    c.saveState(); c.translate(ox,0)
    x=M; top=PH-M
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",7.5)
    c.drawString(x,top-10,"A M O N G   U S   —   F O O T P R I N T S   E D I T I O N")
    c.setFillColor(black); c.setFont("Helvetica-Bold",13); c.drawString(x,top-28,"YOUR TASK CARD")
    c.setFont("Helvetica-Bold",34); c.drawRightString(x+IW,top-28,str(g))
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",7); c.drawRightString(x+IW,top-38,"GROUP")
    y=top-HEADER
    c.setStrokeColor(black); c.setLineWidth(1.4); c.line(x,y,x+IW,y)
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",7.5)
    c.drawString(x,y-11,"TASK"); c.drawCentredString(x+PTSX+12,y-11,"PTS")
    c.drawCentredString(x+BOXX+BOX/2,y-11,"COUNSELOR")
    y-=COLH
    for tier,n in CARDS[g]:
        h=rh(c,g,n)
        c.setStrokeColor(LINE); c.setLineWidth(.7); c.line(x,y,x+IW,y)
        c.setFillColor(black); c.setFont("Helvetica-Bold",14.5); c.drawString(x,y-18,RENAME.get(n,n))
        c.setFont("Helvetica-Bold",16); c.drawCentredString(x+PTSX+12,y-18,str(PTS[n]))
        c.setLineWidth(1.8); c.setStrokeColor(black); c.setFillColor(white)
        c.rect(x+BOXX,y-6-BOX,BOX,BOX,stroke=1,fill=1)
        if n=='Verse Order':
            c.setFillColor(GREY); c.setFont("Helvetica",10.5)
            c.drawString(x,y-34,"Look each one up in a pew Bible.")
            c.drawString(x,y-48,"Write the page number.")
            xx=x; dy=y-74
            for ref,page in VT[g]:
                c.setFillColor(black); c.setFont("Helvetica-Bold",11.5); c.drawString(xx,dy,ref)
                w=c.stringWidth(ref,"Helvetica-Bold",11.5)+5
                c.setStrokeColor(black); c.setLineWidth(1.1); c.setFillColor(white)
                c.rect(xx+w,dy-5,34,19,stroke=1,fill=1); xx+=w+34+12
        elif n=='Doors':
            c.setFillColor(GREY); c.setFont("Helvetica",10.5)
            c.drawString(x,y-33,f"Row {g} — all 7 doors. Copy the letter at each.")
            for li,row in enumerate((DOORS[:4],DOORS[4:])):
                dy=y-56-li*22; xx=x
                for d in row:
                    c.setFillColor(black); c.setFont("Helvetica-Bold",11.5); c.drawString(xx,dy,d)
                    c.setStrokeColor(black); c.setLineWidth(1.1); c.setFillColor(white)
                    c.rect(xx+20,dy-4,28,18,stroke=1,fill=1); xx+=53
        else:
            dy=y-22; c.setFillColor(GREY)
            for d in detail(g,n):
                for ln in wrap(c,d,"Helvetica",11.5,TASKW):
                    c.setFont("Helvetica",11.5); dy-=14; c.drawString(x,dy,ln)
        y-=h
    c.setStrokeColor(black); c.setLineWidth(1.4); c.line(x,y,x+IW,y)
    c.setStrokeColor(black); c.setLineWidth(1.4); c.line(x,DEAD_TOP,x+IW,DEAD_TOP)
    c.setFillColor(black); c.setFont("Helvetica-Bold",11.5); c.drawString(x,DEAD_TOP-16,"IF YOU DIE")
    c.setFillColor(GREY); c.setFont("Helvetica",10)
    c.drawString(x+68,DEAD_TOP-16,"— fold origami in the dead room.")
    c.setFillColor(black); c.setFont("Helvetica-Bold",11)
    c.drawRightString(x+IW,DEAD_TOP-16,"GREEN 2  ·  BLUE 3")
    gap=(IW-NDEAD*DEADBOX)/(NDEAD-1)
    for i in range(NDEAD):
        c.setLineWidth(1.8); c.setStrokeColor(black); c.setFillColor(white)
        c.rect(x+i*(DEADBOX+gap),DEAD_TOP-30-DEADBOX,DEADBOX,DEADBOX,stroke=1,fill=1)
    c.restoreState()

c=canvas.Canvas("footprints-print-pack/01-index-cards/index-cards.pdf",pagesize=(PW,PH))
o=sorted(CARDS)
for i in range(0,16,2):
    for j,g in enumerate(o[i:i+2]): card(c,j*CW,g)
    c.setStrokeColor(Color(.62,.62,.62)); c.setLineWidth(.6); c.setDash(4,4); c.line(CW,0,CW,PH); c.setDash()
    c.setFont("Helvetica",6.5); c.setFillColor(GREY); c.drawCentredString(CW,8,"cut here")
    c.showPage()
c.save()
worst=[]
for g in sorted(CARDS):
    used=HEADER+COLH+sum(rh(c,g,n) for _,n in CARDS[g]); worst.append(PH-M-used-DEAD_TOP)
    assert PH-M-used>DEAD_TOP, f"group {g} overflows"
    assert sum(PTS[n] for _,n in CARDS[g])==CARD_TOTAL and len(CARDS[g])==6, f"group {g} math"
print(f"all 16 cards fit and total {CARD_TOTAL} pts · min clearance {min(worst):.0f}pt")
