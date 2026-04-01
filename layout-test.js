const fs = require('fs');
const state = JSON.parse(fs.readFileSync('data/publish-state.json','utf8'));
const NODE_W=180,NODE_H=120,H_GAP=50,V_GAP=100,PADDING=60;
const ADJACENT_THRESHOLD=NODE_W+H_GAP+2;

function getParentsOf(id){return state.relationships.filter(r=>r.type==='parent-child'&&r.childId===id).map(r=>r.parentId);}
function getChildrenOf(id){return state.relationships.filter(r=>r.type==='parent-child'&&r.parentId===id).map(r=>r.childId);}
function getPartnersOf(id){return state.relationships.filter(r=>r.type==='partner'&&(r.person1Id===id||r.person2Id===id)).map(r=>r.person1Id===id?r.person2Id:r.person1Id);}
function getPerson(id){return state.persons.find(p=>p.id===id);}
function name(id){return getPerson(id)?.name?.split(' ')[0]||id;}

function getStamboomPersons(headId){
  const result=new Set();
  function walk(id){if(result.has(id))return;result.add(id);getPartnersOf(id).forEach(p=>result.add(p));getChildrenOf(id).forEach(c=>walk(c));}
  walk(headId);return [...result];
}

function fixOverlaps(gen,byGen,partnersOf,genOf,pos){
  const genMembers=(byGen[gen]||[]).filter(id=>pos[id]);
  const inUnit=new Set();const units=[];
  genMembers.forEach(id=>{
    if(inUnit.has(id))return;
    const myP=(partnersOf[id]||[]).filter(pid=>genOf[pid]===gen&&pos[pid]&&Math.abs(pos[id].x-pos[pid].x)<=ADJACENT_THRESHOLD);
    const unit=[id,...myP].sort((a,b)=>pos[a].x-pos[b].x);
    unit.forEach(u=>inUnit.add(u));units.push(unit);
  });
  units.sort((a,b)=>pos[a[0]].x-pos[b[0]].x);
  for(let i=1;i<units.length;i++){
    const prevRight=pos[units[i-1][units[i-1].length-1]].x;
    const currLeft=pos[units[i][0]].x;
    const minX=prevRight+NODE_W+H_GAP;
    if(currLeft<minX){const shift=minX-currLeft;for(let j=i;j<units.length;j++)units[j].forEach(uid=>{pos[uid].x+=shift;});}
  }
}

function computeLayout(ids){
  const persons=state.persons.filter(p=>ids.has(p.id));
  const childrenOf={},parentsOf={},partnersOf={};
  persons.forEach(p=>{childrenOf[p.id]=[];parentsOf[p.id]=[];partnersOf[p.id]=[];});
  state.relationships.forEach(r=>{
    if(r.type==='parent-child'){
      if(childrenOf[r.parentId]!==undefined)childrenOf[r.parentId].push(r.childId);
      if(parentsOf[r.childId]!==undefined)parentsOf[r.childId].push(r.parentId);
    } else if(r.type==='partner'){
      if(partnersOf[r.person1Id]!==undefined)partnersOf[r.person1Id].push(r.person2Id);
      if(partnersOf[r.person2Id]!==undefined)partnersOf[r.person2Id].push(r.person1Id);
    }
  });
  const genOf={};
  const roots=persons.filter(p=>parentsOf[p.id].length===0).map(p=>p.id);
  const queue=[...roots];let head=0;roots.forEach(id=>{genOf[id]=0;});
  while(head<queue.length){const id=queue[head++];const g=genOf[id]||0;(childrenOf[id]||[]).forEach(cid=>{if(genOf[cid]===undefined||genOf[cid]<g+1){genOf[cid]=g+1;queue.push(cid);}});}
  persons.forEach(p=>{if(genOf[p.id]===undefined)genOf[p.id]=0;});
  for(let pass=0;pass<6;pass++){
    state.relationships.forEach(r=>{
      if(r.type==='partner'){
        const g=Math.max(genOf[r.person1Id]||0,genOf[r.person2Id]||0);
        if(genOf[r.person1Id]!==undefined)genOf[r.person1Id]=g;
        if(genOf[r.person2Id]!==undefined)genOf[r.person2Id]=g;
      }
    });
  }
  const byGen={};persons.forEach(p=>{const g=genOf[p.id];if(!byGen[g])byGen[g]=[];byGen[g].push(p.id);});
  const gens=Object.keys(byGen).map(Number).sort((a,b)=>a-b);
  const pos={};

  // gen0
  {
    const gen0=byGen[0]||[];const seen=new Set();const ordered=[];
    gen0.filter(id=>(parentsOf[id]||[]).length===0).forEach(id=>{
      if(seen.has(id))return;seen.add(id);ordered.push(id);
      (partnersOf[id]||[]).filter(pid=>gen0.includes(pid)&&!seen.has(pid)).forEach(pid=>{seen.add(pid);ordered.push(pid);});
    });
    gen0.forEach(id=>{if(seen.has(id))return;seen.add(id);ordered.push(id);});
    let curX=PADDING;ordered.forEach(id=>{pos[id]={x:curX,y:PADDING};curX+=NODE_W+H_GAP;});
  }

  // top-down
  gens.filter(g=>g>0).forEach(gen=>{
    const yPos=PADDING+gen*(NODE_H+V_GAP);const genIds=byGen[gen]||[];
    const withParents=genIds.filter(id=>(parentsOf[id]||[]).filter(pid=>pos[pid]).length>0);
    const inlaws=genIds.filter(id=>(parentsOf[id]||[]).filter(pid=>pos[pid]).length===0);
    const groups={};
    withParents.forEach(id=>{const ps=(parentsOf[id]||[]).filter(pid=>pos[pid]).sort();const key=ps.join(',');if(!groups[key])groups[key]={parentIds:ps,children:[]};groups[key].children.push(id);});
    const sortedGroups=Object.values(groups).sort((a,b)=>{
      const cx=g=>{const xs=g.parentIds.map(pid=>pos[pid].x+NODE_W/2);return(Math.min(...xs)+Math.max(...xs))/2;};return cx(a)-cx(b);
    });
    const placedInlaws=new Set();let cursorX=PADDING;
    sortedGroups.forEach(group=>{
      const parentXs=group.parentIds.map(pid=>pos[pid].x+NODE_W/2);
      const parentCenter=(Math.min(...parentXs)+Math.max(...parentXs))/2;
      const expanded=[];
      group.children.forEach(cid=>{
        expanded.push(cid);
        (partnersOf[cid]||[]).forEach(pid=>{if(inlaws.includes(pid)&&!placedInlaws.has(pid)){expanded.push(pid);placedInlaws.add(pid);}});
      });
      const totalW=expanded.length*NODE_W+(expanded.length-1)*H_GAP;
      let startX=parentCenter-totalW/2;if(startX<cursorX)startX=cursorX;
      expanded.forEach((id,i)=>{pos[id]={x:startX+i*(NODE_W+H_GAP),y:yPos};});
      cursorX=startX+totalW+H_GAP;
    });
    inlaws.forEach(id=>{
      if(placedInlaws.has(id))return;
      const partner=(partnersOf[id]||[]).find(pid=>pos[pid]&&genOf[pid]===gen);
      if(partner){pos[id]={x:pos[partner].x+NODE_W+H_GAP,y:yPos};}
      else{const maxX=Math.max(PADDING,...genIds.filter(gid=>pos[gid]).map(gid=>pos[gid].x));pos[id]={x:maxX+NODE_W+H_GAP,y:yPos};}
    });
    fixOverlaps(gen,byGen,partnersOf,genOf,pos);
  });

  // bottom-up with cascade
  [...gens].reverse().forEach(gen=>{
    const processed=new Set();
    (byGen[gen]||[]).forEach(id=>{
      if(processed.has(id)||!pos[id])return;
      const myP=(partnersOf[id]||[]).filter(pid=>genOf[pid]===gen&&pos[pid]);
      const unit=[id,...myP];unit.forEach(pid=>processed.add(pid));
      const allCh=new Set();unit.forEach(pid=>(childrenOf[pid]||[]).filter(cid=>pos[cid]).forEach(cid=>allCh.add(cid)));
      if(!allCh.size)return;
      const chXs=[...allCh].map(cid=>pos[cid].x+NODE_W/2);
      const chCenter=(Math.min(...chXs)+Math.max(...chXs))/2;
      const uXs=unit.map(pid=>pos[pid].x);
      const uCenter=(Math.min(...uXs)+Math.max(...uXs)+NODE_W)/2;
      const shift=chCenter-uCenter;
      if(Math.abs(shift)>1)unit.forEach(pid=>{pos[pid].x+=shift;});
    });
    const xBefore={};(byGen[gen]||[]).forEach(id=>{if(pos[id])xBefore[id]=pos[id].x;});
    fixOverlaps(gen,byGen,partnersOf,genOf,pos);
    const propagated=new Set();
    function cascadeShift(id,delta){
      if(propagated.has(id)||!pos[id]||Math.abs(delta)<1)return;
      propagated.add(id);pos[id].x+=delta;
      (partnersOf[id]||[]).forEach(pid=>{
        if(!propagated.has(pid)&&pos[pid]&&genOf[pid]!==gen&&Math.abs((pos[id].x-delta)-pos[pid].x)<=ADJACENT_THRESHOLD)cascadeShift(pid,delta);
      });
      (childrenOf[id]||[]).forEach(cid=>cascadeShift(cid,delta));
    }
    (byGen[gen]||[]).forEach(id=>{
      if(!pos[id]||xBefore[id]===undefined)return;
      const delta=pos[id].x-xBefore[id];
      if(Math.abs(delta)<1)return;
      (childrenOf[id]||[]).forEach(cid=>cascadeShift(cid,delta));
    });
  });

  return pos;
}

const waliId=state.persons.find(p=>p.name==='Wali Mohammad Sayedi').id;
const ids=new Set(getStamboomPersons(waliId));
const pos=computeLayout(ids);

console.log('=== EINDPOSITIES WALI TREE ===');
[...ids].forEach(id=>{
  if(pos[id]) console.log(name(id).padEnd(15), 'x='+Math.round(pos[id].x).toString().padStart(5), 'y='+pos[id].y);
  else console.log(name(id).padEnd(15), 'GEEN POSITIE');
});
const s06='s06',s07='s07',s08='s08';
console.log('\nHelai-Gaffar gap:', pos[s07]&&pos[s06]?pos[s07].x-pos[s06].x-NODE_W:'?');
const oCenter=pos[s06]&&pos[s07]?(pos[s06].x+NODE_W/2+pos[s07].x+NODE_W/2)/2:'?';
console.log('Ouders center:', oCenter);
console.log('Benjamin center:', pos[s08]?pos[s08].x+NODE_W/2:'?');
