// Dynamic process timing + overlay renderer.
// Source of truth: each live ArcGIS row's Chart_dates (data[i].date) + PROCESS_STAGE.

const STAGES=[
  {key:'STRATEGIC PLANNING',color:'#16e6e9',lane:.25},
  {key:'MARKET EVALUATION',color:'#3e91d7',lane:.36},
  {key:'TERM SHEET / LOI NEGOTIATIONS',color:'#16e6e9',lane:.48},
  {key:'LEASE NEGOTIATIONS',color:'#49be85',lane:.58},
  {key:'DESIGN / PERMIT / CONSTRUCTION',color:'#d5a536',lane:.68}
];

const aliases=new Map([
  ['STRATEGIC PLANNING','STRATEGIC PLANNING'],
  ['MARKET EVALUATION','MARKET EVALUATION'],
  ['TERM SHEET / LOI NEGOTIATIONS','TERM SHEET / LOI NEGOTIATIONS'],
  ['TERM SHEET/LOI NEGOTIATIONS','TERM SHEET / LOI NEGOTIATIONS'],
  ['TERM SHEET / LOI','TERM SHEET / LOI NEGOTIATIONS'],
  ['LEASE NEGOTIATIONS','LEASE NEGOTIATIONS'],
  ['DESIGN / PERMIT / CONSTRUCTION','DESIGN / PERMIT / CONSTRUCTION'],
  ['DESIGN · PERMIT · CONSTRUCTION','DESIGN / PERMIT / CONSTRUCTION']
]);

function normalizeStage(v){
  const s=String(v??'').trim().toUpperCase().replace(/\s+/g,' ');
  return aliases.get(s)||null;
}

function stageModel(data,x1){
  const rows=data
    .map((d,i)=>({i,date:d.date,stage:normalizeStage(d.processStage)}))
    .filter(r=>r.stage&&Number.isFinite(+r.date))
    .sort((a,b)=>a.date-b.date);

  if(!rows.length) return [];

  // First live Chart_date assigned to each stage is its authoritative start.
  const starts=new Map();
  for(const r of rows) if(!starts.has(r.stage)) starts.set(r.stage,r.date);

  const present=STAGES
    .filter(s=>starts.has(s.key))
    .map(s=>({...s,start:starts.get(s.key)}))
    .sort((a,b)=>a.start-b.start);

  return present.map((s,i)=>({
    ...s,
    end:i<present.length-1?present[i+1].start:new Date(x1)
  }));
}

function humanDuration(a,b){
  const days=Math.max(0,Math.round((+b-+a)/86400000));
  if(days<45)return `${days} days`;
  const months=Math.max(1,Math.round(days/30.4375));
  if(months<18)return `${months} month${months===1?'':'s'}`;
  const years=months/12;
  return `${years.toFixed(years<3?1:0)} years`;
}

function syncSchedule(scheduleEl,model){
  if(!scheduleEl)return;
  const boxes=[...scheduleEl.querySelectorAll('.phasebox')];
  boxes.forEach((box,i)=>{
    const def=STAGES[i],stage=model.find(s=>s.key===def.key);
    const strong=box.querySelector('strong'),tiny=box.querySelector('.tiny');
    if(strong) strong.textContent=def.key.replaceAll(' / ',' / ');
    if(tiny){
      tiny.textContent=stage
        ? `${humanDuration(stage.start,stage.end)} · live transaction timing`
        : 'Not assigned in PROCESS_STAGE';
    }
    box.style.opacity=stage?'1':'.45';
  });
}

function drawProcess({data,x,m,W,H,x0,x1,svg,ns,txt,scheduleEl}){
  const model=stageModel(data,x1);
  syncSchedule(scheduleEl,model);
  if(!model.length)return;

  const defs=svg.querySelector('defs')||svg.insertBefore(ns('defs'),svg.firstChild);
  model.forEach((p,i)=>{
    const a=Math.max(m.l,x(p.start)),b=Math.min(W-m.r,x(p.end));if(b<=a)return;
    const yy=m.t+(H-m.t-32)*p.lane,id=`pg${i}`,g=ns('linearGradient',{id,x1:'0%',y1:'0%',x2:'100%',y2:'0%'});
    g.appendChild(ns('stop',{offset:'0%','stop-color':p.color,'stop-opacity':'.10'}));
    g.appendChild(ns('stop',{offset:'50%','stop-color':p.color,'stop-opacity':'.34'}));
    g.appendChild(ns('stop',{offset:'100%','stop-color':p.color,'stop-opacity':'.10'}));defs.appendChild(g);
    svg.appendChild(ns('rect',{x:a,y:yy-8,width:b-a,height:16,rx:6,fill:`url(#${id})`,stroke:p.color,'stroke-width':'1.6','stroke-opacity':'.78'}));
    if(b-a>95){const t=txt((a+b)/2,yy-13,p.key,'proc','middle');t.setAttribute('fill',p.color)}
    if(b-a>145){const st=txt((a+b)/2,yy+21,humanDuration(p.start,p.end),'axis','middle');st.setAttribute('fill','#a9bac7')}
  });
}

export { drawProcess, stageModel };
