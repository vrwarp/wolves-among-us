#!/usr/bin/env python3
import json, itertools, random
from collections import Counter
rng=random.Random(20260730)
G=25
FORE={'I Can Fly','Cup Stack','Apple Stack'}
MED=['Cup Stack','Apple Stack','Simple Maze','Sudoku','Special Delivery']
shapes=[(h,list(m)) for h in ('I Can Fly','Verse Order') for m in itertools.combinations(MED,3)]
assert len(shapes)==20
def fore(s): return sum(1 for t in [s[0]]+s[1] if t in FORE)
# 20 base shapes + 5 extras chosen to balance hard-task split and hold Foreman down
extras=[('Verse Order',['Simple Maze','Sudoku','Special Delivery']),
        ('Verse Order',['Cup Stack','Simple Maze','Sudoku']),
        ('Verse Order',['Apple Stack','Simple Maze','Special Delivery']),
        ('I Can Fly',['Simple Maze','Sudoku','Special Delivery']),
        ('I Can Fly',['Apple Stack','Simple Maze','Sudoku'])]
sel=shapes+extras
rng.shuffle(sel)
CARDS={}
for i,(h,m) in enumerate(sel,1):
    CARDS[i]=[('Hard',h)]+[('Med',x) for x in m]+[('Easy','Doors'),('Easy','Gospel & Theme')]
PTS={'I Can Fly':3,'Verse Order':3,'Cup Stack':2,'Apple Stack':2,'Simple Maze':2,'Sudoku':2,
     'Special Delivery':2,'Doors':1,'Gospel & Theme':1}
assert all(sum(PTS[n] for _,n in CARDS[g])==11 and len(CARDS[g])==6 for g in CARDS)
load=Counter(n for g in CARDS for _,n in CARDS[g]); slots=G*6
f=sum(load[t] for t in FORE)
print(f"25 CARDS · every card 11 pts, 6 rows")
print(f"  Foreman slots {f}/{slots} = {f/slots*100:.0f}%  (target under 30)")
for t,c_ in sorted(load.items(),key=lambda x:-x[1]): print(f"    {t:18} {c_:2} cards")

# ---- verse triples for the Bible-lookup groups
V=[("1 Samuel 23:1",290,"OT"),("2 Kings 22:2",387,"OT"),("Job 34:7",518,"OT"),("Psalm 54:3",562,"OT"),
   ("Isaiah 11:3",683,"OT"),("Daniel 3:8",878,"OT"),("Matthew 5:17",963,"NT"),("Mark 8:2",1002,"NT"),
   ("Luke 2:36",1019,"NT"),("John 21:20",1079,"NT"),("Acts 12:19",1094,"NT"),("Ephesians 4:8",1161,"NT"),
   ("Philippians 4:14",1167,"NT"),("Hebrews 3:2",1188,"NT"),("1 Peter 4:12",1206,"NT"),("Revelation 14:2",1227,"NT")]
vg=[g for g in sorted(CARDS) if any(n=='Verse Order' for _,n in CARDS[g])]
CAND=[c for c in itertools.combinations(range(16),3)
      if any(V[i][2]=="OT" for i in c) and any(V[i][2]!="OT" for i in c)]
VT=None
for seed in range(30000):
    r=random.Random(seed); deg=[0]*16; used=set(); out=[]
    for _ in vg:
        opts=[c for c in CAND if all(deg[i]<3 for i in c)
              and all(frozenset(p) not in used for p in itertools.combinations(c,2))]
        if not opts: break
        r.shuffle(opts); opts.sort(key=lambda c:sum(deg[i] for i in c))
        c=opts[0]
        for i in c: deg[i]+=1
        used.update(frozenset(p) for p in itertools.combinations(c,2)); out.append(c)
    if len(out)==len(vg): VT=dict(zip(vg,out)); break
assert VT
mx=max(len(set(a)&set(b)) for a,b in itertools.combinations(VT.values(),2))
print(f"\n  {len(vg)} Bible-lookup groups · max verses shared between any two: {mx} · uses per verse "
      f"{sorted(Counter(i for t in VT.values() for i in t).values())[0]}-{sorted(Counter(i for t in VT.values() for i in t).values())[-1]}")

# ---- gospel words
WORDS=["God","Paying","Our","Everyone","Sins","Life"]
GOS={g:WORDS[(g-1)%6] for g in sorted(CARDS)}
print(f"  gospel words per round: {dict(Counter(GOS.values()))}")

# ---- delivery directions, half each way
dg=[g for g in sorted(CARDS) if any(n=='Special Delivery' for _,n in CARDS[g])]
DIR={g:("Lobby to Dead Room" if i%2==0 else "Dead Room to Lobby") for i,g in enumerate(dg)}
print(f"  delivery: {dict(Counter(DIR.values()))}")

# ---- door codes: TWO letters per door
ALPHA=list("ACDEFHJKLMNPRTUVWXY")
DOORS=["U1","U2","U3","U4","D1","D2","D3"]
pairs=[a+b for a in ALPHA for b in ALPHA if a!=b]
CODE=None
for seed in range(4000):
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
print(f"\n  DOOR CODES — 2 letters per door, {len(pairs)} possible pairs")
print(f"  [x] all {G} codes distinct at every door -> no two groups share a code anywhere ({share} shared positions max)")
print(f"  [x] each group's 7 codes are all different from each other")
print(f"  [x] no repeated letter inside a code, and none of I 1 O 0 B 8 G 6 S 5 Z 2 Q")
print(f"  a copier now gets 14 characters wrong instead of 7.")
json.dump({"groups":G,"doors":DOORS,
  "cards":{str(g):[list(r) for r in CARDS[g]] for g in CARDS},
  "verse_triples":{str(g):[[V[i][0],V[i][1]] for i in sorted(VT[g],key=lambda i:V[i][1])] for g in VT},
  "gospel":{str(g):w for g,w in GOS.items()},
  "dir":{str(g):v for g,v in DIR.items()},
  "code":{d:{str(g):CODE[d][g] for g in CODE[d]} for d in DOORS}},
  open('cardspec25.json','w'),indent=1)
print("\nwrote cardspec25.json")
