import itertools, json, random
V=[("1 Samuel 23:1",290,"OT"),("2 Kings 22:2",387,"OT"),("Job 34:7",518,"OT"),
   ("Psalm 54:3",562,"OT"),("Isaiah 11:3",683,"OT"),("Daniel 3:8",878,"OT"),
   ("Matthew 5:17",963,"NT"),("Mark 8:2",1002,"NT"),("Luke 2:36",1019,"NT"),
   ("John 21:20",1079,"NT"),("Acts 12:19",1094,"NT"),("Ephesians 4:8",1161,"NT"),
   ("Philippians 4:14",1167,"NT"),("Hebrews 3:2",1188,"NT"),("1 Peter 4:12",1206,"NT"),
   ("Revelation 14:2",1227,"NT")]
OT=[i for i,v in enumerate(V) if v[2]=="OT"]; NT=[i for i,v in enumerate(V) if v[2]=="NT"]
# 14 blocks of 1 OT + 2 NT, 2 blocks of 2 OT + 1 NT -> every verse used exactly 3x
shapes=[(1,2)]*14+[(2,1)]*2
best=None
for trial in range(400000):
    rnd=random.Random(trial)
    dO={i:3 for i in OT}; dN={i:3 for i in NT}; used=set(); blocks=[]; ok=True
    for no,nn in sorted(shapes,key=lambda s:-s[0]):
        po=[i for i in OT if dO[i]>0]; pn=[i for i in NT if dN[i]>0]
        if len(po)<no or len(pn)<nn: ok=False; break
        got=False
        for _ in range(300):
            c=tuple(sorted(rnd.sample(sorted(po,key=lambda i:-dO[i])[:max(no,4)],no)+
                           rnd.sample(sorted(pn,key=lambda i:-dN[i])[:max(nn,5)],nn)))
            if all(frozenset(p) not in used for p in itertools.combinations(c,2)):
                got=True; break
        if not got: ok=False; break
        for i in c:
            if i in dO: dO[i]-=1
            else: dN[i]-=1
        used.update(frozenset(p) for p in itertools.combinations(c,2)); blocks.append(c)
    if ok and len(blocks)==16 and all(v==0 for v in dO.values()) and all(v==0 for v in dN.values()):
        best=blocks; print(f"solved on trial {trial}"); break
assert best, "no design found"
inter=max(len(set(a)&set(b)) for a,b in itertools.combinations(best,2))
print(f"16 groups · every verse used exactly 3x · all sets unique: {len({frozenset(b) for b in best})==16} · max shared: {inter}")
rows=[]
for g,b in enumerate(sorted(best,key=lambda b:min(V[i][1] for i in b)),1):
    b=sorted(b,key=lambda i:V[i][1])
    rows.append({"group":g,"refs":[V[i][0] for i in b],"pages":[V[i][1] for i in b],
                 "ot":sum(1 for i in b if V[i][2]=="OT")})
print(f"\n{'Grp':>3}  {'Ref 1':<18}{'Ref 2':<19}{'Ref 3':<19}pages")
for r in rows: print(f"{r['group']:>3}  {r['refs'][0]:<18}{r['refs'][1]:<19}{r['refs'][2]:<19}{r['pages']}")
print(f"\nevery group has >=1 OT and >=1 NT lookup: {all(1<=r['ot']<=2 for r in rows)}")
json.dump({"bible":"pew Bible — record edition on the key","verses":[{"ref":a,"page":b} for a,b,_ in V],"groups":rows},
          open('/home/claude/verse_lookup.json','w'),indent=1)
