#!/usr/bin/env python3
import json, itertools, random
from collections import Counter
G=32
FORE={'I Can Fly','Cup Stack','Apple Stack'}
MED=['Cup Stack','Apple Stack','Simple Maze','Sudoku','Special Delivery']
shapes=[(h,tuple(m)) for h in ('I Can Fly','Verse Order') for m in itertools.combinations(MED,3)]
PTS={'I Can Fly':3,'Verse Order':3,'Cup Stack':2,'Apple Stack':2,'Simple Maze':2,'Sudoku':2,
     'Special Delivery':2,'Doors':1,'Gospel & Theme':1}
def score(sel):
    load=Counter()
    for h,m in sel:
        load[h]+=1
        for x in m: load[x]+=1
    f=sum(load[t] for t in FORE)
    hardgap=abs(load['I Can Fly']-load['Verse Order'])
    spread=max(load[x] for x in MED)-min(load[x] for x in MED)
    return (f/ (G*6) > .29, hardgap>2, spread, f)
best=None
for seed in range(6000):
    r=random.Random(seed)
    sel=list(shapes)+[r.choice(shapes) for _ in range(G-20)]
    s=score(sel)
    if s[0] or s[1]: continue
    if best is None or s<best[0]: best=(s,sel)
assert best
sel=best[1]; random.Random(7).shuffle(sel)
CARDS={i:[('Hard',h)]+[('Med',x) for x in m]+[('Easy','Doors'),('Easy','Gospel & Theme')]
       for i,(h,m) in enumerate(sel,1)}
assert all(sum(PTS[n] for _,n in CARDS[g])==11 and len(CARDS[g])==6 for g in CARDS)
load=Counter(n for g in CARDS for _,n in CARDS[g]); slots=G*6
f=sum(load[t] for t in FORE)
print(f"{G} CARDS · every card 11 pts, 6 rows · {len(set(tuple(sorted(m))+(h,) for h,m in sel))} distinct task lists of 20 possible")
print(f"  Foreman slots {f}/{slots} = {f/slots*100:.0f}%  (target under 30)")
for t,c_ in sorted(load.items(),key=lambda x:-x[1]): print(f"    {t:18} {c_:2} cards")

V=[("1 Samuel 23:1",290,"OT"),("2 Kings 22:2",387,"OT"),("Job 34:7",518,"OT"),("Psalm 54:3",562,"OT"),
   ("Isaiah 11:3",683,"OT"),("Daniel 3:8",878,"OT"),("Matthew 5:17",963,"NT"),("Mark 8:2",1002,"NT"),
   ("Luke 2:36",1019,"NT"),("John 21:20",1079,"NT"),("Acts 12:19",1094,"NT"),("Ephesians 4:8",1161,"NT"),
   ("Philippians 4:14",1167,"NT"),("Hebrews 3:2",1188,"NT"),("1 Peter 4:12",1206,"NT"),("Revelation 14:2",1227,"NT")]
vg=[g for g in sorted(CARDS) if any(n=='Verse Order' for _,n in CARDS[g])]
CAND=[c for c in itertools.combinations(range(16),3)
      if any(V[i][2]=="OT" for i in c) and any(V[i][2]!="OT" for i in c)]
VT=None
for seed in range(80000):
    r=random.Random(seed); deg=[0]*16; used=set(); out=[]
    for _ in vg:
        opts=[c for c in CAND if all(deg[i]<4 for i in c)
              and all(frozenset(p) not in used for p in itertools.combinations(c,2))]
        if not opts: break
        r.shuffle(opts); opts.sort(key=lambda c:sum(deg[i] for i in c))
        c=opts[0]
        for i in c: deg[i]+=1
        used.update(frozenset(p) for p in itertools.combinations(c,2)); out.append(c)
    if len(out)==len(vg): VT=dict(zip(vg,out)); break
assert VT, "no verse design"
u=Counter(i for t in VT.values() for i in t)
print(f"\n  {len(vg)} Bible-lookup groups · max verses shared between any two: "
      f"{max(len(set(a)&set(b)) for a,b in itertools.combinations(VT.values(),2))} · uses per verse {min(u.values())}-{max(u.values())}")
WORDS=["God","Paying","Our","Everyone","Sins","Life"]
GOS={g:WORDS[(g-1)%6] for g in sorted(CARDS)}
print(f"  gospel words: {dict(Counter(GOS.values()))}  -> stock max+1 per box")
dg=[g for g in sorted(CARDS) if any(n=='Special Delivery' for _,n in CARDS[g])]
DIR={g:("Lobby to Dead Room" if i%2==0 else "Dead Room to Lobby") for i,g in enumerate(dg)}
print(f"  red ball: {dict(Counter(DIR.values()))}")
ALPHA=list("ACDEFHJKLMNPRTUVWXY"); DOORS=["U1","U2","U3","U4","D1","D2","D3"]
pairs=[a+b for a in ALPHA for b in ALPHA if a!=b]
CODE=None
for seed in range(6000):
    r=random.Random(seed); C={d:{} for d in DOORS}; mine={g:set() for g in range(1,G+1)}; ok=True
    for d in DOORS:
        taken=set()
        for g in sorted(range(1,G+1), key=lambda g:-len(mine[g])):
            opts=[p for p in pairs if p not in taken and p not in mine[g]]
            if not opts: ok=False; break
            p=r.choice(opts); C[d][g]=p; taken.add(p); mine[g].add(p)
        if not ok: break
    if ok: CODE=C; break
assert CODE
for d in DOORS: assert len(set(CODE[d].values()))==G
share=max(sum(1 for d in DOORS if CODE[d][a]==CODE[d][b]) for a,b in itertools.combinations(range(1,G+1),2))
print(f"\n  DOOR CODES · {len(pairs)} possible pairs · all {G} distinct at every door · max shared positions {share}")
# Each group owes 3 of the 7 doors — night one showed all 7 was a slog. Always
# at least one per floor, seeded per group so a re-run agrees with the app.
D3={}
for g in range(1,G+1):
    r3=random.Random(7000+g)
    pick=[r3.choice(DOORS[:4]), r3.choice(DOORS[4:])]
    pick.append(r3.choice([x for x in DOORS if x not in pick]))
    D3[str(g)]=sorted(set(pick), key=DOORS.index)
json.dump({"groups":G,"doors":DOORS,"doors3":D3,
  "cards":{str(g):[list(r) for r in CARDS[g]] for g in CARDS},
  "verse_triples":{str(g):[[V[i][0],V[i][1]] for i in sorted(VT[g],key=lambda i:V[i][1])] for g in VT},
  "gospel":{str(g):w for g,w in GOS.items()},
  "dir":{str(g):v for g,v in DIR.items()},
  "code":{d:{str(g):CODE[d][g] for g in CODE[d]} for d in DOORS}},
  open('cardspec32.json','w'),indent=1)
print("\nwrote cardspec32.json")
