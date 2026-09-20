// Dynamic transaction process engine.
// AUTHORITATIVE TIMING: ArcGIS Chart_dates + PROCESS_STAGE.
// No client-specific calendar dates or Akerman timing assumptions live here.

const STAGES = [
  { key:'STRATEGIC PLANNING', color:'#16e6e9', lane:.25, description:'Objectives · constraints · viable scenarios' },
  { key:'MARKET EVALUATION', color:'#3e91d7', lane:.36, description:'Extended market discovery · options · proposals' },
  { key:'TERM SHEET / LOI NEGOTIATIONS', color:'#16e6e9', lane:.48, description:'Competing proposals · core business terms' },
  { key:'LEASE NEGOTIATIONS', color:'#49be85', lane:.58, description:'Documentation · final lease terms' },
  { key:'DESIGN / PERMIT / CONSTRUCTION', color:'#d5a536', lane:.68, description:'Planning · approvals · buildout · occupancy' }
];

function canonicalStage(value){
  let s=String(value ?? '').trim().toUpperCase();
  s=s.replace(/[·|]/g,' / ').replace(/\s*\/\s*/g,' / ').replace(/\s+/g,' ').trim();

  if(s==='STRATEGIC PLANNING') return STAGES[0].key;
  if(s==='MARKET EVALUATION') return STAGES[1].key;
  if(
    s==='TERM SHEET / LOI NEGOTIATIONS' ||
    s==='TERM SHEET / LOI NEGOTIATION' ||
    s==='TERM SHEET / LOI'
  ) return STAGES[2].key;
  if(s==='LEASE NEGOTIATIONS' || s==='LEASE NEGOTIATION') return STAGES[3].key;
  if(
    s==='DESIGN / PERMIT / CONSTRUCTION' ||
    s==='DESIGN / PERMIT / CONST' ||
    s==='DESIGN / PERMIT / CONSTR'
  ) return STAGES[4].key;

  // Tolerate ArcGIS display truncation/legacy punctuation without inventing timing.
  if(s.startsWith('TERM SHEET') && s.includes('LOI')) return STAGES[2].key;
  if(s.startsWith('DESIGN') && s.includes('PERMIT')) return STAGES[4].key;
  return null;
}

function fmtDate(d){
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;
}

function dayBefore(d){
  const x=new Date(+d); x.setDate(x.getDate()-1); return x;
}

function buildStageModel(data,x1){
  const live=data
    .map((d,i)=>({i,date:d.date,stage:canonicalStage(d.processStage)}))
    .filter(r=>r.stage && Number.isFinite(+r.date))
    .sort((a,b)=>a.date-b.date);

  if(!live.length) return [];

  // First Chart_date carrying a PROCESS_STAGE is that stage's start.
  // The next stage's first Chart_date is the prior stage's exclusive end boundary.
  const firstDate=new Map();
  for(const r of live){
    if(!firstDate.has(r.stage)) firstDate.set(r.stage,new Date(+r.date));
  }

  const ordered=STAGES
    .filter(s=>firstDate.has(s.key))
    .map(s=>({...s,start:firstDate.get(s.key)}))
    .sort((a,b)=>a.start-b.start);

  return ordered.map((s,i)=>{
    const next=ordered[i+1];
    const exclusiveEnd=next ? new Date(+next.start) : new Date(x1);
    const displayEnd=next ? dayBefore(next.start) : new Date(x1);
    return {...s,exclusiveEnd,displayEnd};
  });
}

function syncSchedule(scheduleEl,model){
  if(!scheduleEl) return;
  const boxes=[...scheduleEl.querySelectorAll('.phasebox')];

  STAGES.forEach((def,i)=>{
    const box=boxes[i];
    if(!box) return;
    const stage=model.find(s=>s.key===def.key);
    const strong=box.querySelector('strong');
    const tiny=box.querySelector('.tiny');

    if(strong) strong.textContent=def.key.replaceAll(' / ',' / ');
    if(tiny){
      tiny.textContent=stage
        ? `${def.description} · ${fmtDate(stage.start)} – ${fmtDate(stage.displayEnd)}`
        : `${def.description} · not assigned`;
    }
    box.style.opacity=stage ? '1' : '.42';
  });
}

function drawProcess({data,x,m,W,H,x0,x1,svg,ns,txt,scheduleEl}){
  const model=buildStageModel(data,x1);
  syncSchedule(scheduleEl,model);
  if(!model.length) return;

  const defs=svg.querySelector('defs') || svg.insertBefore(ns('defs'),svg.firstChild);

  model.forEach((p,i)=>{
    const a=Math.max(m.l,x(p.start));
    const b=Math.min(W-m.r,x(p.exclusiveEnd));
    if(b<=a) return;

    const yy=m.t+(H-m.t-32)*p.lane;
    const id=`processGradient${i}`;
    const g=ns('linearGradient',{id,x1:'0%',y1:'0%',x2:'100%',y2:'0%'});
    g.appendChild(ns('stop',{offset:'0%','stop-color':p.color,'stop-opacity':'.10'}));
    g.appendChild(ns('stop',{offset:'50%','stop-color':p.color,'stop-opacity':'.34'}));
    g.appendChild(ns('stop',{offset:'100%','stop-color':p.color,'stop-opacity':'.10'}));
    defs.appendChild(g);

    svg.appendChild(ns('rect',{
      x:a,y:yy-8,width:b-a,height:16,rx:6,
      fill:`url(#${id})`,stroke:p.color,
      'stroke-width':'1.6','stroke-opacity':'.82'
    }));

    if(b-a>95){
      const title=txt((a+b)/2,yy-13,p.key,'proc','middle');
      title.setAttribute('fill',p.color);
    }
    if(b-a>145){
      const dates=txt((a+b)/2,yy+21,`${fmtDate(p.start)} – ${fmtDate(p.displayEnd)}`,'axis','middle');
      dates.setAttribute('fill','#a9bac7');
    }
  });
}

export { drawProcess, buildStageModel };
