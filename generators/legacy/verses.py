import itertools, json, sys
sys.setrecursionlimit(10000)
V=[("1 Samuel 23:1",290,"OT",2),("2 Kings 22:2",387,"OT",3),("Job 34:7",518,"OT",3),
   ("Psalm 54:3",562,"OT",1),("Isaiah 11:3",683,"OT",2),("Daniel 3:8",878,"OT",2),
   ("Matthew 5:17",963,"GOS",1),("Mark 8:2",1002,"GOS",1),("Luke 2:36",1019,"GOS",1),
   ("John 21:20",1079,"GOS",1),("Acts 12:19",1094,"GOS",2),("Ephesians 4:8",1161,"EPI",3),
   ("Philippians 4:14",1167,"EPI",3),("Hebrews 3:2",1188,"EPI",3),("1 Peter 4:12",1206,"EPI",3),
   ("Revelation 14:2",1227,"EPI",2)]
n=len(V)
print("KEY CHECK — pages must rise monotonically in canonical order")
print("  monotonic:", "PASS" if all(V[i+1][1]>V[i][1] for i in range(n-1)) else "FAIL")
print(f"  NT ~958-1227 = ~269pp of ~1240pp = 22% (NT is ~22-24% of Bible text) -> consistent")

CAND=[c for c in itertools.combinations(range(n),3)
      if len({V[i][2] for i in c})>=2 and min(V[i][3] for i in c)<=2]
print(f"  candidate triples (span >=2 sections, >=1 findable book): {len(CAND)}")

deg=[0]*n; used=set(); out=[]
def solve(k):
    if k==16: return all(d==3 for d in deg)
    # always seed from a lowest-degree verse to keep usage level
    lo=min(d for d in deg); pivot=deg.index(lo)
    opts=[c for c in CAND if pivot in c and all(deg[i]<3 for i in c)
          and all(frozenset(p) not in used for p in itertools.combinations(c,2))]
    # widest page span first: forces each group across the whole book
    opts.sort(key=lambda c:(sum(deg[i] for i in c), -(max(V[i][1] for i in c)-min(V[i][1] for i in c))))
    for c in opts:
        for i in c: deg[i]+=1
        ps=[frozenset(p) for p in itertools.combinations(c,2)]
        used.update(ps); out.append(c)
        if solve(k+1): return True
        out.pop(); used.difference_update(ps)
        for i in c: deg[i]-=1
    return False

ok=solve(0)
print("\nDESIGN:", "found" if ok else "FAILED")
inter=max(len(set(a)&set(b)) for a,b in itertools.combinations(out,2))
print(f"  every verse used exactly 3x: {sorted(set(deg))==[3]} · all 16 sets unique: {len({frozenset(b) for b in out})==16}")
print(f"  max verses shared between ANY two groups: {inter}  (so copying a neighbour never yields all three)")
rows=[]
for g,b in enumerate(out,1):
    b=sorted(b,key=lambda i:V[i][1])
    rows.append({"group":g,"refs":[V[i][0] for i in b],"pages":[V[i][1] for i in b],
                 "span":max(V[i][1] for i in b)-min(V[i][1] for i in b)})
print(f"\n{'Grp':>3}  {'Ref 1':<18}{'Ref 2':<19}{'Ref 3':<19}{'pages':<20}span")
for r in rows:
    print(f"{r['group']:>3}  {r['refs'][0]:<18}{r['refs'][1]:<19}{r['refs'][2]:<19}{str(r['pages']):<20}{r['span']:>4}")
print(f"\nmean span per group: {sum(r['span'] for r in rows)/16:.0f}pp — every group crosses most of the book")
from collections import Counter
u=Counter(V[i][0] for b in out for i in b)
print("uses per verse:", sorted(set(u.values())))
json.dump({"bible":"PEW BIBLE — edition to be recorded on the key",
           "verses":[{"ref":a,"page":b} for a,b,_,_ in V],"groups":rows},
          open('/home/claude/verse_lookup.json','w'),indent=1)
