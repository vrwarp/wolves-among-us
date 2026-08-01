const pptx = require('pptxgenjs');
const p = new pptx();
p.layout = 'LAYOUT_16x9';                 // 10 x 5.625in, same as the v1 deck
p.author='Footprints'; p.title='Among Us: Footprints Edition';
const O='FF5722', B='4285F4', G='666666', D='222222', LG='8A8A8A';
const DISP='Bookman Old Style', BODY='Calibri';
const W=10, H=5.625, M=0.6;

function bar(s,x,y,w){ s.addShape(p.ShapeType.rect,{x,y,w,h:0.055,fill:{color:B}}); }

function title(t,sub){
  const s=p.addSlide();
  s.addText(t,{x:0,y:1.55,w:W,h:1.1,align:'center',fontFace:DISP,bold:true,fontSize:62,color:O});
  bar(s,(W-0.8)/2,2.86,0.8);
  s.addText(sub,{x:0,y:3.15,w:W,h:0.5,align:'center',fontFace:BODY,fontSize:22,color:G});
  return s;
}
function section(t,sub){
  const s=p.addSlide();
  s.addText(t,{x:0,y:1.9,w:W,h:1.2,align:'center',fontFace:DISP,bold:true,fontSize:50,color:O});
  bar(s,(W-0.8)/2,3.18,0.8);
  if(sub) s.addText(sub,{x:0,y:3.45,w:W,h:0.4,align:'center',fontFace:BODY,fontSize:17,color:G});
  return s;
}
function shout(big,small){
  const s=p.addSlide();
  s.addText(big,{x:M,y:1.5,w:W-2*M,h:1.5,align:'center',fontFace:DISP,bold:true,fontSize:54,color:O});
  s.addText(small,{x:M,y:3.1,w:W-2*M,h:1.0,align:'center',fontFace:BODY,fontSize:21,color:G});
  return s;
}
function head(s,t,kicker){
  if(kicker) s.addText(kicker,{x:M,y:0.42,w:W-2*M,h:0.28,fontFace:BODY,bold:true,fontSize:11,
                               color:LG,charSpacing:2,margin:0});
  s.addText(t,{x:M,y:0.68,w:W-2*M,h:0.7,fontFace:DISP,bold:true,fontSize:33,color:D,margin:0});
}
// rows: [{n, name, desc}] with an orange numbered/lettered circle
function rows(t,kicker,items,noteTxt){
  const s=p.addSlide(); head(s,t,kicker);
  const n=items.length, region=(noteTxt?3.0:3.4);
  const gap=Math.min(1.05,(region-0.45)/Math.max(1,n-1));
  const blockH=(n-1)*gap+0.45;
  const top=1.55+(region-blockH)/2;
  items.forEach((it,i)=>{
    const y=top+i*gap;
    s.addShape(p.ShapeType.ellipse,{x:M,y:y,w:0.42,h:0.42,fill:{color:it.c||O}});
    s.addText(String(it.n),{x:M,y:y,w:0.42,h:0.42,align:'center',valign:'middle',
      fontFace:BODY,bold:true,fontSize:it.fs||16,color:'FFFFFF',margin:0});
    s.addText(it.name,{x:M+0.62,y:y-0.03,w:W-M-1.3,h:0.3,fontFace:BODY,bold:true,fontSize:17,color:D,margin:0});
    s.addText(it.desc,{x:M+0.62,y:y+0.23,w:W-M-1.3,h:0.3,fontFace:BODY,fontSize:13.5,color:G,margin:0});
  });
  if(noteTxt) s.addText(noteTxt,{x:M,y:H-0.72,w:W-2*M,h:0.35,fontFace:BODY,italic:true,
                                 fontSize:13,color:O,margin:0});
  return s;
}
// two big side-by-side panels
function duo(t,kicker,left,right){
  const s=p.addSlide(); head(s,t,kicker);
  [[left,M],[right,W/2+0.1]].forEach(([col,x])=>{
    const w=W/2-M-0.1;
    s.addShape(p.ShapeType.roundRect,{x,y:1.6,w,h:3.1,rectRadius:0.06,
      fill:{color:col.fill||'F7F6F4'},line:{color:'E6E3DF',width:1}});
    s.addText(col.head,{x:x+0.28,y:1.82,w:w-0.5,h:0.5,fontFace:DISP,bold:true,fontSize:21,
      color:col.hc||O,margin:0});
    s.addText(col.body.map((b,i)=>({text:b,options:{bullet:true,breakLine:i<col.body.length-1}})),
      {x:x+0.28,y:2.42,w:w-0.5,h:2.1,fontFace:BODY,fontSize:14,color:D,paraSpaceAfter:6,margin:0});
  });
  return s;
}
// one giant number + supporting text
function stat(t,kicker,num,label,lines){
  const s=p.addSlide(); head(s,t,kicker);
  s.addText(num,{x:M,y:1.7,w:3.1,h:1.5,align:'center',fontFace:DISP,bold:true,fontSize:96,color:O,margin:0});
  s.addText(label,{x:M,y:3.15,w:3.1,h:0.4,align:'center',fontFace:BODY,bold:true,fontSize:15,color:G,margin:0});
  s.addText(lines.map((b,i)=>({text:b,options:{bullet:true,breakLine:i<lines.length-1}})),
    {x:M+3.4,y:1.75,w:W-M-3.6-M,h:2.9,fontFace:BODY,fontSize:16,color:D,paraSpaceAfter:9,margin:0});
  return s;
}

/* ============================ SLIDES ============================ */
title('Among Us','Footprints Edition')
  .addNotes('Hand out cards and spoons as they arrive. Imposters were tapped privately beforehand.');

shout('NO RUNNING','Walking means there is always a foot on the ground. This one is a safety rule, not a game rule.')
  .addNotes('Say this first and say it again at the end. Enforce it hardest during a Sabotage and when someone is walking to report a body.');

rows('How the night works','THE FLOW',[
  {n:1,name:'Do the tasks on your card',desc:'Find a counselor to mark each one. Four counselors, four different markers.'},
  {n:2,name:'Hit tonight’s target',desc:'Your card is worth more than you need. You pick which tasks to do.'},
  {n:3,name:'Survive',desc:'Three of you are imposters. A tap on the shoulder with a spoon and you are dead.'},
],'Two rounds tonight — maybe three if we have time.')
  .addNotes('Do not explain the whole ruleset. Explain enough to start moving.');

section('Your Card','Everything you need is printed on it');

stat('What is on your card','YOUR CARD','11','POINTS AVAILABLE',[
  'Six tasks. Each one is worth 1, 2 or 3 points.',
  'You do NOT need all six — pick any combination that reaches tonight’s target.',
  'Your GROUP NUMBER is in the top right corner. You will need it.',
  'If you die, there are extra boxes at the bottom for origami.',
])
  .addNotes('Announce tonight’s target out loud here. 5 is the normal setting — 4 easy, 6 hard.');

section('The Tasks','Easy, medium and hard — you choose');

rows('Worth 1 point','EASY',[
  {n:1,name:'Doors',desc:'Your card names YOUR 3 doors. Copy the two letters posted for your row at each.'},
  {n:1,name:'Gospel & Theme',desc:'Your card gives you a word. Find the box whose sentence it completes.'},
],'Every card has both of these.');

rows('Worth 2 points','MEDIUM',[
  {n:2,name:'Simple Maze',desc:'Take one sheet, solve it, show any counselor.'},
  {n:2,name:'4×4 Sudoku',desc:'Take one sheet, fill in 1 to 4, show any counselor.'},
  {n:2,name:'Cup Stack',desc:'All 15 cups — then reset the lane before you leave.'},
  {n:2,name:'Apple Stack',desc:'Three apples, standing on their own for three full seconds.'},
  {n:2,name:'Special Delivery',desc:'Carry a red ball between the lobby and the dead room.'},
]);

rows('Worth 3 points','HARD',[
  {n:3,name:'Find the Verse',desc:'Three references on your card. Look each one up in a pew Bible and write down the page number.'},
  {n:3,name:'I Can Fly',desc:'Make a paper plane that flies past the far line. Unlimited tries.'},
],'Every card has exactly one 3-point task.');

rows('Doors','1 POINT  ·  SEVEN DOORS',[
  {n:'U',name:'Four doors upstairs, three downstairs',desc:'U1 U2 U3 U4 upstairs. D1 D2 D3 downstairs. Each has a sheet taped to it.',fs:15},
  {n:'#',name:'Find YOUR group number on the sheet',desc:'Your row is your group number. Everyone’s row is different.',fs:15},
  {n:2,name:'Copy BOTH letters',desc:'Two letters per door, fourteen in total. Write them in the boxes on your card.'},
],'Copying your friend’s answers will get you fourteen wrong letters.')
  .addNotes('This is the anti-copying task. Every group has different letters at every door.');

duo('Gospel & Theme','1 POINT',
  {head:'Your card gives you a word',body:[
    'GOD · PAYING · OUR · EVERYONE · SINS · LIFE',
    'One of these is printed on your card.',
    'It is the first word of one of the six sentences.']},
  {head:'Six boxes, six sentences',body:[
    'Each box shows a sentence with the first word blanked out.',
    'Find the one YOUR word completes.',
    'Take one card and show it to any counselor.',
    'Wrong box, no mark.'],hc:B});

duo('Special Delivery','2 POINTS  ·  THREE RED BALLS',
  {head:'Carry one ball',body:[
    'Your card tells you which way: lobby to dead room, or dead room to lobby.',
    'Hand it to the counselor at the other end. They mark your card.',
    'Hand off AT THE DOOR of the dead room. Do not go inside.']},
  {head:'No ball there?',body:[
    'Go to the other station, take one, and bring it back.',
    'That round trip still counts.',
    'No ball anywhere? Go do something else and come back.'],hc:B});

section('If You Are An Imposter','A few of you — and you know each other. Nobody else knows.');

rows('The kill','IMPOSTERS',[
  {n:1,name:'Tap them with your spoon',desc:'Shoulder or upper back only. Nothing else, ever.'},
  {n:2,name:'Say nothing. Keep walking.',desc:'Do not react, do not look back, do not smile.'},
  {n:3,name:'Walk through a doorway',desc:'That is your reload. You cannot kill again until you have left the room.'},
],'Do real tasks. Get real marks. Your card should look exactly like everyone else’s.')
  .addNotes('Brief the three imposters privately before the room fills.');

rows('Sabotage: Lights Out','IMPOSTERS  ·  TWICE PER ROUND',[
  {n:1,name:'Hold a STATUS KIOSK for 2 seconds',desc:'It fires after you walk away — nobody sees who. (Tapping a counselor works too.)'},
  {n:2,name:'The TV goes red and calls supplies',desc:'FUSE, BATTERY, KEYCARD, O2 TANK, WRENCH, REACTOR ROD — each one taped at a door.'},
  {n:3,name:'The crew has two minutes',desc:'ONE ITEM PER PERSON — a different person for every item. Nobody runs.'},
],'Crew fails: two more deaths and ninety seconds off the clock. Crew wins: a whole extra minute.')
  .addNotes('Lights DIM, never off. One counselor stands at the stairs and does nothing else.');

section('When You Die','It is not the end of your night');

rows('When you die','DEAD CREW',[
  {n:1,name:'Lie down where you were tapped',desc:'Against a wall. Never in a doorway, never on the stairs. Stay silent.'},
  {n:2,name:'Wait to be found',desc:'No pointing, no eye contact, no laughing. Someone will come.'},
  {n:3,name:'Then go to the dead room',desc:'When you hear EMERGEN-C, get up and walk straight there. You do not go to the meeting.'},
  {n:4,name:'Fold origami for points',desc:'GREEN 2 points. BLUE 3 points. One sheet at a time. You still need tonight’s target.'},
],'Dying slows you down. It does not excuse you.');

section('Emergency Meetings','The only way to catch an imposter');

rows('You found a body','EVERYONE',[
  {n:1,name:'Say nothing at the scene',desc:'Yelling here tells the whole building which hallway the body is in.'},
  {n:2,name:'WALK to the lobby',desc:'Walk. Then, the moment you cross into the lobby, yell EMERGEN-C.'},
  {n:3,name:'Everyone echoes and comes in',desc:'If you hear it, yell it, and walk to the lobby.'},
],'There is no button this year. Finding a body is the only way to call a meeting.');

rows('The meeting','THREE MINUTES  ·  HARD STOP',[
  {n:'1',name:'The report — 30 seconds',desc:'Silence. The finder says three things: where the body was, who they saw, who they suspect.',fs:15},
  {n:'2',name:'Nominations — 90 seconds',desc:'“I nominate ___ because ___.” No second, and the accusation dies.',fs:15},
  {n:'3',name:'The corners — 30 seconds',desc:'Each nominee gets fifteen seconds to answer their accuser.',fs:15},
  {n:'4',name:'The vote — 30 seconds',desc:'Walk to a corner to eject. Stand dead centre to skip. Biggest corner wins, ties eject nobody.',fs:15},
],'Ejections are revealed on the spot. A crewmate: no tick — just gone. An imposter: the crew earns +1:00.');

section('How It Ends');

duo('How it ends','WIN CONDITIONS',
  {head:'The crew wins',body:[
    'Every crewmate reaches tonight’s target — living and dead.',
    'Ghosts count. Their origami points count.',
    'Finished early? Keep working your card. Keep moving.']},
  {head:'The imposters win',body:[
    'The death count on the whiteboard hits the threshold.',
    'A Sabotage fails badly enough to run the clock out.',
    'The round clock reaches zero.'],hc:O,fill:'FDF0EC'});

shout('“For the wages of sin is death”','Romans 6:23a')
  .addNotes('Hold here for a beat before the debrief.');

shout('NO RUNNING','One foot on the ground. Always. Have fun out there.');

p.writeFile({fileName:'deck/among-us-footprints.pptx'}).then(f=>console.log('wrote',f));
