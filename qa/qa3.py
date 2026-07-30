#!/usr/bin/env python3
"""Sudoku end-to-end: read digits off the rendered PDFs, re-solve every puzzle."""
import subprocess, re, tempfile, os
def words(path):
    with tempfile.TemporaryDirectory() as td:
        out=os.path.join(td,'o.xml')
        subprocess.run(['pdftotext','-bbox',path,out],check=True)
        xml=open(out).read()
    return [ [(float(a),float(b),float(c),float(d),t) for a,b,c,d,t in
              re.findall(r'<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">(.*?)</word>',p)]
            for p in re.findall(r'<page[^>]*>(.*?)</page>',xml,re.S)]

def count_solutions(g):
    g=list(g); n=[0]
    def bt(i):
        if n[0]>=2: return
        if i==16: n[0]+=1; return
        if g[i]: bt(i+1); return
        r,c=divmod(i,4); br,bc=(r//2)*2,(c//2)*2
        box=[g[4*rr+cc] for rr in (br,br+1) for cc in (bc,bc+1)]
        for v in (1,2,3,4):
            if v in g[4*r:4*r+4] or v in g[c::4] or v in box: continue
            g[i]=v; bt(i+1); g[i]=0
        g[i]=0
    bt(0); return n[0]
def solve(g):
    g=list(g)
    def bt(i):
        if i==16: return True
        if g[i]: return bt(i+1)
        r,c=divmod(i,4); br,bc=(r//2)*2,(c//2)*2
        box=[g[4*rr+cc] for rr in (br,br+1) for cc in (bc,bc+1)]
        for v in (1,2,3,4):
            if v in g[4*r:4*r+4] or v in g[c::4] or v in box: continue
            g[i]=v
            if bt(i+1): return True
            g[i]=0
        return False
    bt(0); return tuple(g)

# ---- read puzzles ----
GS=216; CELL=54
puzzles={}
for pg in words('footprints-print-pack/02-sudoku/sudoku-puzzles.pdf'):
    for qx,qy,gx,gtop in [(0,0,54,80),(1,0,342,80),(0,1,54,458),(1,1,342,458)]:
        qw=[w for w in pg if (w[0]>=306)==(qx==1) and (w[1]>=396)==(qy==1)]
        num=[w[4] for w in qw if w[4].startswith('#')]
        n=int(num[0][1:])
        grid=[0]*16
        for x0,y0,x1,y1,t in qw:
            if re.fullmatch(r'[1-4]',t) and (y1-y0)>14:
                c=int((((x0+x1)/2)-gx)//CELL); r=int((((y0+y1)/2)-gtop)//CELL)
                assert 0<=r<4 and 0<=c<4, (n,r,c)
                grid[4*r+c]=int(t)
        puzzles[n]=tuple(grid)
assert sorted(puzzles)==list(range(1,81))
# ---- read answers ----
GS2=96; C2=24
answers={}
for pi,pg in enumerate(words('footprints-print-pack/02-sudoku/sudoku-answers.pdf')):
    for w in pg:
        if w[4].startswith('#') and re.fullmatch(r'#\d+',w[4]):
            n=int(w[4][1:]); col=int((w[0]-40)//133); r=round((w[1]-83)/158)
            gx=40+col*133+18.5; gtop=792-(792-92-r*158-8)   # = 100+r*158
            cells=[0]*16
            for x0,y0,x1,y1,t in pg:
                if re.fullmatch(r'[1-4]',t) and 6.5<(y1-y0)<13 and gx-3<=x0<gx+GS2 and gtop-2<=y0<gtop+GS2:
                    cc=int((((x0+x1)/2)-gx)//C2); rr=int((((y0+y1)/2)-gtop)//C2)
                    cells[4*rr+cc]=int(t)
            answers[n]=tuple(cells)
assert sorted(answers)==list(range(1,81)), f"answers found: {len(answers)}"

# ---- verify ----
def valid(g):
    for i in range(4):
        if sorted(g[4*i:4*i+4])!=[1,2,3,4] or sorted(g[i::4])!=[1,2,3,4]: return False
    return all(sorted([g[0],g[1],g[4],g[5]][k] for k in range(4))==[1,2,3,4] for b in [0]) and \
           all(sorted(b)==[1,2,3,4] for b in
               ([g[0],g[1],g[4],g[5]],[g[2],g[3],g[6],g[7]],[g[8],g[9],g[12],g[13]],[g[10],g[11],g[14],g[15]]))
u=v=m=e=0; giv={}
for n in range(1,81):
    p,a=puzzles[n],answers[n]
    giv[16-p.count(0)]=giv.get(16-p.count(0),0)+1
    if count_solutions(p)==1: u+=1
    if valid(a): v+=1
    if all(pv==0 or pv==av for pv,av in zip(p,a)): m+=1
    if solve(p)==a: e+=1
dup=80-len(set(puzzles.values())), 80-len(set(answers.values()))
print("SUDOKU END-TO-END — read back from the printed pages themselves")
print(f"  [{'x' if u==80 else ' '}] exactly one solution:           {u}/80")
print(f"  [{'x' if v==80 else ' '}] printed answer is a valid grid: {v}/80")
print(f"  [{'x' if m==80 else ' '}] answer agrees with its givens:  {m}/80")
print(f"  [{'x' if e==80 else ' '}] answer IS the unique solution:  {e}/80")
print(f"  [{'x' if dup==(0,0) else ' '}] duplicates: {dup[0]} puzzles, {dup[1]} answers")
print(f"  givens distribution: {dict(sorted(giv.items()))}")
assert u==v==m==e==80 and dup==(0,0)
print("  ALL PASS")
