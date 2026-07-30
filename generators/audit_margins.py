#!/usr/bin/env python3
import glob, subprocess, os, tempfile, warnings
warnings.filterwarnings('ignore')
from PIL import Image
DPI=100
worst={}
for f in sorted(glob.glob('footprints-print-pack/*/*.pdf')):
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(['pdftoppm','-r',str(DPI),'-png',f,td+'/p'],check=True)
        pages=sorted(glob.glob(td+'/p*.png'))
        mn=None
        for pg in pages:
            im=Image.open(pg).convert('L')
            W,H=im.size
            bbox=im.point(lambda v:0 if v>245 else 255).getbbox()
            if not bbox: continue
            l,t,r,b=bbox
            m=[l/DPI, t/DPI, (W-r)/DPI, (H-b)/DPI]   # left, top, right, bottom in inches
            if mn is None or min(m)<min(mn[0]): mn=(m,os.path.basename(pg))
        worst[f]=mn
print(f"{'file':52} {'left':>6}{'top':>7}{'right':>7}{'bottom':>7}   verdict")
bad=[]
for f,(m,pg) in worst.items():
    v="OK" if min(m)>=0.5 else ("TIGHT" if min(m)>=0.4 else "CLIPS")
    if min(m)<0.5: bad.append(f)
    print(f"{f.split('/',1)[1]:52} {m[0]:6.2f}{m[1]:7.2f}{m[2]:7.2f}{m[3]:7.2f}   {v}")
print(f"\n0.5in is the brief's minimum. Most home/church printers cannot print inside ~0.25in,")
print(f"and many laser trays lose 0.4in on the short edge.")
print(f"\nfiles under 0.5in: {len(bad)}")
