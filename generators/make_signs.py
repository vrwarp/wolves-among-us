#!/usr/bin/env python3
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.colors import Color, black
GREY=Color(.40,.38,.36)
PW,PH=landscape(letter)
SIGNS=[
 ("CUP STACK","2 PTS","Build all 15 cups.","Reset the lane before you leave."),
 ("APPLE STACK","2 PTS","3 apples, freestanding.","They must stand for 3 full seconds."),
 ("FLIGHT ZONE","3 PTS","Make a plane that flies past the far line.","Throw from the near line. Unlimited tries."),
 ("SUDOKU","2 PTS","Take ONE numbered slip.","Solve it, then show any counselor."),
 ("MAZE","2 PTS","Take ONE maze slip.","Solve it, then show any counselor."),
 ("BIBLE TABLE","3 PTS","Look up the verses on your card.","Write down the PAGE NUMBER for each."),
 ("GOSPEL & THEME","1 PT","Your card gives you a word.","Find the card that finishes it."),
 ("DEAD ROOM","GHOSTS ONLY","Fold origami. One sheet at a time.","GREEN 2  ·  BLUE 3      Stay quiet."),
 ("SPECIAL DELIVERY","2 PTS","Take a red ball to the other station.","No ball here? Bring one back from there instead."),
]
def fit(c,txt,maxw,start=150):
    sz=start
    while sz>28 and c.stringWidth(txt,"Helvetica-Bold",sz)>maxw: sz-=2
    return sz
c=canvas.Canvas("footprints-print-pack/06-signs/station-signs.pdf",pagesize=(PW,PH))
for title,pts,l1,l2 in SIGNS:
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",15)
    c.drawString(46,PH-56,"A M O N G   U S   —   F O O T P R I N T S")
    c.setFillColor(black)
    sz=fit(c,title,PW-92)
    c.setFont("Helvetica-Bold",sz); c.drawString(44,PH-72-sz*0.78,title)
    ybase=PH-86-sz*0.78
    c.setStrokeColor(black); c.setLineWidth(4); c.line(44,ybase,PW-44,ybase)
    c.setFillColor(black); c.setFont("Helvetica-Bold",70); c.drawString(48,ybase-92,pts)
    c.setFillColor(black); c.setFont("Helvetica-Bold",30); c.drawString(48,ybase-160,l1)
    c.setFillColor(GREY);  c.setFont("Helvetica",26);      c.drawString(48,ybase-200,l2)
    c.showPage()
c.save(); print(f"wrote 06-signs/station-signs.pdf — {len(SIGNS)} pages, landscape Letter")
for t,*_ in SIGNS: print("  ·",t)
