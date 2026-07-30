from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as pw:
    b=pw.chromium.launch(args=['--no-sandbox'])
    p=b.new_page()
    p.on('pageerror',lambda e:errs.append(str(e)))
    p.goto('http://localhost:8123/#/c/cc',wait_until='networkidle')
    st=lambda:p.evaluate("window.__state()")
    act=lambda f,*a:p.evaluate(f"window.act.{f}({','.join(map(str,a))})")
    s0=st(); print('baseline deaths',s0['deaths'],'banner',s0['banner'])
    act('start'); act('sab',2)
    s1=st(); print('after sab: banner',s1['banner'],'set',s1['sabotageSet'],'used',s1['sabotagesUsed'],'phase',s1['phase']['label'],'hist',len(s1['hist']))
    act('sabFail')
    s2=st(); print('after fail: deaths',s2['deaths'],'banner',s2['banner'],'hist',len(s2['hist']))
    act('undo')
    s3=st(); print('undo1: deaths',s3['deaths'],'banner',s3['banner'],'phase',s3['phase']['label'],'hist',len(s3['hist']))
    act('undo')
    s4=st(); print('undo2: banner',s4['banner'],'used',s4['sabotagesUsed'],'hist',len(s4['hist']))
    act('undo')
    s5=st(); print('undo3: timer',s5['timer']['mode'],'hist',len(s5['hist']))
    act('ejectCrew'); act('ejectImp'); act('undo')
    s6=st(); print('crew+imp then undo: deaths',s6['deaths'],'caught',s6['impostersCaught'])
    # UI: undo button label reflects last action
    p.evaluate("act.tab('controls')")
    label=p.locator('.btn-undo').inner_text()
    print('undo button label:',label)
    ok=(s1['banner']=='sabotage' and s1['sabotagesUsed']==1 and s2['deaths']==2 and
        s3['deaths']==0 and s3['banner']=='sabotage' and s3['phase']['label']=='SABOTAGE' and
        s4['banner']=='none' and s4['sabotagesUsed']==0 and s5['timer']['mode']=='idle' and
        s6['deaths']==1 and s6['impostersCaught']==0 and not errs and 'Crewmate' in label)
    print('PAGE ERRORS:',errs or 'none')
    print('UNDO TEST:','PASS' if ok else 'FAIL')
    b.close()
    exit(0 if ok else 1)
