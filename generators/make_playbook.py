#!/usr/bin/env python3
"""Facilitator playbook — printable, Letter portrait, self-contained."""
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import Color, black, white
GREY=Color(.40,.38,.36); LINE=Color(.78,.76,.73); FAINT=Color(.94,.93,.91)
PW,PH=letter; M=46; BOT=58; W=PW-2*M

def wrap(c,t,f,sz,w,first=None):
    out=[]; ln=""; cur=first if first is not None else w
    for word in t.split():
        cand=(ln+" "+word).strip()
        if c.stringWidth(cand,f,sz)<=cur: ln=cand
        else: out.append(ln); ln=word; cur=w
    if ln: out.append(ln)
    return out

class Doc:
    def __init__(s,path,total=None):
        s.c=canvas.Canvas(path,pagesize=(PW,PH)); s.total=total; s.pg=1; s.y=PH-M
    def footer(s):
        s.c.setFillColor(GREY); s.c.setFont("Helvetica",8)
        s.c.drawString(M,40,"AMONG US: FOOTPRINTS EDITION — FACILITATOR PLAYBOOK")
        s.c.drawRightString(PW-M,40,f"page {s.pg}"+(f" of {s.total}" if s.total else ""))
    def brk(s):
        s.footer(); s.c.showPage(); s.pg+=1; s.y=PH-M
    def need(s,h):
        if s.y-h<BOT: s.brk()
    def title(s):
        c=s.c
        c.setFillColor(GREY); c.setFont("Helvetica-Bold",10)
        c.drawString(M,s.y-12,"A M O N G   U S   —   F O O T P R I N T S   E D I T I O N")
        c.setFillColor(black); c.setFont("Helvetica-Bold",30)
        c.drawString(M,s.y-44,"Facilitator Playbook")
        c.setFillColor(GREY); c.setFont("Helvetica",10.5)
        c.drawString(M,s.y-62,"20–25 students, grades 6–12  ·  5 counselors  ·  2–3 rounds  ·  students never need a phone")
        c.setStrokeColor(black); c.setLineWidth(2.5); c.line(M,s.y-74,PW-M,s.y-74)
        s.y-=92
    def h1(s,t):
        s.need(54)
        s.c.setFillColor(black); s.c.setFont("Helvetica-Bold",14.5)
        s.c.drawString(M,s.y-16,t)
        s.c.setStrokeColor(black); s.c.setLineWidth(1.6); s.c.line(M,s.y-22,PW-M,s.y-22)
        s.y-=34
    def h2(s,t):
        s.need(34)
        s.c.setFillColor(GREY); s.c.setFont("Helvetica-Bold",9)
        s.c.drawString(M,s.y-10,t.upper()); s.y-=18
    def p(s,t,ind=0,sz=10.3,col=black,bold=False,gap=4):
        f="Helvetica-Bold" if bold else "Helvetica"
        ls=wrap(s.c,t,f,sz,W-ind)
        s.need(len(ls)*(sz+2.6)+gap)
        s.c.setFillColor(col); s.c.setFont(f,sz)
        for ln in ls:
            s.y-=sz+2.6; s.c.drawString(M+ind,s.y,ln)
        s.y-=gap
    def box(s,text,sz=10.3):
        ls=wrap(s.c,text,"Helvetica",sz,W-26)
        s.need(len(ls)*(sz+2.6)+5)
        s.y-=sz+2.6
        s.c.setStrokeColor(black); s.c.setLineWidth(1.1); s.c.setFillColor(white)
        s.c.rect(M,s.y-1.5,9,9,stroke=1,fill=1)
        s.c.setFillColor(Color(.15,.15,.15)); s.c.setFont("Helvetica",sz)
        s.c.drawString(M+17,s.y,ls[0])
        for ln in ls[1:]:
            s.y-=sz+2.6; s.c.drawString(M+17,s.y,ln)
        s.y-=5
    def b(s,label,text,sz=10.3):
        lw=s.c.stringWidth(label+"  ","Helvetica-Bold",sz)
        ls=wrap(s.c,text,"Helvetica",sz,W-14,first=W-14-lw)
        s.need(len(ls)*(sz+2.6)+3)
        s.y-=sz+2.6
        s.c.setFillColor(black); s.c.setFont("Helvetica-Bold",sz); s.c.drawString(M,s.y,"·")
        s.c.drawString(M+11,s.y,label)
        s.c.setFillColor(Color(.15,.15,.15)); s.c.setFont("Helvetica",sz)
        if ls: s.c.drawString(M+11+lw,s.y,ls[0])
        for ln in ls[1:]:
            s.y-=sz+2.6; s.c.drawString(M+14,s.y,ln)
        s.y-=3
    def rule_row(s,a,b_,last=False):
        sz=9.8; wa=176; wb=W-wa-14
        la=wrap(s.c,a,"Helvetica-Bold",sz,wa); lb=wrap(s.c,b_,"Helvetica",sz,wb)
        h=max(len(la),len(lb))*(sz+2.4)+7
        s.need(h+2)
        ya=s.y
        s.c.setFillColor(black); s.c.setFont("Helvetica-Bold",sz)
        yy=ya
        for ln in la: yy-=sz+2.4; s.c.drawString(M,yy,ln)
        s.c.setFillColor(Color(.15,.15,.15)); s.c.setFont("Helvetica",sz)
        yy=ya
        for ln in lb: yy-=sz+2.4; s.c.drawString(M+wa+14,yy,ln)
        s.y=ya-h+3
        if not last:
            s.c.setStrokeColor(LINE); s.c.setLineWidth(.6); s.c.line(M,s.y,PW-M,s.y)
        s.y-=4
    def gap(s,h=6): s.y-=h

def build(total=None,path="/tmp/pb/playbook.pdf"):
    d=Doc(path,total)
    d.title()

    d.h1("At a glance")
    d.b("Crew wins","when every crewmate — living and dead — reaches tonight's target.")
    d.b("The target is spoken, never printed.","Cards are worth 11. Announce it in the briefing: 4 is easy, 5 is standard, 6 is hard — night one lost round 1 outright at 10 and won round 2 at 5 with a single +0:30. At these targets every student can skip their 3-point task — that slack is what stops a jammed station from locking anyone out.")
    d.b("Imposters win","when the death count on the whiteboard reaches the threshold. Start at 6 for ~20 students (7 if 25+ show). Only kills and failed Sabotages tick the count — ejections never do. Catching an imposter pays the crew +1:00 on the round clock.")
    d.b("3–4 imposters.","Kill = a spoon tap on the shoulder or upper back. Reload = walk through any doorway before your next kill (played this way night one — zero disputes). No kills in the first 60 seconds.")
    d.b("The round clock","is the Game Master's, and counts DOWN from 8:00 of floor time. Only meetings pause it. A successful Sabotage adds 1:00; a failed one subtracts 1:30. There are no other timers — if no Sabotage fires, the round simply ends at 0:00.")
    d.b("Meetings happen one way only:","someone finds a body and yells EMERGEN-C in the lobby. There is no button.")
    d.b("Every meeting ejects somebody.","A meeting that reaches the vote always sends at least one person out — there is no skip corner and no “nobody goes”. A tie ejects EVERY tied nominee. Ejections still never tick the board, so the cost of a wrong call is live taskers, not the threshold.")

    d.h1("The night  (about 50–55 minutes real time)")
    d.p("Each round is 8 floor minutes but 15–18 real minutes once meetings pause the clock. Two rounds fit the hour; the 96-card deck covers a third if time permits.")
    d.b("0:00","Briefing — 8 minutes, script on the last page. Imposters are tapped privately BEFORE the room fills.")
    d.b("Round 1","8:00 floor time. Budget 2–3 meetings — every one of them takes at least one student off the floor.")
    d.b("Reset (3–4 min)","Reveal the imposters. Re-place the 6 Sabotage props (hand them to students — the door is printed on each). Restock the gospel boxes. Reset cup lanes and apple trays. Clear the whiteboard; the Game Master adjusts the threshold — imposters got 2 or fewer kills: drop to 4; they hit it before minute five: raise to 8. Re-roll imposters and RUN THE REVEAL again — they must know each other. Announce the new target if it changed.")
    d.b("New cards each round.","Deal deck 2 starting from group 11, deck 3 starting from group 21, keeping students in the same order — nobody gets the same group twice, so nobody carries door codes forward.")

    d.h1("Counselors  (full detail on each role card)")
    d.b("Game Master — by the TV, outside the game.","Students never come to them. Owns the round clock, the death-count threshold, the point target, New round, and Undo — they are the only Undo. Break-glass: takes over the desk if Central Command's phone dies.")
    d.b("Central Command — lobby desk.","In the game, and does not leave the desk. Runs every meeting aloud and its four phases. Reveals ejections. Marks the whiteboard death count. Verifies portable tasks downstairs. One end of the red-ball run. Runs Sabotage from its script page and calls SUCCESS or FAILED. Does not hold the clock.")
    d.b("Foreman — stage.","Cups, apples, flight zone. Verify instantly, mark the card, then make the student reset the station.")
    d.b("Roaming Referee — upstairs.","Owns the upstairs floor. Enforces walking, splits every group of 3+, verifies portable tasks upstairs.")
    d.b("Ghost Guide — dead room.","Origami and quiet. One end of the red-ball run, handled at the doorway. Ghosts never attend meetings, so neither do they.")
    d.b("Verification","is a marker — four unmistakably different, one per counselor on the floor, never set down. The Game Master verifies nothing. Your mark is final; every checkable answer is on the 4-page answer sheet, by group number.")
    d.b("Any role can pause the game,","and any imposter can tap any counselor to start a Sabotage. Only the Game Master can undo — a mis-tap gets called across to them.")
    d.b("Counselors do not stop kills.","Standing next to an adult is not protection, and a kill in front of you counts.")

    d.h1("The tasks")
    d.h2("Easy — 1 point each · on every card")
    d.b("DOORS.","The card names the student's row (their group number) and THEIR 3 doors — always at least one per floor. They copy BOTH letters at each; verify all 6 characters against the answer sheet, where those doors are boxed. Every group has different codes at every door, so a copied answer is 6 wrong characters. (All 7 doors was a slog — night one's verdict.)")
    d.b("GOSPEL & THEME.","The card gives a word (GOD · PAYING · OUR · EVERYONE · SINS · LIFE). Six boxes around the building each show a sentence with its first word blanked. The student takes ONE card from the box their word completes and hands it over. Check the word on the answer sheet against the card. Keep the card — an adult restocks between rounds.")
    d.h2("Medium — 2 points each · three per card")
    d.b("SIMPLE MAZE / SUDOKU.","Take one numbered puzzle slip, solve it, show any counselor. Sudoku answers are on the key by number — or scan it by eye.")
    d.b("CUP STACK.","All 15 cups in a pyramid, then the student resets the lane before leaving.")
    d.b("APPLE STACK.","Three apples freestanding for three full seconds. Count out loud.")
    d.b("SPECIAL DELIVERY.","Carry one red ball between Central Command and the dead-room doorway — the card names the direction. The receiving counselor takes the ball and marks the card. Empty end? Fetch one from the far end and bring it back — that counts. No ball anywhere? Do another task and come back. Killed mid-carry: the ball goes on the floor beside the body.")
    d.h2("Hard — 3 points · one per card")
    d.b("FIND THE VERSE.","Three references on the card. Look each up in a pew Bible, write the page number. All three must match the answer sheet.")
    d.b("I CAN FLY.","Fold a paper plane and throw it from the near line past the far line. Unlimited tries, nothing to reset. The far line is tape — move it if it's wrong.")
    d.h2("Dead room — ghosts only")
    d.b("ORIGAMI.","GREEN 2 points, BLUE 3. Purchased kits: one sheet at a time, and the fold must match the kit's picture. Dying slows you down; it does not excuse you from the target.")

    d.h1("Imposters")
    d.b("Blend in.","Do real tasks, earn real marks — an imposter's card looks exactly like anyone else's, so “show me your card” proves nothing.")
    d.b("The kill.","Tap, say nothing, keep walking. Walk through a doorway to reload before the next one. Target anyone standing alone.")
    d.b("SABOTAGE.","Hold any STATUS KIOSK screen for 2 full seconds, then walk away — it fires 5–15 seconds later, and nobody knows who. (Tapping any counselor with your spoon still works too.) The TV goes red and the alarm sounds; in the dark, dim the lights as well. Central Command reads the drawn props off the TV. The crew has 2:00 — ONE ITEM PER PERSON, a different person per prop. Succeed: +1:00 on the round clock. Fail: +2 deaths and −1:30. Two per round, none in the first two minutes. Night one barely used it — sell it to the imposters in the briefing.")
    d.b("Sabotage safety.","Lights DIM, never off. One counselor stands at the stairs and does nothing else. Flashlights to the stairs and the Ghost Guide. Running during Sabotage costs a mark, crossed out on the spot.")

    d.h1("Death, bodies and meetings")
    d.b("When you die:","lie down where you were tapped — against a wall, never in a doorway, never on stairs. Silent. You stay until someone finds you.")
    d.b("Finding a body:","say NOTHING at the scene. Walk to the lobby, and the moment you cross in, yell EMERGEN-C. Everyone echoes it and walks in. The dead player stands and walks straight to the dead room — ghosts do not attend meetings.")
    d.b("The meeting — 3:00, hard stop.","0:00–0:30 THE REPORT: silence; the finder says where the body was, who they saw, who they suspect; interrupting costs your vote. 0:30–2:00 NOMINATIONS: “I nominate ___ because ___” — no second within five seconds and it dies; ends at three seconded names. Nobody seconded by 2:00 and the finder of the body names one. 2:00–2:30 THE CORNERS: 15 seconds each to answer. 2:30–3:00 THE VOTE: every nominee has a corner and everyone stands in one — there is no centre and no skip; largest corner wins, and a tie ejects every tied nominee.")
    d.b("Reveal every ejection on the spot.","Name each player who is going out and say whether they were an imposter. Crewmate: out — the board does NOT move. Imposter: caught, and the crew earns +1:00 on the clock for each one. Then everyone back to the floor — Central Command never lets a meeting stretch past 3:00.")

    d.h1("Quick rulings")
    for a,b_ in [
      ("“Can I see your card?”","Allowed. Imposters carry real marks, so it proves nothing."),
      ("Student won't do tasks","Walk them to a station. Quietly tell the imposters to target loiterers."),
      ("Pack of 3+ moving together","Referee splits them. Maximum group is TWO."),
      ("Two students claim one kill","Both are dead. Move on."),
      ("A student runs","Verbal warning, then cross out one mark box and initial it."),
      ("Argument over a mark","The counselor's mark is final. No appeals."),
      ("Imposter taps any counselor","Sabotage triggers, whoever it was."),
      ("Ejected player was an imposter","No tick — and the crew earns +1:00 on the round clock, per imposter."),
      ("Ejected player was a crewmate","Also no tick. They're just dead — losing a live tasker is cost enough."),
      ("The vote is a tie","Every tied nominee is ejected. Two corners tie, two students go; three tie, three go."),
      ("The room won't nominate anybody","The finder of the body names one, and that name goes out. A meeting never ends with nobody ejected."),
      ("“Can we just skip?”","No. There is no centre and no skip corner — the room chooses who goes, not whether."),
      ("A crew student pokes the kiosk","Nothing happens — short taps are inert. Don't explain why."),
      ("Lost card","Central Command reissues once: student states their total, CC writes and initials it. Taking or destroying someone else's card ends your night."),
      ("Ghost talking toward the hall","Ghost Guide pauses their origami for 30 seconds."),
      ("A counselor mis-taps the app","Call it to the Game Master. Undo is theirs alone, and it moves the whole game back one step."),
      ("No red ball at either end","All three are in transit. Do another task and come back."),
      ("Doors close?","Students never close doors. A counselor may, reopening after 5 seconds."),
    ][:-1]+[("Doors close?","Students never close doors. A counselor may, reopening after 5 seconds.")]:
        d.rule_row(a,b_)

    d.h1("Safety")
    d.b("No running — ever.","One foot on the ground at all times, everyone, always. Enforce it hardest during Sabotage and Emergen-C transit, when adrenaline peaks.")
    d.b("Touch = spoon tap,","shoulder or upper back only. No grabbing, no tackling, no chasing. Say it aloud in the briefing — 6-foot seniors and 11-year-olds share this floor.")
    d.b("Bodies lie against a wall,","never in a doorway, never on stairs.")
    d.b("Apples sit on a tray or towel","— they fall constantly and they roll.")
    d.b("Know your exits","and stair locations before anything dims.")

    d.h1("The briefing  (8 minutes, and not one more)")
    d.p("Don't explain the ruleset — explain enough to start moving. The deck follows this order.",col=GREY,sz=9.8)
    for i,t in enumerate([
      "“Everyone has a spoon. Three of you are imposters.”",
      "“Your card is worth 11 points. Tonight you need ___. You pick which tasks.”",
      "“Find a counselor to mark each task. Four counselors, four different marks.”",
      "“A spoon tap on the shoulder kills you. Lie down against a wall, stay silent until you're found — then fold origami in the dead room. You still need your points.”",
      "“Find a body: say nothing, WALK to the lobby, THEN yell Emergen-C.”",
      "“Every meeting sends somebody out — you are voting on WHO, never on whether. A tie sends everyone tied. The result is revealed on the spot.”",
      "“Walk. One foot on the ground. Always.”",
      "“If the lights dim, freeze and listen for Central Command. One item per person.”"],1):
        d.b(f"{i}.",t)
    d.b("Privately, at the reveal, tell the imposters:","do real tasks, get real marks, walk through a doorway between kills, nothing in the first minute, target anyone alone — and a 2-second hold on any status kiosk fires a Sabotage after you're gone. Use them: an unused Sabotage is a free gift to the crew.")

    d.h1("The reveal  (every round — night one skipped it and the imposters suffered)")
    d.p("Imposters must know each other. Circle up, then read this verbatim:",col=GREY,sz=9.8)
    for i,t in enumerate([
      "“Everyone: eyes closed.”  (walk the circle, tap the imposters)",
      "“If I tapped you — and only if I tapped you — raise a hand high. Eyes stay closed.”",
      "“Imposters: open your eyes. Every raised hand is your partner. Memorize them.”",
      "“Imposters: close your eyes. Hands down.”",
      "“Everyone: arms up. … And down.”  (cover — nobody can tell who moved before)",
      "“Open your eyes.”"],1):
        d.b(f"{i}.",t)

    d.h1("Ten-minute pre-game check")
    for t in ["7 door sheets taped up, all four corners","6 Sabotage props taped at their printed doors",
      "Tonight's target written on all 4 answer-sheet copies — Bibles are ESV LARGE PRINT (other prints = different page numbers)",
      "6 gospel boxes stocked and spread out — OUR and SINS far apart","Bible table set with 6 identical Bibles",
      "Cup lanes reset, apple trays down, both flight-zone lines taped","Sudoku and maze stacks out",
      "Red balls in the bowls","Whiteboard blank, death count 0, threshold written beside it",
      "Every phone scanned in and its dot GREEN, sound tapped on, both TVs' volume HIGH — night one never heard the cues",
      "1–2 kiosk tablets charged, opened to the Status screen, propped in quiet hallways",
      "A spoon in EVERY student's hand","Imposters briefed privately",
      "Every counselor: role card + ALL COUNSELORS page + all 4 answer-sheet pages"]:
        d.box(t)
    d.gap(8)
    d.p("Every printable named here is in the print pack — PRINT-ME-FIRST.md lists what to print, how many, and on what paper.",col=GREY,sz=9.3)
    d.footer(); d.c.save()
    return d.pg

n=build()
n2=build(total=n,path="footprints-print-pack/FACILITATOR-PLAYBOOK.pdf")
assert n==n2
print(f"wrote FACILITATOR-PLAYBOOK.pdf — {n} pages")
