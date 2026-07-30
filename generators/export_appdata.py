#!/usr/bin/env python3
"""App data = the printed artifacts, read back and re-verified."""
import subprocess, re, tempfile, os, json
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
puzzles={}
for pg in words('footprints-print-pack/02-sudoku/sudoku-puzzles.pdf'):
    for qx,qy,gx,gtop in [(0,0,54,80),(1,0,342,80),(0,1,54,458),(1,1,342,458)]:
        qw=[w for w in pg if (w[0]>=306)==(qx==1) and (w[1]>=396)==(qy==1)]
        n=int([w[4] for w in qw if w[4].startswith('#')][0][1:])
        grid=[0]*16
        for x0,y0,x1,y1,t in qw:
            if re.fullmatch(r'[1-4]',t) and (y1-y0)>14:
                grid[4*int((((y0+y1)/2)-gtop)//54)+int((((x0+x1)/2)-gx)//54)]=int(t)
        puzzles[n]=grid
answers={}
for pg in words('footprints-print-pack/02-sudoku/sudoku-answers.pdf'):
    for w in pg:
        if re.fullmatch(r'#\d+',w[4]):
            n=int(w[4][1:]); col=int((w[0]-40)//133); r=round((w[1]-83)/158)
            gx=40+col*133+18.5; gtop=100+r*158
            cells=[0]*16
            for x0,y0,x1,y1,t in pg:
                if re.fullmatch(r'[1-4]',t) and 6.5<(y1-y0)<13 and gx-3<=x0<gx+96 and gtop-2<=y0<gtop+96:
                    cells[4*int((((y0+y1)/2)-gtop)//24)+int((((x0+x1)/2)-gx)//24)]=int(t)
            answers[n]=cells
assert sorted(puzzles)==list(range(1,81))==sorted(answers)
for n in range(1,81):
    assert count_solutions(puzzles[n])==1
    assert all(p==0 or p==a for p,a in zip(puzzles[n],answers[n]))
spec=json.load(open('cardspec32.json'))
data={
 "doors":spec['doors'],
 "code":{d:{k:v for k,v in spec['code'][d].items()} for d in spec['doors']},
 "verses":spec['verse_triples'], "gospel":spec['gospel'], "ball":spec['dir'],
 "cards":spec['cards'],
 "sudoku":{str(n):{"p":puzzles[n],"a":answers[n]} for n in range(1,81)},
 "props":{"FUSE":"U1","BATTERY":"U2","KEYCARD":"U4","O2 TANK":"D1","WRENCH":"D2","REACTOR ROD":"D3"},
 "sets":{"1":["FUSE","KEYCARD","O2 TANK","WRENCH","REACTOR ROD"],
         "2":["FUSE","BATTERY","KEYCARD","O2 TANK","REACTOR ROD"],
         "3":["BATTERY","KEYCARD","O2 TANK","WRENCH","REACTOR ROD"]}}
json.dump(data,open('companion/appdata.json','w'),separators=(',',':'))
print(f"appdata.json written — sudoku 80/80 re-verified from the PDFs · {len(data['code']['U1'])} groups · size {os.path.getsize('companion/appdata.json')//1024}KB")
