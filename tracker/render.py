#!/usr/bin/env python3
import json
d=json.load(open('/home/claude/tracker/data.json'))
PILL={"locked":("LOCKED","ok"),"open":("OPEN","warn"),"undefined":("UNDEFINED","bad"),
      "proposed":("NEEDS YOUR CALL","prop"),"design":("IN DESIGN","prop"),"external":("BENSON","ext")}
def li(x):
    return '<ul>'+''.join(f'<li>{i}</li>' for i in x)+'</ul>' if x else '<span class=none>none</span>'
def card(g,sysmode=False):
    lab,cls=PILL[g['status']]
    pts='' if sysmode else f"<span class=pts>{g['pts']} pt</span>"
    sub='' if sysmode else f"<div class=sub><span>{g['station']}</span><span>{g['cards']}</span></div>"
    ver='' if sysmode else f"<div class=row><b>Verify</b><div>{g['verify']}</div></div>"
    return f"""<section class="game {cls}"><header><h3>{g['name']}</h3>{pts}<span class="pill {cls}">{lab}</span></header>{sub}
<div class=row><b>What happens</b><div>{g['does']}</div></div>{ver}
<div class=row><b>Materials</b><div>{li(g['materials'])}</div></div>
<div class=row><b>Printables</b><div>{li(g['printables'])}</div></div>
<div class="row open"><b>Open</b><div>{li(g['open'])}</div></div></section>"""
allx=d['games']+d['systems']
c=lambda s:sum(1 for g in allx if g['status']==s)
nq=sum(len(g['open']) for g in allx)
H=f"""<!DOCTYPE html><html lang=en><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>Footprints — Game Spec Tracker</title><style>
:root{{--bg:#faf9f7;--fg:#1f1d1b;--mut:#6b6660;--line:#e3dfd9;--card:#fff;
--ok:#2f7d5d;--okbg:#eaf5ef;--warn:#96620f;--warnbg:#fdf3e3;--bad:#a3352b;--badbg:#fbeceb;
--prop:#2b5f96;--propbg:#eaf1f9;--ext:#6b6660;--extbg:#f0eeea}}
@media(prefers-color-scheme:dark){{:root{{--bg:#17161a;--fg:#eceae6;--mut:#a39d95;--line:#332f36;--card:#201f24;
--ok:#7ac9a3;--okbg:#152420;--warn:#e0ac5c;--warnbg:#2a2217;--bad:#e8877c;--badbg:#2b1a19;
--prop:#8fb8e8;--propbg:#16212e;--ext:#a39d95;--extbg:#232227}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);
font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif}}
.wrap{{max-width:1200px;margin:0 auto;padding:34px 20px 80px}}
h1{{font-size:27px;margin:0 0 4px;letter-spacing:-.022em}}
.rev{{color:var(--mut);font-size:13px;margin-bottom:20px}}
.bar{{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:8px}}
.stat{{flex:1;min-width:112px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:11px 13px}}
.stat b{{display:block;font-size:23px;line-height:1.1}}
.stat span{{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.07em}}
h2{{font-size:12.5px;text-transform:uppercase;letter-spacing:.11em;color:var(--mut);
margin:32px 0 11px;padding-bottom:6px;border-bottom:1px solid var(--line)}}
.grid{{display:grid;gap:11px;grid-template-columns:repeat(auto-fill,minmax(345px,1fr))}}
.game{{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--line);border-radius:10px;padding:13px 15px}}
.game.ok{{border-left-color:var(--ok)}}.game.warn{{border-left-color:var(--warn)}}
.game.bad{{border-left-color:var(--bad)}}.game.prop{{border-left-color:var(--prop)}}.game.ext{{border-left-color:var(--ext)}}
.game header{{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}}
.game h3{{font-size:17px;margin:0;flex:1;letter-spacing:-.012em}}
.pts{{font-size:12px;font-weight:600;color:var(--mut)}}
.pill{{font-size:9.5px;font-weight:700;letter-spacing:.075em;padding:3px 7px;border-radius:20px;white-space:nowrap}}
.pill.ok{{background:var(--okbg);color:var(--ok)}}.pill.warn{{background:var(--warnbg);color:var(--warn)}}
.pill.bad{{background:var(--badbg);color:var(--bad)}}.pill.prop{{background:var(--propbg);color:var(--prop)}}
.pill.ext{{background:var(--extbg);color:var(--ext)}}
.sub{{display:flex;gap:11px;flex-wrap:wrap;margin:3px 0 10px;font-size:12px;color:var(--mut)}}
.row{{display:grid;grid-template-columns:92px 1fr;gap:9px;padding:6px 0;border-top:1px solid var(--line);font-size:13.8px}}
.row b{{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);font-weight:600;padding-top:2px}}
.row ul{{margin:0;padding-left:15px}}.row li{{margin:1.5px 0}}
.row.open{{background:var(--warnbg);margin:6px -15px -13px;padding:8px 15px 11px;border-radius:0 0 8px 8px}}
.game.ok .row.open,.game.ext .row.open{{background:transparent}}
.game.prop .row.open{{background:var(--propbg)}}
.none{{color:var(--mut);font-style:italic}}
.dec{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:4px 16px}}
.dec div{{padding:10px 0;border-top:1px solid var(--line);font-size:14px}}
.dec div:first-child{{border-top:0}}.dec b{{color:var(--ok)}}
footer{{margin-top:36px;padding-top:13px;border-top:1px solid var(--line);color:var(--mut);font-size:12.5px}}
</style></head><body><div class=wrap>
<h1>Among Us: Footprints — Game Spec Tracker</h1><div class=rev>{d['rev']}</div>
<div class=bar>
<div class=stat><b>{c('locked')}</b><span>Locked</span></div>
<div class=stat><b>{c('proposed')+c('design')}</b><span>Your call</span></div>
<div class=stat><b>{c('open')}</b><span>Open</span></div>
<div class=stat><b>{c('undefined')}</b><span>Undefined</span></div>
<div class=stat><b>{c('external')}</b><span>Yours</span></div>
<div class=stat><b>{nq}</b><span>Open items</span></div></div>
<h2>Settled</h2><div class=dec>{''.join(f"<div><b>{x['t']}</b> — {x['d']}</div>" for x in d['decided'])}</div>
<h2>Tasks</h2><div class=grid>{''.join(card(g) for g in d['games'])}</div>
<h2>Systems</h2><div class=grid>{''.join(card(s,True) for s in d['systems'])}</div>
<footer>Source: among-us-footprints-playbook.md · task-cards-16-groups.md · COWORK-BRIEF.md.
Where the brief and the playbook disagree the playbook wins and the conflict is listed under Open.</footer>
</div></body></html>"""
open('/home/claude/footprints-tracker.html','w').write(H)
print("rendered:",{k:c(k) for k in ['locked','proposed','design','open','undefined','external']},"open items:",nq)
