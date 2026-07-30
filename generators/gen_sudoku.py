#!/usr/bin/env python3
"""80 unique 4x4 sudokus, solver-verified, numbered, print- and cut-safe."""
import random, itertools
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import Color, black, white

# ---------- enumerate all 288 valid 4x4 solution grids ----------
def boxes(g):
    return [[g[0],g[1],g[4],g[5]],[g[2],g[3],g[6],g[7]],
            [g[8],g[9],g[12],g[13]],[g[10],g[11],g[14],g[15]]]
def valid(g):
    for i in range(4):
        if sorted(g[4*i:4*i+4])!=[1,2,3,4]: return False
        if sorted(g[i::4])!=[1,2,3,4]: return False
    return all(sorted(b)==[1,2,3,4] for b in boxes(g))
ALL=[]
for p in itertools.permutations([1,2,3,4]):
    def fill(g):
        if len(g)==16:
            if valid(g): ALL.append(tuple(g))
            return
        r=len(g)//4
        for v in (1,2,3,4):
            c=len(g)%4
            if v in g[4*r:]: continue
            if v in g[c::4]: continue
            g.append(v); fill(g); g.pop()
    fill(list(p))
assert len(ALL)==288, len(ALL)

# ---------- solver: count solutions (early exit at 2) ----------
def count_solutions(p):
    g=list(p); n=[0]
    def bt(i):
        if n[0]>=2: return
        if i==16:
            n[0]+=1; return
        if g[i]: bt(i+1); return
        r,c=divmod(i,4); br,bc=(r//2)*2,(c//2)*2
        box=[g[4*rr+cc] for rr in (br,br+1) for cc in (bc,bc+1)]
        for v in (1,2,3,4):
            if v in g[4*r:4*r+4] or v in g[c::4] or v in box: continue
            g[i]=v; bt(i+1); g[i]=0
        g[i]=0
    bt(0); return n[0]

# ---------- carve a unique puzzle with exactly `target` givens ----------
rng=random.Random(20260730)
def carve(sol,target):
    for _ in range(60):
        g=list(sol); order=list(range(16)); rng.shuffle(order)
        for i in order:
            if 16-g.count(0)<=target: break
            keep=g[i]; g[i]=0
            if count_solutions(g)!=1: g[i]=keep
        if 16-g.count(0)==target: return tuple(g)
    return None

sols=rng.sample(ALL,80)
targets=[]
for s in range(20):
    t=[4,5,5,6]; rng.shuffle(t); targets+=t
puzzles=[]
for sol,t in zip(sols,targets):
    p=carve(sol,t)
    if p is None:                      # rare: this grid can't reach t uniquely
        for t2 in (t+1,t+2):
            p=carve(sol,t2)
            if p: break
    assert p, "carve failed"
    puzzles.append(p)

# ---------- acceptance checks ----------
from collections import Counter
assert len(set(puzzles))==80 and len(set(sols))==80
assert all(count_solutions(p)==1 for p in puzzles)
assert all(valid(list(s)) for s in sols)
for p,s in zip(puzzles,sols):
    assert all(pv==0 or pv==sv for pv,sv in zip(p,s))
giv=Counter(16-p.count(0) for p in puzzles)
assert set(giv)<= {4,5,6}
print("ACCEPTANCE — sudoku")
print(f"  [x] 80 puzzles from 80 distinct solution grids (of 288 possible) — all distinct")
print(f"  [x] every puzzle solver-verified: exactly ONE solution")
print(f"  [x] givens 4–6, mix per sheet: distribution {dict(sorted(giv.items()))}")
print(f"  [x] every stored solution independently re-validated")

# ---------- puzzle sheets: 4 per page, quartered by cut lines ----------
GREY=Color(.40,.38,.36); LINE=Color(.62,.62,.62)
PW,PH=letter; SAFE=40; CUTIN=22; GS=216; CELL=GS/4
def draw_grid(c,x,y,vals,gs,lw=(2.4,1.8,.8),fs=28,dy=None):
    cell=gs/4
    c.setFillColor(white); c.setStrokeColor(black)
    c.setLineWidth(lw[0]); c.rect(x,y,gs,gs,stroke=1,fill=1)
    for i in (1,2,3):
        c.setLineWidth(lw[1] if i==2 else lw[2])
        c.line(x+i*cell,y,x+i*cell,y+gs); c.line(x,y+i*cell,x+gs,y+i*cell)
    c.setFillColor(black); c.setFont("Helvetica-Bold",fs)
    off=dy if dy is not None else fs*0.36
    for i,v in enumerate(vals):
        if v:
            r,cc=divmod(i,4)
            c.drawCentredString(x+cc*cell+cell/2, y+gs-(r*cell+cell/2)-off, str(v))

c=canvas.Canvas("footprints-print-pack/02-sudoku/sudoku-puzzles.pdf",pagesize=(PW,PH))
cutx,cuty=PW/2,PH/2
for s in range(20):
    quads=[(SAFE,cutx-CUTIN,cuty+CUTIN,PH-SAFE),(cutx+CUTIN,PW-SAFE,cuty+CUTIN,PH-SAFE),
           (SAFE,cutx-CUTIN,SAFE,cuty-CUTIN),(cutx+CUTIN,PW-SAFE,SAFE,cuty-CUTIN)]
    for q,(x0,x1,y0,y1) in enumerate(quads):
        n=s*4+q+1; p=puzzles[n-1]
        gx=x0+((x1-x0)-GS)/2
        c.setFillColor(black); c.setFont("Helvetica-Bold",21)
        c.drawString(gx,y1-24,f"#{n}")
        c.setFillColor(GREY); c.setFont("Helvetica",8.5)
        c.drawString(gx+52,y1-22,"1–4 in every row, column and box")
        draw_grid(c,gx,y1-40-GS,p,GS)
    c.setStrokeColor(LINE); c.setLineWidth(.6); c.setDash(4,4)
    c.line(cutx,SAFE,cutx,PH-SAFE); c.line(SAFE,cuty,PW-SAFE,cuty); c.setDash()
    c.setFillColor(GREY); c.setFont("Helvetica",6.5)
    c.drawString(cutx+5,SAFE+2,"cut"); c.drawString(SAFE+2,cuty+5,"cut")
    c.setFont("Helvetica",7)
    c.drawRightString(PW-SAFE,SAFE+2,f"sheet {s+1} of 20 · puzzles {s*4+1}–{s*4+4}")
    c.showPage()
c.save()
print(f"\nwrote 02-sudoku/sudoku-puzzles.pdf — 20 sheets, 4 per sheet, cut into quarters")
print(f"  grid {GS/72:.1f}in square · every quarter keeps ≥{CUTIN/72:.2f}in from the cut and ≥{SAFE/72:.2f}in from paper edges")

# ---------- answer sheets: 16 per page ----------
c=canvas.Canvas("footprints-print-pack/02-sudoku/sudoku-answers.pdf",pagesize=(PW,PH))
GS2=96
for pg in range(5):
    lo,hi=pg*16+1,pg*16+16
    c.setFillColor(black); c.setFont("Helvetica-Bold",20)
    c.drawString(SAFE,PH-58,"SUDOKU — ANSWER KEY")
    c.setFillColor(GREY); c.setFont("Helvetica",10.5)
    c.drawRightString(PW-SAFE,PH-56,f"puzzles {lo}–{hi} · numbers match the slips")
    c.setStrokeColor(black); c.setLineWidth(1.4); c.line(SAFE,PH-68,PW-SAFE,PH-68)
    colw=(PW-2*SAFE)/4; rowh=158
    for i in range(16):
        n=lo+i; col,r=i%4,i//4
        x=SAFE+col*colw+(colw-GS2)/2; ytop=PH-92-r*rowh
        c.setFillColor(black); c.setFont("Helvetica-Bold",11.5)
        c.drawString(x,ytop,f"#{n}")
        draw_grid(c,x,ytop-8-GS2,sols[n-1],GS2,lw=(1.6,1.2,.5),fs=13,dy=4.5)
    c.setFillColor(GREY); c.setFont("Helvetica",7)
    c.drawRightString(PW-SAFE,SAFE+2,f"answer sheet {pg+1} of 5")
    c.showPage()
c.save()
print(f"wrote 02-sudoku/sudoku-answers.pdf — 5 sheets, 16 per sheet")
