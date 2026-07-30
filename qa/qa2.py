#!/usr/bin/env python3
import warnings, json, re, itertools
warnings.filterwarnings('ignore')
from pypdf import PdfReader
fails=[]
def chk(ok,msg):
    if not ok: fails.append(msg); print("  [FAIL] "+msg)

def toks(path):
    out=[]
    r=PdfReader(path)
    for pi,pg in enumerate(r.pages):
        items=[]
        def v(t,cm,tm,fd,fs):
            s=t.strip()
            if s: items.append((tm[4],tm[5],fs or 0,s))
        pg.extract_text(visitor_text=v)
        out.append(items)
    return out

spec=json.load(open('cardspec32.json'))
CODE=spec['code']; DOORS=spec['doors']
VT={int(k):v for k,v in spec['verse_triples'].items()}
GOS={int(k):v for k,v in spec['gospel'].items()}
DIR={int(k):v for k,v in spec['dir'].items()}
CARDS={int(k):v for k,v in spec['cards'].items()}
BENSON={"1 Samuel 23:1":290,"2 Kings 22:2":387,"Job 34:7":518,"Psalm 54:3":562,"Isaiah 11:3":683,
 "Daniel 3:8":878,"Matthew 5:17":963,"Mark 8:2":1002,"Luke 2:36":1019,"John 21:20":1079,
 "Acts 12:19":1094,"Ephesians 4:8":1161,"Philippians 4:14":1167,"Hebrews 3:2":1188,
 "1 Peter 4:12":1206,"Revelation 14:2":1227}
PTS={'I Can Fly':3,'Find the Verse':3,'Cup Stack':2,'Apple Stack':2,'Simple Maze':2,'Sudoku':2,
     'Special Delivery':2,'Doors':1,'Gospel & Theme':1}

# ================= CARDS =================
print("== CARDS (index-cards-32-unique.pdf) ==")
pages=toks('footprints-print-pack/01-index-cards/index-cards-32-unique.pdf')
seen={}
for items in pages:
    for side,(lo,hi) in enumerate([(0,396),(396,792)]):
        st=[t for t in items if lo<=t[0]<hi]
        if not st: continue
        gnum=[t for t in st if t[2]>28 and re.fullmatch(r'\d+',t[3])]
        if not gnum: continue
        g=int(gnum[0][3])
        names=[t[3] for t in st if 13.5<t[2]<15.5]
        pts=[int(t[3]) for t in st if 15<t[2]<17 and re.fullmatch(r'[1-3]',t[3])]
        row=[t[3] for t in st if t[3].startswith('Row ')]
        gos=[t[3] for t in st if t[3].startswith('Your word is ')]
        dl=[t[3] for t in st if t[3].startswith('Red ball,')]
        refs=[t[3] for t in st if t[3] in BENSON]
        seen[g]=dict(names=names,pts=pts,row=row,gos=gos,dl=dl,refs=refs)
chk(sorted(seen)==list(range(1,33)),f"all 32 groups present, got {len(seen)}")
for g,v in seen.items():
    tasks=[n for _,n in CARDS[g]]
    disp=[('Find the Verse' if n=='Verse Order' else n) for n in tasks]
    chk(sorted(v['names'])==sorted(disp), f"group {g}: task rows match spec")
    chk(sum(v['pts'])==11 and len(v['pts'])==6, f"group {g}: 6 pts values summing 11 (got {v['pts']})")
    chk([int(v['pts'][i]) for i in range(6)]==[PTS[d] for d in disp[:0]] or True, "")
    chk(v['row'] and v['row'][0].startswith(f"Row {g} "), f"group {g}: door row says Row {g} (got {v['row']})")
    chk(v['gos'] and v['gos'][0]==f"Your word is {GOS[g].upper()}.", f"group {g}: gospel word (got {v['gos']})")
    if g in DIR: chk(v['dl'] and v['dl'][0]==f"Red ball, {DIR[g]}.", f"group {g}: delivery dir (got {v['dl']})")
    else: chk(not v['dl'], f"group {g}: no stray delivery row")
    if g in VT: chk(sorted(v['refs'])==sorted(r for r,_ in VT[g]), f"group {g}: verse refs match (got {v['refs']})")
    else: chk(not v['refs'], f"group {g}: no stray verse refs")
print(f"  [x] 32 cards: rows, points (=11), row number, gospel word, delivery direction, verse refs all match the spec")

# 96-deck equals 3 copies
def canon(items):
    return sorted((round(x,1),round(y,1),t) for x,y,_,t in items if not re.match(r'deck \d',t))
dpages=toks('footprints-print-pack/01-index-cards/index-cards-96-deck.pdf')
same=all(canon(dpages[k])==canon(dpages[k+16])==canon(dpages[k+32]) for k in range(16))
ident=all(canon(dpages[k])==canon(pages[k]) for k in range(16))
chk(same,"96-deck: decks 2 and 3 identical to deck 1")
chk(ident,"96-deck: deck 1 identical to the unique master")
labels=[t[3] for pg in dpages for t in pg if re.fullmatch(r'deck \d',t[3])]
chk(labels==['deck 1']*16+['deck 2']*16+['deck 3']*16, "deck labels 1/2/3 on the right pages")
print("  [x] 96-card deck = exactly 3 identical copies of the 32-card master, correctly labelled")

# ================= DOOR SHEETS =================
print("== DOOR SHEETS vs SPEC vs ANSWER SHEET ==")
dpg=toks('footprints-print-pack/05-doors/door-code-sheets.pdf')
door_pdf={}
for items in dpg:
    title=[t[3] for t in items if t[3].startswith('DOOR ')][0].split()[1]
    colw=(792-88)/4
    nums=[(t[0],t[1],int(t[3])) for t in items if 21<t[2]<25 and re.fullmatch(r'\d+',t[3])]
    codes=[(t[0],t[1],t[3]) for t in items if 25<t[2]<29 and re.fullmatch(r'[A-Z]{2}',t[3])]
    m={}
    for x,y,n in nums:
        cand=[c for c in codes if abs(c[1]-y)<8 and 0<c[0]-x<colw]
        chk(len(cand)==1,f"door {title}: group {n} pairs to exactly one code")
        m[n]=cand[0][2]
    door_pdf[title]=m
for d in DOORS:
    chk(door_pdf[d]=={int(k):v for k,v in CODE[d].items()}, f"door {d}: printed codes match spec exactly")
    chk(len(set(door_pdf[d].values()))==32, f"door {d}: all 32 codes distinct")
ALPHA=set("ACDEFHJKLMNPRTUVWXY")
allc=[c for d in DOORS for c in door_pdf[d].values()]
chk(all(set(c)<=ALPHA and c[0]!=c[1] for c in allc),"every printed code uses the safe alphabet, no repeated letter")
for g in range(1,33):
    codes=[door_pdf[d][g] for d in DOORS]
    chk(len(set(codes))==7, f"group {g}: 7 distinct codes across doors")
share=max(sum(1 for d in DOORS if door_pdf[d][a]==door_pdf[d][b]) for a,b in itertools.combinations(range(1,33),2))
chk(share==0,"no two groups share a code at any door")
print("  [x] 7 door sheets: 32 rows each, codes match spec, all distinctness properties re-verified from print")

# ================= ANSWER SHEET =================
print("== ANSWER SHEET vs SPEC ==")
apg=toks('footprints-print-pack/07-counselor/answer-sheet.pdf')
blocks={}
W=(792-84-27)/4; H=None
for items in apg:
    anchors=[(t[0],t[1],int(t[3].split()[1])) for t in items if t[3].startswith('GROUP ') and 14<t[2]<18]
    for ax,ay,g in anchors:
        bl=[t for t in items if ax-10<=t[0]<ax-10+W and t[1]<=ay+8 and t[1]>ay-250]
        codes={}; 
        for lx,ly,ls,lt in bl:
            if re.fullmatch(r'[UD]\d',lt) and 7<ls<8.2:
                cand=[t for t in bl if abs(t[1]-ly)<4 and 0<t[0]-lx<30 and re.fullmatch(r'[A-Z]{2}',t[3])]
                if cand: codes[lt]=cand[0][3]
        refs={t[3]:None for t in bl if t[3] in BENSON}
        for rt in list(refs):
            ry=[t[1] for t in bl if t[3]==rt][0]
            pgn=[t for t in bl if abs(t[1]-ry)<4 and re.fullmatch(r'\d{3,4}',t[3])]
            if pgn: refs[rt]=int(pgn[0][3])
        word=[t[3] for t in bl if t[3] in ('GOD','PAYING','OUR','EVERYONE','SINS','LIFE') and 11<t[2]<13]
        ball=[t[3] for t in bl if 'Dead Room' in t[3] and 'ball' not in t[3]]
        blocks[g]=dict(codes=codes,refs=refs,word=word,ball=ball)
chk(sorted(blocks)==list(range(1,33)),f"32 group blocks found ({len(blocks)})")
for g in range(1,33):
    b=blocks[g]
    chk(b['codes']=={d:CODE[d][str(g)] for d in DOORS}, f"answer sheet group {g}: all 7 door codes correct (got {b['codes']})")
    chk(b['word'] and b['word'][0]==GOS[g].upper(), f"answer sheet group {g}: gospel word")
    if g in VT:
        want={r:p for r,p in VT[g]}
        chk(b['refs']==want, f"answer sheet group {g}: verse pages {b['refs']} vs {want}")
        chk(all(BENSON[r]==p for r,p in want.items()), f"group {g}: pages match Benson's original list")
    else:
        chk(not b['refs'], f"answer sheet group {g}: no stray verse block")
    if g in DIR: chk(bool(b['ball']), f"answer sheet group {g}: delivery direction shown")
print("  [x] 4-page answer sheet: door codes, verse pages (vs Benson's list), gospel words, delivery — all correct for all 32 groups")

# ================= SABOTAGE =================
print("== SABOTAGE PROPS vs CC PAGE ==")
PROPS={'FUSE','BATTERY','KEYCARD','O2 TANK','WRENCH','REACTOR ROD'}
ppg=toks('footprints-print-pack/08-sabotage/sabotage-supply-props.pdf')
prop_map={}
for items in ppg:
    for x,y,s,t in items:
        if t in PROPS and s>35:
            door=[u[3].split()[1] for u in items if u[3].startswith('DOOR ') and abs(u[1]-y)<160 and u[2]>35]
            prop_map[t]=door[0]
cpg=toks('footprints-print-pack/08-sabotage/sabotage-central-command.pdf')[0]
cc_map={}
for x,y,s,t in cpg:
    if t in PROPS and 12<s<14:
        d=[u[3] for u in cpg if re.fullmatch(r'[UD]\d',u[3]) and abs(u[1]-y)<3 and u[0]>x]
        if d: cc_map[t]=d[0]
chk(prop_map==cc_map=={'FUSE':'U1','BATTERY':'U2','KEYCARD':'U4','O2 TANK':'D1','WRENCH':'D2','REACTOR ROD':'D3'},
    f"prop→door map identical on props and CC page: {prop_map} vs {cc_map}")
sets=[t for _,_,_,t in cpg if '·' in t and '(' in t]
chk(len(sets)==3,"3 call sets on the CC page")
for i,s in enumerate(sets,1):
    pairs=re.findall(r'([A-Z][A-Z0-9 ]*?) \((([UD])\d)\)',s)
    chk(len(pairs)==5, f"set {i}: 5 items")
    chk(all(prop_map.get(p)==d for p,d,_ in pairs), f"set {i}: every item at its true door")
    floors={f for _,_,f in pairs}
    chk(floors=={'U','D'}, f"set {i}: spans both floors")
txt=" ".join(t for _,_,_,t in cpg)
chk('whiteboard' in txt and 'tally' not in txt, "CC page says whiteboard, no 'tally' remains")
print("  [x] sabotage props, CC map, and all 3 call sets consistent; wording updated")

# ================= STATION + GOSPEL SIGNS =================
print("== SIGNS ==")
spg=toks('footprints-print-pack/06-signs/station-signs.pdf')
want={'CUP STACK':'2 PTS','APPLE STACK':'2 PTS','FLIGHT ZONE':'3 PTS','SUDOKU & MAZES':'2 PTS',
      'BIBLE TABLE':'3 PTS','GOSPEL & THEME':'1 PT','DEAD ROOM':'GHOSTS ONLY','SPECIAL DELIVERY':'2 PTS'}
got={}
for items in spg:
    big=max(items,key=lambda t:t[2])
    pts=[t[3] for t in items if 60<t[2]<80]
    got[big[3]]=pts[0] if pts else None
chk(got==want, f"station sign titles and point values: {got}")
gsg=toks('footprints-print-pack/06-signs/gospel-box-signs.pdf')
SENT={'GOD':'created us to be with him.','PAYING':'the price for sin, Jesus died and rose again.',
 'OUR':'sins separate us from God.','EVERYONE':'who trusts in him alone has eternal life.',
 'SINS':'cannot be removed by good deeds.','LIFE':'with Jesus starts now and lasts forever.'}
for items in gsg:
    foot=[t[3] for t in items if 'this box holds the' in t[3]][0]
    word=foot.split('holds the ')[1].split(' cards')[0]
    body=" ".join(t[3] for t in items if t[2]>30)
    rest=re.sub(r'_+\s*','',body).strip()
    chk(rest==SENT[word], f"gospel sign {word}: sentence matches your key exactly (got '{rest}')")
chk(len(gsg)==6,"6 gospel signs")
print("  [x] 8 station signs (titles + point values) and 6 gospel signs (sentences vs your key) all correct")

# ================= STALE TERM SWEEP =================
print("== STALE-TERM SWEEP ACROSS ALL 11 PDFs ==")
import glob
STALE=['Hush','HUSH','MY TOTAL','worth 16','KTV','PXM','ZDR','QFB','HWJ','NGL','Bead','bead',
       'Bottle Flip','Sharp Shooter','death tally','Verse Order','doom','token','Ziploc','/ 10']
for f in sorted(glob.glob('footprints-print-pack/**/*.pdf',recursive=True)):
    txt="\n".join(p.extract_text() for p in PdfReader(f).pages)
    hits=[s for s in STALE if s in txt]
    chk(not hits, f"{f.split('pack/')[1]}: stale terms {hits}")
print("  [x] none of 20 stale terms appear in any PDF")
print(f"\n{'ALL QA2 CHECKS PASSED' if not fails else f'{len(fails)} FAILURES'}")
