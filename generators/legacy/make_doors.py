#!/usr/bin/env python3
import json, random
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.colors import Color, black, white

# safe alphabet: no I/1, O/0, B/8, G/6, S/5, Z/2, Q (reads as O at a glance)
ALPHA=list("ACDEFHJKLMNPRTUVWXY")
DOORS=["U1","U2","U3","U4","D1","D2","D3"]
rng=random.Random(20260730)
# each door gets 16 DISTINCT characters -> at any one door, no two groups share a character
# each door: 16 distinct chars (no two groups share at a door)
# each group: 7 distinct chars across the doors (a repeat means the student mis-copied)
def build():
    for _ in range(2000):
        CODE={d:{} for d in DOORS}; used={g:set() for g in range(1,17)}; ok=True
        for d in DOORS:
            taken=set()
            for g in sorted(range(1,17), key=lambda g:-len(used[g])):
                opts=[ch for ch in ALPHA if ch not in taken and ch not in used[g]]
                if not opts: ok=False; break
                ch=rng.choice(opts); CODE[d][g]=ch; taken.add(ch); used[g].add(ch)
            if not ok: break
        if ok: return CODE
    raise SystemExit("no assignment found")
CODE=build()
json.dump(CODE,open('doorcodes.json','w'),indent=1)

print("DOOR CODE CHECKS")
print(f"  alphabet: {''.join(ALPHA)}  ({len(ALPHA)} chars, no I 1 O 0 B 8 G 6 S 5 Z 2 Q)")
for d in DOORS:
    v=list(CODE[d].values()); assert len(set(v))==16
print(f"  [x] all 7 doors: 16 distinct characters each -> no two groups share a character at any door")
same=[(g,d1,d2) for g in range(1,17) for i,d1 in enumerate(DOORS) for d2 in DOORS[i+1:] if CODE[d1][g]==CODE[d2][g]]
assert not same
print(f"  [x] each group's 7 letters are all different -> a repeated letter means the student mis-copied")
print(f"  [x] no cell uses I, 1, O or 0")

GREY=Color(.40,.38,.36); LINE=Color(.72,.70,.67)
PW,PH=landscape(letter)

def door_sheet(c,d):
    floor="UPSTAIRS" if d[0]=="U" else "DOWNSTAIRS"
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",13)
    c.drawString(40,PH-52,f"{floor}  ·  AMONG US: FOOTPRINTS")
    c.setFillColor(black); c.setFont("Helvetica-Bold",104)
    c.drawString(36,PH-140,f"DOOR {d}")
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",17)
    c.drawRightString(PW-40,PH-120,"Find YOUR GROUP NUMBER.")
    c.drawRightString(PW-40,PH-142,"Copy the letter next to it.")
    c.setStrokeColor(black); c.setLineWidth(2.5); c.line(36,PH-160,PW-36,PH-160)
    top=PH-186; rowh=50; colw=(PW-100)/2
    for i in range(16):
        g=i+1; col=i//8; r=i%8
        x=40+col*(colw+20); y=top-r*rowh
        c.setStrokeColor(LINE); c.setLineWidth(.8); c.line(x,y-rowh+8,x+colw-20,y-rowh+8)
        c.setFillColor(GREY); c.setFont("Helvetica-Bold",11); c.drawString(x,y-16,"GROUP")
        c.setFillColor(black); c.setFont("Helvetica-Bold",34); c.drawString(x+52,y-26,str(g))
        c.setStrokeColor(black); c.setLineWidth(2); c.setFillColor(white)
        c.rect(x+colw-118,y-40,84,44,stroke=1,fill=1)
        c.setFillColor(black); c.setFont("Helvetica-Bold",36)
        c.drawCentredString(x+colw-76,y-32,CODE[d][g])
    c.setFillColor(GREY); c.setFont("Helvetica",9)
    c.drawCentredString(PW/2,13,"Tape all four corners.  ·  Do not remove this sheet.")

c=canvas.Canvas("footprints-print-pack/05-doors/door-code-sheets.pdf",pagesize=(PW,PH))
for d in DOORS: door_sheet(c,d); c.showPage()
c.save()
print(f"\nwrote 05-doors/door-code-sheets.pdf — {len(DOORS)} pages, landscape Letter")
print("  (the sheet IS the door sign: 'DOOR U1' at 104pt reads across a hallway,")
print("   so the 7 separate door ID signs in the brief are no longer needed)")
