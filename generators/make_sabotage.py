#!/usr/bin/env python3
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import Color, black, white
GREY=Color(.40,.38,.36); LINE=Color(.72,.70,.67)
PW,PH=letter                      # portrait 612 x 792
CH=PH/2                           # two landscape half-letter cards per page

# props pre-assigned to doors so the call sets are guaranteed to span both floors
PROPS=[("FUSE","U1"),("BATTERY","U2"),("KEYCARD","U4"),
       ("O2 TANK","D1"),("WRENCH","D2"),("REACTOR ROD","D3")]
SETS=[("SET 1",["FUSE","KEYCARD","O2 TANK","WRENCH","REACTOR ROD"]),
      ("SET 2",["FUSE","BATTERY","KEYCARD","O2 TANK","REACTOR ROD"]),
      ("SET 3",["BATTERY","KEYCARD","O2 TANK","WRENCH","REACTOR ROD"])]
D={n:d for n,d in PROPS}

def icon(c,name,cx,cy,s):
    c.setLineWidth(4.2); c.setStrokeColor(black); c.setFillColor(white)
    if name=="FUSE":
        c.roundRect(cx-s*.5,cy-s*.22,s,s*.44,s*.1,stroke=1,fill=1)
        c.rect(cx-s*.5,cy-s*.30,s*.10,s*.60,stroke=1,fill=1)
        c.rect(cx+s*.40,cy-s*.30,s*.10,s*.60,stroke=1,fill=1)
        c.setLineWidth(3); c.line(cx-s*.62,cy,cx-s*.5,cy); c.line(cx+s*.5,cy,cx+s*.62,cy)
    elif name=="BATTERY":
        c.roundRect(cx-s*.30,cy-s*.46,s*.60,s*.86,s*.06,stroke=1,fill=1)
        c.rect(cx-s*.11,cy+s*.40,s*.22,s*.10,stroke=1,fill=1)
        c.setLineWidth(3.4)
        c.line(cx-s*.10,cy+s*.14,cx+s*.10,cy+s*.14); c.line(cx,cy+s*.04,cx,cy+s*.24)
        c.line(cx-s*.10,cy-s*.22,cx+s*.10,cy-s*.22)
    elif name=="KEYCARD":
        c.roundRect(cx-s*.52,cy-s*.34,s*1.04,s*.68,s*.07,stroke=1,fill=1)
        c.setFillColor(black); c.rect(cx-s*.52,cy+s*.06,s*1.04,s*.14,stroke=0,fill=1)
        c.setFillColor(white); c.setLineWidth(3.4); c.circle(cx+s*.30,cy-s*.12,s*.10,stroke=1,fill=1)
    elif name=="O2 TANK":
        c.roundRect(cx-s*.26,cy-s*.48,s*.52,s*.80,s*.24,stroke=1,fill=1)
        c.rect(cx-s*.09,cy+s*.32,s*.18,s*.12,stroke=1,fill=1)
        c.setLineWidth(3.4); c.circle(cx,cy+s*.50,s*.11,stroke=1,fill=1)
        c.line(cx+s*.11,cy+s*.50,cx+s*.30,cy+s*.50)
    elif name=="WRENCH":
        p=c.beginPath()
        pts=[(-.08,-.50),(-.08,.08),(-.30,.08),(-.30,.46),(-.12,.46),(-.12,.26),
             (.12,.26),(.12,.46),(.30,.46),(.30,.08),(.08,.08),(.08,-.50)]
        p.moveTo(cx+pts[0][0]*s,cy+pts[0][1]*s)
        for a,b in pts[1:]: p.lineTo(cx+a*s,cy+b*s)
        p.close(); c.drawPath(p,stroke=1,fill=1)
    else:  # REACTOR ROD
        c.roundRect(cx-s*.17,cy-s*.50,s*.34,s*1.00,s*.16,stroke=1,fill=1)
        c.setLineWidth(3.4)
        for k in (-.22,0,.22): c.line(cx-s*.17,cy+s*k,cx+s*.17,cy+s*k)

def prop_card(c,oy,name,door):
    c.saveState(); c.translate(0,oy)
    x=40
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",11)
    c.drawString(x,CH-46,"S A B O T A G E   —   S H I P   S U P P L Y")
    icon(c,name,x+92,CH/2-14,150)
    c.setFillColor(black)
    sz=64
    while c.stringWidth(name,"Helvetica-Bold",sz)>PW-40-(x+200): sz-=2
    c.setFont("Helvetica-Bold",sz); c.drawString(x+200,CH/2+6,name)
    c.setStrokeColor(black); c.setLineWidth(3); c.line(x+200,CH/2-12,PW-40,CH/2-12)
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",13); c.drawString(x+200,CH/2-38,"LIVES AT")
    c.setFillColor(black); c.setFont("Helvetica-Bold",52); c.drawString(x+200,CH/2-90,f"DOOR {door}")
    c.setFillColor(GREY); c.setFont("Helvetica",11)
    c.drawString(x,46,"Only move this when Central Command calls for it. Then bring it straight back here.")
    c.restoreState()

c=canvas.Canvas("footprints-print-pack/08-sabotage/sabotage-supply-props.pdf",pagesize=(PW,PH))
for i in range(0,6,2):
    for j,(n,d) in enumerate(PROPS[i:i+2]): prop_card(c,(1-j)*CH,n,d)
    c.setStrokeColor(Color(.62,.62,.62)); c.setLineWidth(.6); c.setDash(4,4); c.line(40,CH,PW-40,CH); c.setDash()
    c.setFont("Helvetica",6.5); c.setFillColor(GREY); c.drawCentredString(PW/2,CH-9,"cut here")
    c.showPage()
c.save(); print("wrote 08-sabotage/sabotage-supply-props.pdf — 3 pages, 6 props, 2 per page")

# ---------------- Central Command page ----------------
c=canvas.Canvas("footprints-print-pack/08-sabotage/sabotage-central-command.pdf",pagesize=(PW,PH))
M=44; W=PW-2*M; y=PH-M
def head(t,sub=""):
    global y
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",11)
    c.drawString(M,y-12,"C E N T R A L   C O M M A N D")
    c.setFillColor(black); c.setFont("Helvetica-Bold",40); c.drawString(M,y-54,t)
    if sub:
        c.setFillColor(GREY); c.setFont("Helvetica",13); c.drawString(M,y-74,sub)
    c.setStrokeColor(black); c.setLineWidth(3); c.line(M,y-86,PW-M,y-86); y-=104
def sect(t):
    global y
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",9)
    c.drawString(M,y,t); y-=6
    c.setStrokeColor(LINE); c.setLineWidth(.8); c.line(M,y,PW-M,y); y-=16
def line(t,bold=False,size=12,ind=0,col=None):
    global y
    c.setFillColor(col or black); c.setFont("Helvetica-Bold" if bold else "Helvetica",size)
    c.drawString(M+ind,y,t); y-=size+4.5

head("SABOTAGE: LIGHTS OUT","The imposters' Mission Critical. Read this page out loud, top to bottom.")
sect("WHERE THE PROPS LIVE — they never move except during a Sabotage")
c.setFont("Helvetica-Bold",13)
for i,(n,d) in enumerate(PROPS):
    col=i%3; row=i//3
    xx=M+col*(W/3)
    c.setFillColor(black); c.setFont("Helvetica-Bold",13); c.drawString(xx,y-row*20,n)
    c.setFillColor(GREY);  c.setFont("Helvetica-Bold",13); c.drawRightString(xx+W/3-24,y-row*20,d)
y-=48
sect("PICK A SET AND READ IT ALOUD — each one spans both floors")
for nm,items in SETS:
    c.setFillColor(black); c.setFont("Helvetica-Bold",12); c.drawString(M,y,nm)
    c.setFont("Helvetica",12)
    c.drawString(M+50,y," · ".join(f"{i} ({D[i]})" for i in items)); y-=19
y-=6
sect("THE CALL")
line("“LIGHTS. Nobody runs. Bring me five supplies:”", True, 13)
line("“[read the set] — ONE ITEM PER PERSON. Five items, five different people.”", True, 13)
line("“You have TWO MINUTES. Go.”", True, 13)
y-=4
line("Then start the two-minute count out loud at 90, 60, 30 and 10 seconds.", False, 11.5, 0, GREY)
y-=10
sect("OUTCOMES — mark these on the whiteboard and the round clock")
line("SUCCEED   All five on the desk inside two minutes", True, 12.5)
line("+1:00 on the round clock. Lights back up.", False, 12, 22, GREY)
y-=4
line("FAIL   Two minutes gone, or two items from the same pair of hands", True, 12.5)
line("+2 deaths on the whiteboard and −1:30 off the round clock. The round does NOT end.", False, 12, 22, GREY)
y-=12
sect("LIMITS")
line("Two Sabotage events per round. None in the first two minutes.", False, 12)
line("Any counselor can be tapped to trigger it — not just the Roaming Referee.", False, 12)
line("The tapped counselor waits about five seconds, then starts dimming. Others join in.", False, 12)
y-=8
sect("SAFETY — say the first line out loud before the first Sabotage of the night")
line("Lights DIM, never off. One counselor stands at the stairs and does nothing else.", True, 12)
line("Flashlights to the stair counselor and the Ghost Guide.", False, 12)
line("During Sabotage only, running costs you a stamp — crossed out on the spot.", False, 12)
y-=8
sect("RESET — do this before play resumes")
line("Hand the five props to five students and send them to re-place them.", False, 12)
line("Every prop has its door printed on it, so nobody has to remember.", False, 12, 0, GREY)
c.setFillColor(GREY); c.setFont("Helvetica",9.5)
c.drawCentredString(PW/2,46,"AMONG US: FOOTPRINTS EDITION  —  keep this page on the Central Command clipboard")
c.save(); print("wrote 08-sabotage/sabotage-central-command.pdf — 1 page")
