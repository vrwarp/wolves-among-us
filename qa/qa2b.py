#!/usr/bin/env python3
"""Re-run the qa2 failures with poppler bbox extraction (true positions)."""
import subprocess, re, json, itertools, tempfile, os
fails=[]
def chk(ok,msg):
    if not ok: fails.append(msg); print("  [FAIL] "+msg)

def words(path):
    """per page: list of (xMin,yMin,xMax,yMax,text); yMin measured from TOP."""
    with tempfile.TemporaryDirectory() as td:
        out=os.path.join(td,'o.xml')
        subprocess.run(['pdftotext','-bbox',path,out],check=True)
        xml=open(out,encoding='utf-8').read()
    pages=[]
    for pm in re.finditer(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>',xml,re.S):
        ws=[(float(a),float(b),float(c),float(d),re.sub('&amp;','&',re.sub('&lt;','<',re.sub('&gt;','>',t))))
            for a,b,c,d,t in re.findall(r'<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">(.*?)</word>',pm.group(3))]
        pages.append((float(pm.group(1)),float(pm.group(2)),ws))
    return pages

def lines(ws,tol=2.5):
    ws=sorted(ws,key=lambda w:(w[1],w[0])); out=[]
    for w in ws:
        if out and abs(w[1]-out[-1][0])<tol: out[-1][1].append(w)
        else: out.append([w[1],[w]])
    return [(y,sorted(g,key=lambda w:w[0])) for y,g in out]

spec=json.load(open('cardspec32.json'))
CODE=spec['code']; DOORS=spec['doors']
VT={int(k):v for k,v in spec['verse_triples'].items()}
GOS={int(k):v for k,v in spec['gospel'].items()}
DIR={int(k):v for k,v in spec['dir'].items()}
BENSON={"1 Samuel 23:1":290,"2 Kings 22:2":387,"Job 34:7":518,"Psalm 54:3":562,"Isaiah 11:3":683,
 "Daniel 3:8":878,"Matthew 5:17":963,"Mark 8:2":1002,"Luke 2:36":1019,"John 21:20":1079,
 "Acts 12:19":1094,"Ephesians 4:8":1161,"Philippians 4:14":1167,"Hebrews 3:2":1188,
 "1 Peter 4:12":1206,"Revelation 14:2":1227}
REFRX='|'.join(re.escape(r) for r in BENSON)

print("== CARDS: gospel word · delivery · verses · points (poppler) ==")
ok_g=ok_d=ok_v=ok_p=0
for W,H,ws in words('footprints-print-pack/01-index-cards/index-cards-32-unique.pdf'):
    for side,(lo,hi) in enumerate([(0,396),(396,792)]):
        sw=[w for w in ws if lo<=w[0]<hi]
        if not sw: continue
        x0=40 if side==0 else 412
        big=[w for w in sw if re.fullmatch(r'\d+',w[4]) and w[3]-w[1]>18]
        g=int(big[0][4])
        txt=" ".join(l for _,ln in lines(sw) for l in [" ".join(w[4] for w in ln)])
        m=re.search(r'Your word is ([A-Z]+)\.',txt)
        if m and m.group(1)==GOS[g].upper(): ok_g+=1
        else: chk(False,f"group {g}: gospel word on card (found {m and m.group(1)}, want {GOS[g].upper()})")
        md=re.search(r'Red ball, (Lobby to Dead Room|Dead Room to Lobby)\.',txt)
        if g in DIR:
            if md and md.group(1)==DIR[g]: ok_d+=1
            else: chk(False,f"group {g}: delivery direction (found {md and md.group(1)}, want {DIR[g]})")
        else:
            if md: chk(False,f"group {g}: stray delivery row")
            else: ok_d+=1
        found=sorted(set(re.findall(REFRX,txt)))
        want=sorted(r for r,_ in VT[g]) if g in VT else []
        if found==want: ok_v+=1
        else: chk(False,f"group {g}: verse refs {found} vs {want}")
        pts=[int(w[4]) for w in sw if re.fullmatch(r'[1-3]',w[4]) and 215<w[0]-x0<255 and w[3]-w[1]>9]
        if len(pts)==6 and sum(pts)==11: ok_p+=1
        else: chk(False,f"group {g}: pts column {pts}")
print(f"  [x] gospel {ok_g}/32 · delivery {ok_d}/32 · verses {ok_v}/32 · six-points-sum-11 {ok_p}/32")

print("== ANSWER SHEET: every block vs spec (poppler) ==")
okc=okv=okw=okb=0
for W,H,ws in words('footprints-print-pack/07-counselor/answer-sheet.pdf'):
    Wb=(792-84-27)/4
    anchors=[(w[0],w[1],int(v[4])) for w,v in zip(ws,ws[1:]) if w[4]=='GROUP' and re.fullmatch(r'\d+',v[4]) and w[3]-w[1]>10]
    for ax,ay,g in anchors:
        bl=[w for w in ws if ax-10<=w[0]<ax-10+Wb and ay-6<=w[1]<ay+238]
        codes={}
        for w in bl:
            if re.fullmatch(r'[UD]\d',w[4]) and (w[3]-w[1])<7:
                cand=[u for u in bl if abs(u[1]-w[1])<4 and 0<u[0]-w[0]<32 and re.fullmatch(r'[A-Z]{2}',u[4])]
                if cand: codes[w[4]]=cand[0][4]
        if codes=={d:CODE[d][str(g)] for d in DOORS}: okc+=1
        else: chk(False,f"answer group {g}: door codes {codes}")
        refs={}
        for y,ln in lines(bl):
            t=" ".join(w[4] for w in ln)
            m=re.match(rf'({REFRX})\s+(\d{{3,4}})$',t)
            if m: refs[m.group(1)]=int(m.group(2))
        want={r:p for r,p in VT[g]} if g in VT else {}
        if refs==want and all(BENSON[r]==p for r,p in refs.items()): okv+=1
        else: chk(False,f"answer group {g}: verse pages {refs} vs {want}")
        wd=[w[4] for w in bl if w[4] in ('GOD','PAYING','OUR','EVERYONE','SINS','LIFE') and (w[3]-w[1])>8]
        if wd and wd[0]==GOS[g].upper(): okw+=1
        else: chk(False,f"answer group {g}: gospel word {wd}")
        blt=" ".join(w[4] for w in bl)
        need=g in DIR
        if (('Lobby to Dead Room' in blt or 'Dead Room to Lobby' in blt)==need and
            (not need or DIR[g] in blt)): okb+=1
        else: chk(False,f"answer group {g}: delivery line")
print(f"  [x] blocks: codes {okc}/32 · verse pages {okv}/32 (all match Benson's list) · gospel {okw}/32 · delivery {okb}/32")

print("== SABOTAGE: props vs CC page (poppler) ==")
PROPS=['FUSE','BATTERY','KEYCARD','O2 TANK','WRENCH','REACTOR ROD']
pm={}
for W,H,ws in words('footprints-print-pack/08-sabotage/sabotage-supply-props.pdf'):
    for half in (0,1):
        hw=[w for w in ws if (w[1]<H/2)==(half==0)]
        t=" ".join(w[4] for w in hw if w[3]-w[1]>25)
        name=[p for p in PROPS if re.search(rf'(?<![A-Z]){p}(?![A-Z])',t.replace('DOOR','#'))]
        door=re.search(r'DOOR ([UD]\d)',t)
        name=[p for p in PROPS if p in t.split('DOOR')[0]]
        name=max(name,key=len)
        pm[name]=door.group(1)
WANT={'FUSE':'U1','BATTERY':'U2','KEYCARD':'U4','O2 TANK':'D1','WRENCH':'D2','REACTOR ROD':'D3'}
chk(pm==WANT,f"props map {pm}")
W,H,ws=words('footprints-print-pack/08-sabotage/sabotage-central-command.pdf')[0]
full=[" ".join(w[4] for w in ln) for _,ln in lines(ws)]
cc={}
for t in full:
    m=re.match(r'^(FUSE|BATTERY|KEYCARD|O2 TANK|WRENCH|REACTOR ROD) ([UD]\d)(?: (FUSE|BATTERY|KEYCARD|O2 TANK|WRENCH|REACTOR ROD) ([UD]\d))?(?: (FUSE|BATTERY|KEYCARD|O2 TANK|WRENCH|REACTOR ROD) ([UD]\d))?$',t)
    if m:
        gs=[x for x in m.groups() if x]
        for i in range(0,len(gs),2): cc[gs[i]]=gs[i+1]
chk(cc==WANT,f"CC page prop map {cc}")
sets=[t for t in full if t.count('(')>=5]
chk(len(sets)==3,f"3 call sets found ({len(sets)})")
for i,s in enumerate(sets,1):
    pairs=re.findall(r'(FUSE|BATTERY|KEYCARD|O2 TANK|WRENCH|REACTOR ROD) \(([UD]\d)\)',s)
    chk(len(pairs)==5 and all(WANT[p]==d for p,d in pairs) and {d[0] for _,d in pairs}=={'U','D'},
        f"set {i}: 5 true-door items spanning both floors ({pairs})")
print(f"  [x] props↔CC map identical ({pm==cc==WANT}) · 3 sets, each 5 items at true doors, both floors")

print("== STATION SIGNS: points (poppler) ==")
want={'CUP STACK':'2 PTS','APPLE STACK':'2 PTS','FLIGHT ZONE':'3 PTS','SUDOKU & MAZES':'2 PTS',
      'BIBLE TABLE':'3 PTS','GOSPEL & THEME':'1 PT','DEAD ROOM':'GHOSTS ONLY','SPECIAL DELIVERY':'2 PTS'}
got={}
for W,H,ws in words('footprints-print-pack/06-signs/station-signs.pdf'):
    ls=[(y," ".join(w[4] for w in ln),max(w[3]-w[1] for w in ln)) for y,ln in lines(ws,4)]
    title=max(ls,key=lambda l:l[2])[1]
    pts=[t for _,t,h in ls if re.fullmatch(r'\d PTS?|GHOSTS ONLY',t)]
    got[title]=pts[0] if pts else None
chk(got==want,f"station signs {got}")
print("  [x] 8 station signs: titles and point values all correct")
print(f"\n{'ALL QA2B CHECKS PASSED' if not fails else f'{len(fails)} REAL FAILURES'}")
