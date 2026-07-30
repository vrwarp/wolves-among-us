#!/usr/bin/env python3
"""Task cards. Every mark stays >=0.5in from every page edge."""
import json
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.colors import Color, black, white
s=json.load(open('cardspec32.json'))
CARDS={int(k):[tuple(x) for x in v] for k,v in s['cards'].items()}
VT={int(k):[tuple(x) for x in v] for k,v in s['verse_triples'].items()}
DIR={int(k):v for k,v in s['dir'].items()}; GOS={int(k):v for k,v in s['gospel'].items()}
DOORS=s['doors']; NG=s['groups']
PTS={'I Can Fly':3,'Verse Order':3,'Cup Stack':2,'Apple Stack':2,'Simple Maze':2,'Sudoku':2,
     'Special Delivery':2,'Doors':1,'Gospel & Theme':1}
RENAME={'Verse Order':'Find the Verse'}
GREY=Color(.40,.38,.36); LINE=Color(.80,.78,.75)
PW,PH=landscape(letter)          # 792 x 612
SAFE=40                          # 0.56in from every page edge
CUT=PW/2
IW=CUT-SAFE-16                   # 340pt of content per card
TOP=PH-SAFE; BOT=SAFE
TASKW=212; PTSX=226; BOXX=262; BOX=44
HEADER=42; COLH=14; MINROW=50; DOORROW=80
DEAD_TOP=112; DEADBOX=42; NDEAD=6
def detail(g,n):
    if n=='I Can Fly':        return ["Stage — get it past the far line.","Unlimited tries."]
    if n=='Apple Stack':      return ["Stage — 3 apples, standing 3 seconds."]
    if n=='Cup Stack':        return ["Stage — 15 cups, then reset the lane."]
    if n in ('Simple Maze','Sudoku'): return ["Take a sheet, solve it, show a counselor."]
    if n=='Special Delivery': return [f"Red ball, {DIR[g]}."]
    if n=='Gospel & Theme':   return [f"Your word is {GOS[g].upper()}.","Find the box it completes."]
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
    if n=='Verse Order': return 22+14+3*20
    if n=='Doors': return DOORROW
    lines=sum(len(wrap(c,d,"Helvetica",11.5,TASKW)) for d in detail(g,n))
    return max(MINROW,22+14*max(1,lines)+10)
def card(c,x0,g):
    x=x0; y=TOP
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",7.5)
    c.drawString(x,y-9,"A M O N G   U S   —   F O O T P R I N T S   E D I T I O N")
    c.setFillColor(black); c.setFont("Helvetica-Bold",12.5); c.drawString(x,y-26,"YOUR TASK CARD")
    c.setFont("Helvetica-Bold",32); c.drawRightString(x+IW,y-26,str(g))
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",7); c.drawRightString(x+IW,y-35,"GROUP")
    y-=HEADER
    c.setStrokeColor(black); c.setLineWidth(1.4); c.line(x,y,x+IW,y)
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",7.5)
    c.drawString(x,y-10,"TASK"); c.drawCentredString(x+PTSX+11,y-10,"PTS")
    c.drawCentredString(x+BOXX+BOX/2,y-10,"COUNSELOR")
    y-=COLH
    for tier,n in CARDS[g]:
        h=rh(c,g,n)
        c.setStrokeColor(LINE); c.setLineWidth(.7); c.line(x,y,x+IW,y)
        c.setFillColor(black); c.setFont("Helvetica-Bold",14); c.drawString(x,y-17,RENAME.get(n,n))
        c.setFont("Helvetica-Bold",15.5); c.drawCentredString(x+PTSX+11,y-17,str(PTS[n]))
        c.setLineWidth(1.8); c.setStrokeColor(black); c.setFillColor(white)
        c.rect(x+BOXX,y-5-BOX,BOX,BOX,stroke=1,fill=1)
        if n=='Verse Order':
            c.setFillColor(GREY); c.setFont("Helvetica",10)
            c.drawString(x,y-31,"Look each one up in a pew Bible. Write the page.")
            dy=y-31
            for ref,page in VT[g]:
                dy-=20
                c.setFillColor(black); c.setFont("Helvetica-Bold",11); c.drawString(x,dy,ref)
                c.setStrokeColor(black); c.setLineWidth(1.1); c.setFillColor(white)
                c.rect(x+112,dy-4,38,17,stroke=1,fill=1)
        elif n=='Doors':
            c.setFillColor(GREY); c.setFont("Helvetica",10)
            c.drawString(x,y-31,f"Row {g} — all 7 doors. Copy BOTH letters at each.")
            for li,row in enumerate((DOORS[:4],DOORS[4:])):
                dy=y-53-li*21; xx=x
                for d in row:
                    c.setFillColor(black); c.setFont("Helvetica-Bold",11); c.drawString(xx,dy,d)
                    c.setStrokeColor(black); c.setLineWidth(1.1); c.setFillColor(white)
                    c.rect(xx+19,dy-4,34,17,stroke=1,fill=1); xx+=61
        else:
            dy=y-21; c.setFillColor(GREY)
            for d in detail(g,n):
                for ln in wrap(c,d,"Helvetica",11.5,TASKW):
                    c.setFont("Helvetica",11.5); dy-=14; c.drawString(x,dy,ln)
        y-=h
    c.setStrokeColor(black); c.setLineWidth(1.4); c.line(x,y,x+IW,y)
    c.line(x,DEAD_TOP,x+IW,DEAD_TOP)
    c.setFillColor(black); c.setFont("Helvetica-Bold",11); c.drawString(x,DEAD_TOP-15,"IF YOU DIE")
    c.setFillColor(GREY); c.setFont("Helvetica",9.5)
    c.drawString(x+64,DEAD_TOP-15,"— fold origami in the dead room.")
    c.setFillColor(black); c.setFont("Helvetica-Bold",10.5)
    c.drawRightString(x+IW,DEAD_TOP-15,"GREEN 2  ·  BLUE 3")
    gap=(IW-NDEAD*DEADBOX)/(NDEAD-1)
    for i in range(NDEAD):
        c.setLineWidth(1.8); c.setStrokeColor(black); c.setFillColor(white)
        c.rect(x+i*(DEADBOX+gap),DEAD_TOP-27-DEADBOX,DEADBOX,DEADBOX,stroke=1,fill=1)
    return y
def build(path,order,note=None):
    c=canvas.Canvas(path,pagesize=(PW,PH)); worst=1e9
    for i in range(0,len(order),2):
        for j,g in enumerate(order[i:i+2]):
            if g: worst=min(worst,card(c,SAFE+j*(CUT-SAFE+16),g))
        # cut guide stays inside the printable area
        c.setStrokeColor(Color(.6,.6,.6)); c.setLineWidth(.6); c.setDash(4,4)
        c.line(CUT,SAFE,CUT,PH-SAFE); c.setDash()
        c.setFont("Helvetica",6.5); c.setFillColor(GREY)
        c.drawString(CUT+6,SAFE+2,"cut here")
        if note: c.drawString(SAFE,SAFE+4,note(i//2))
        c.showPage()
    c.save(); return worst
uniq=list(range(1,NG+1))
w1=build("footprints-print-pack/01-index-cards/index-cards-32-unique.pdf",uniq)
w2=build("footprints-print-pack/01-index-cards/index-cards-96-deck.pdf",uniq*3,
         note=lambda p:f"deck {p//16+1}")
assert w1>DEAD_TOP, f"rows collide with the dead band by {DEAD_TOP-w1:.0f}pt"
assert all(sum(PTS[n] for _,n in CARDS[g])==11 for g in CARDS)
print(f"cards rebuilt · content inset {SAFE}pt = {SAFE/72:.2f}in from every page edge · min clearance {w1-DEAD_TOP:.0f}pt")
