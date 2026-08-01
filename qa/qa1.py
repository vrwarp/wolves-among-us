#!/usr/bin/env python3
import warnings, glob, os, json, subprocess, zipfile, filecmp
warnings.filterwarnings('ignore')
from pypdf import PdfReader
fails=[]
def chk(ok,msg):
    print(("  [x] " if ok else "  [FAIL] ")+msg)
    if not ok: fails.append(msg)

print("== 1. INVENTORY & PAGE COUNTS ==")
expect={ "01-index-cards/index-cards-32-unique.pdf":16, "01-index-cards/index-cards-96-deck.pdf":48,
 "02-sudoku/sudoku-puzzles.pdf":20, "02-sudoku/sudoku-answers.pdf":5,
 "05-doors/door-code-sheets.pdf":7, "06-signs/gospel-box-signs.pdf":6, "06-signs/station-signs.pdf":9,
 "06-signs/gospel-completion-cards.pdf":1, "FACILITATOR-PLAYBOOK.pdf":5,
 "07-counselor/answer-sheet.pdf":4, "07-counselor/role-cards.pdf":6,
 "08-sabotage/sabotage-central-command.pdf":1, "08-sabotage/sabotage-supply-props.pdf":3}
disk={p.split('footprints-print-pack/')[1] for p in glob.glob('footprints-print-pack/**/*.pdf',recursive=True)}
chk(disk==set(expect), f"exactly the 13 expected PDFs on disk (extra: {disk-set(expect)}, missing: {set(expect)-disk})")
for f,n in expect.items():
    got=len(PdfReader('footprints-print-pack/'+f).pages)
    chk(got==n, f"{f}: {got} pages (expected {n})")
others=set(os.listdir('footprints-print-pack'))-{'01-index-cards','02-sudoku','05-doors','06-signs','07-counselor','08-sabotage','.DS_Store'}
chk(others=={'PRINT-ME-FIRST.md','among-us-footprints.pptx','FACILITATOR-PLAYBOOK.pdf'}, f"pack root holds guide + deck + playbook: {sorted(others)}")
chk(filecmp.cmp('footprints-print-pack/among-us-footprints.pptx','deck/among-us-footprints.pptx',shallow=False),
    "pptx in pack is byte-identical to the deck build")

print("\n== 2. ZIP MATCHES DISK ==")
z=zipfile.ZipFile('footprints-print-pack.zip')
znames={n for n in z.namelist() if not n.endswith('/')}
dnames={'footprints-print-pack/'+p.split('footprints-print-pack/')[1] for p in glob.glob('footprints-print-pack/**/*.*',recursive=True)}
chk(znames==dnames, f"zip contents == disk (zip-only: {znames-dnames}, disk-only: {dnames-znames})")
stale=[n for n in znames if 'hush' in n.lower() or 'death-tally' in n.lower()]
chk(not stale, f"no stale hush/death-tally files in zip {stale}")
same=all(z.read(n)==open(n,'rb').read() for n in znames)
chk(same,"every file in the zip is byte-identical to the current file on disk")

print("\n== 3. PRINT-ME-FIRST REFERENCES ==")
import re
pmf=open('footprints-print-pack/PRINT-ME-FIRST.md').read()
refs=re.findall(r'`([\w\-/]+\.(?:pdf|md))`',pmf)
for r in refs:
    chk(os.path.exists('footprints-print-pack/'+r), f"referenced file exists: {r}")
chk(sorted(set(re.findall(r'^## (\d+)\.',pmf,re.M)))==[str(i) for i in range(1,10)],"sections numbered 1-9 with no gaps")
for term in ['Hush','hush','death-tally','death tally','paperclip','MY TOTAL','bead','Bottle','Sharp Shooter']:
    chk(term not in pmf, f"no stale term in PRINT-ME-FIRST: '{term}'")

print("\n== 4. INK-MARGIN AUDIT ==")
r=subprocess.run(['python3','generators/audit_margins.py'],capture_output=True,text=True).stdout
print("\n".join("  "+l for l in r.strip().split("\n")[1:-3]))
chk("under 0.5in: 0" in r, "all PDFs clear 0.5in on every edge")

print("\n== 5. TRACKER STATUSES ==")
d=json.load(open('tracker/data.json'))
ent=[(x['name'],x['status']) for x in d['games']+d['systems']]
nl=[e for e in ent if e[1]!='locked']
print(f"  {len(ent)} entities; not locked: {nl if nl else 'none'}")

print(f"\n{'ALL QA1 CHECKS PASSED' if not fails else f'{len(fails)} FAILURES'}")
