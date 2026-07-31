#!/usr/bin/env python3
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import Color, black
GREY=Color(.40,.38,.36); LINE=Color(.76,.74,.71)
PW,PH=letter
ROLES=[
("GAME MASTER","Counselor 5  ·  by the TV, outside the game","THE CLOCK, THE DIALS, THE UNDO",
 [("WHERE YOU STAND",["By the TV, where you can see the monitor. Students never come to you.",
                      "You run the night, not a station. You are not in the game."]),
  ("YOUR ONE JOB",["Hold the clock and the dials so Central Command can stay inside the fiction.",
                   "You are the only Undo. Nothing gets taken back unless you take it back."]),
  ("THE CLOCK — one stopwatch, counting DOWN",
   ["Start at 8:00 of floor time when the first 60 seconds are up.",
    "Start, pause, ±0:30, reset — all yours. Central Command does not touch it.",
    "ONLY meetings pause it. Sabotage does not pause it. Body transit does not pause it.",
    "Sabotage succeeds: +1:00.   Sabotage fails: −1:30 and +2 deaths.",
    "There is no doom timer. If no Sabotage ever fires, the round simply ends at 8:00."]),
  ("THE DIALS",["The death-count threshold and tonight's point target are yours to set and change.",
                "Start the threshold LOW. Raising it mid-night is easy; lowering it after the",
                "imposters have given up is not.",
                "NEW ROUND is yours alone — it clears the deaths and resets the clock."]),
  ("UNDO — nobody else has it",
   ["A counselor mis-taps, calls it across to you, and you put the game back one step.",
    "Undo moves the WHOLE game back one step, not just their tap. Do it once,",
    "then watch the TV to confirm what actually changed."]),
  ("IF THE DESK GOES DOWN",
   ["Central Command's phone dies: take over the desk and run the meetings from here.",
    "Only one of you holds the desk at a time — the death count is one number",
    "and the later tap wins."]),
  ("RULINGS",["Any imposter can tap YOU to start a Sabotage. Any role can pause the game.",
              "You do not verify tasks and you do not carry a marker.",
              "Announce tonight's target in the briefing. It is never printed on a card."])]),
("CENTRAL COMMAND","Counselor 4  ·  the lobby desk","THE MEETINGS AND THE DESK",
 [("WHERE YOU STAND",["The lobby desk. You do not leave it. You are in the game — students come to you."]),
  ("YOUR ONE JOB",["Moderate every meeting, out loud. Be ruthless about the 3-minute hard stop.",
                   "If students learn the timer stretches when the argument gets good, the whole night's pacing collapses."]),
  ("WHAT IS NOT YOURS",
   ["The round clock, the threshold, the point target, New round and Undo belong to the",
    "GAME MASTER. You do not touch them. Mis-tapped something? Call it across to them.",
    "A successful Sabotage adds 1:00 and a failed one takes 1:30 — they apply it, not you."]),
  ("MEETINGS — 3 minutes, hard stop",
   ["There is no button. A meeting happens ONLY when someone finds a body",
    "and yells EMERGEN-C in the lobby. You hold the PHASE stopwatch.",
    "0:00–0:30  THE REPORT. Silence. The finder says three things only: where the body was,",
    "                   who they saw nearby, who they suspect. Interrupting costs you your vote.",
    "0:30–2:00  NOMINATIONS. “I nominate ___ because ___.” Count down from five — no",
    "                   “I second that” and the accusation dies. Ends at 3 seconded nominations.",
    "2:00–2:30  THE CORNERS. Nominees to separate corners, 15 seconds each to answer.",
    "2:30–3:00  THE VOTE. “Ten seconds. Walk to a corner to eject. Dead centre to skip.”",
    "                   Still drifting at zero, you lose your vote. Largest corner wins. Tie = nobody goes.",
    "Reveal every ejection on the spot. Crewmate: tick the board. Imposter: no tick."]),
  ("WHAT YOU VERIFY",["Anything portable, from the desk: door codes, Bible pages, mazes, sudoku, gospel cards.",
                      "You are one end of the RED BALL delivery. Take the ball, mark the card, drop it in the bowl.",
                      "Bowl empty? Send them to the dead room to fetch one and bring it back — that counts."]),
  ("RULINGS",["Mark kills and crewmate ejections on the board. Ejected imposters are free.",
              "Lost card: reissue once. The student states their total, you write it and initial it.",
              "Taking or destroying someone else's card ends your night.",
              "Run Sabotage from its own page: time the 2:00 scramble, call SUCCESS or FAILED."])]),
("FOREMAN","Counselor 3  ·  the stage area","MARK FAST, THEN MAKE THEM RESET",
 [("WHERE YOU STAND",["The stage area. Cups, apples and the flight zone."]),
  ("YOUR ONE JOB",["Verify and mark instantly, then make the student reset the station before they leave.",
                   "You carry 28% of every task slot in the game. You are the bottleneck. Do not coach."]),
  ("WHAT YOU VERIFY",
   ["CUP STACK   2 pts   ·   All 15 cups. Then they reset the lane. Watch them do it.",
    "APPLE STACK   2 pts   ·   3 apples, freestanding, 3 full seconds. Count out loud.",
    "I CAN FLY   3 pts   ·   Past the far line. Unlimited tries. Nothing to reset."]),
  ("RULINGS",["Students may talk each other through a task. They may not do it FOR them.",
              "Apples go on a tray or towel. They will fall constantly and they roll.",
              "You do not stop kills. Standing next to you is not protection.",
              "Any imposter can tap YOU to start a Sabotage."])]),
("ROAMING REFEREE","Counselor 2  ·  upstairs","BREAK UP THE PACKS",
 [("WHERE YOU STAND",["Upstairs, moving. The upstairs floor is yours. Central Command covers downstairs."]),
  ("YOUR ONE JOB",["Enforce walking and break up every group of three or more. Maximum group size is TWO.",
                   "The buddy system is what makes this game boring. You are the cure."]),
  ("WHAT YOU VERIFY",["Anything portable, upstairs: door codes, Bible pages, mazes, sudoku, gospel cards.",
                      "Door codes are TWO letters per door, all seven doors. Check them against the answer sheet."]),
  ("RULINGS",["You do NOT need to keep moving to keep the floor dangerous.",
              "You do not stop kills. Standing next to you is not protection, and a kill in front of you counts.",
              "Any imposter can tap YOU to start a Sabotage — wait about five seconds, then start dimming.",
              "A student who runs: verbal warning, then cross out one mark box and initial it.",
              "No one closes a door. Not students, not you."])]),
("GHOST GUIDE","Counselor 1  ·  the dead room","KEEP IT QUIET, KEEP IT FOLDING",
 [("WHERE YOU STAND",["The dead room, near the door. High School boys room."]),
  ("YOUR ONE JOB",["Keep this room quiet and keep origami moving. Dead players still need their points —",
                   "dying slows you down, it does not excuse you."]),
  ("WHAT YOU VERIFY",["ORIGAMI   ·   GREEN 2 pts   ·   BLUE 3 pts",
                      "Compare the fold to the picture on the kit. One sheet at a time — never hand out two.",
                      "You are one end of the RED BALL delivery. Take the ball at the DOORWAY, mark the card, bowl it.",
                      "Living students never cross the threshold. Bowl empty? Send them to the lobby to fetch one."]),
  ("RULINGS",["Ghosts do NOT attend meetings. They stay here the whole round.",
              "When EMERGEN-C is called, the body gets up and comes straight here — not to the lobby.",
              "After each meeting, get the result from Central Command and tell your ghosts.",
              "A ghost talking toward the hallway: pause their origami for 30 seconds.",
              "Mis-tapped something? Call it across to the GAME MASTER. Undo is theirs alone."])]),
("ALL COUNSELORS","Read this before the doors open","THE FIVE THINGS THAT MATTER",
 [("SAFETY",["NO RUNNING. One foot on the ground at all times, everyone, always. Enforce it hardest",
             "during Sabotage and during Emergen-C transit, when adrenaline is highest.",
             "Shoulder or upper back only. No grabbing, no tackling, no chasing.",
             "Bodies lie AGAINST A WALL. Never in a doorway, never on stairs.",
             "During Sabotage: lights DIM, never off. One counselor stands at the stairs and does nothing else."]),
  ("VERIFYING",["Four distinct markers, one per counselor ON THE FLOOR — the four must be",
                "unmistakably different. The Game Master verifies nothing and carries none.",
                "Keep yours on you; never set it down where a student can take it.",
                "Your mark is final. No appeals.",
                "Every answer you check is on the ANSWER SHEET, by group number. Carry all four pages."]),
  ("THE GAME",["Everyone carries a spoon, so nobody can be identified as an imposter by carrying one.",
               "“Can I see your card?” is allowed. Imposters collect real marks, so a card proves nothing.",
               "No kills in the first 60 seconds.",
               "Bodies stay on the floor until someone finds them. The finder WALKS to the lobby, then yells.",
               "Counselors do not stop kills. Being next to an adult is not protection.",
               "Ejections are revealed on the spot. Only crewmate ejections tick the death count.",
               "Any role can pause the game. Mis-tapped the app? Call it to the GAME MASTER —",
               "Undo is theirs alone, and it moves the whole game back one step."]),
  ("TONIGHT'S TARGET",["Announced in the briefing, not printed on the cards. Cards are worth 11.",
                       "6 is easy, 8 is neutral, 10 is hard. At 8 or below a student can skip their 3-point task,",
                       "which is the slack that stops a jammed station locking anyone out."]),
  ("IF A STUDENT STALLS",["Walk them to a station. Tell the imposters to target anyone standing alone."])]),
]
c=canvas.Canvas("footprints-print-pack/07-counselor/role-cards.pdf",pagesize=(PW,PH))
for name,who,job,secs in ROLES:
    M=46; y=PH-46
    c.setFillColor(GREY); c.setFont("Helvetica-Bold",11)
    c.drawString(M,y-12,"A M O N G   U S :   F O O T P R I N T S   —   R O L E   C A R D")
    c.setFillColor(black)
    sz=40
    while c.stringWidth(name,"Helvetica-Bold",sz)>PW-2*M: sz-=2
    c.setFont("Helvetica-Bold",sz); c.drawString(M,y-56,name)
    c.setFillColor(GREY); c.setFont("Helvetica",13); c.drawString(M,y-76,who)
    c.setStrokeColor(black); c.setLineWidth(3); c.line(M,y-90,PW-M,y-90)
    c.setFillColor(black); c.setFont("Helvetica-Bold",15); c.drawString(M,y-112,job)
    y=y-132
    for title,lines in secs:
        c.setFillColor(GREY); c.setFont("Helvetica-Bold",8.5); c.drawString(M,y,title); y-=5
        c.setStrokeColor(LINE); c.setLineWidth(.8); c.line(M,y,PW-M,y); y-=15
        for ln in lines:
            c.setFillColor(black); c.setFont("Helvetica",11.5); c.drawString(M,y,ln); y-=14.5
        y-=9
    assert y>58, f"{name} overflows the bottom margin by {58-y:.0f}pt"
    for _t,_ls in secs:
        for _l in _ls:
            assert c.stringWidth(_l,"Helvetica",11.5)<=PW-2*M, f"{name}: line too wide -> {_l[:60]}"
    c.setFillColor(GREY); c.setFont("Helvetica",8.5)
    c.drawCentredString(PW/2,44,"one card per counselor  ·  keep it on your clipboard")
    c.showPage()
c.save(); print(f"role-cards.pdf — {len(ROLES)} pages")
