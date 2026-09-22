// Dynamic transaction process engine.
// Smartsheet/ArcGIS remains authoritative. PROCESS_START_DATE is preferred when
// populated; first Chart_dates for a PROCESS_STAGE is the safe fallback.

const STAGES = [
  { key:'EARLY ADVISORY & OPTIONALITY', color:'#16e6e9', lane:.18, description:'Broker engagement · intelligence · optionality' },
  { key:'EARLY RESTRUCTURE EXPLORATION', color:'#69c9c6', lane:.25, description:'Early landlord exploration · preserve alternatives' },
  { key:'STRATEGIC PLANNING', color:'#16e6e9', lane:.32, description:'Objectives · constraints · viable scenarios' },
  { key:'MARKET EVALUATION', color:'#3e91d7', lane:.40, description:'Extended market discovery · options · proposals' },
  { key:'TERM SHEET / LOI NEGOTIATIONS', color:'#16e6e9', lane:.49, description:'Competing proposals · core business terms' },
  { key:'LEASE NEGOTIATIONS', color:'#49be85', lane:.59, description:'Documentation · final lease terms' },
  { key:'DESIGN / PERMIT / CONSTRUCTION', color:'#d5a536', lane:.69, description:'Planning · approvals · buildout · occupancy' }
];
function norm(v){return String(v??'').trim().toUpperCase().replace(/[·|]/g,' / ').replace(/\s*\/\s*/g,' / ').replace(/\s+/g,' ').trim()}
function canonicalStage(v){const s=norm(v);if(!s||s==='PROCESS_STAGE')return null;if(s.includes('EARLY ADVISORY')&&s.includes('OPTIONALITY'))return STAGES[0].key;if(s.includes('EARLY RESTRUCTURE'))return STAGES[1].key;if(s==='STRATEGIC PLANNING')return STAGES[2].key;if(s==='MARKET EVALUATION')return STAGES[3].key;if(s.startsWith('TERM SHEET')&&s.includes('LOI'))return STAGES[4].key;if(s.startsWith('LEASE NEGOTIATION'))return STAGES[5].key;if(s.startsWith('DESIGN')&&s.includes('PERMIT'))return STAGES[6].key;return null}
function validDate(v){const d=v instanceof Date?v:new Date(v);return Number.isFinite(+d)?d:null}
function fmtDate(d){return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`}
function dayBefore(d){const x=new Date(+d);x.setDate(x.getDate()-1);return x}
function monthsBetween(a,b){return Math.max(1,Math.round((+b-+a)/2629800000))}
function buildStageModel(data,x1,leaseExpiration){
  const byStage=new Map();
  for(const d of data){const stage=canonicalStage(d.processStage);if(!stage)continue;if(!byStage.has(stage))byStage.set(stage,[]);byStage.get(stage).push(d)}
  const ordered=[];
  for(const def of STAGES){const rows=byStage.get(def.key);if(!rows?.length)continue;rows.sort((a,b)=>a.date-b.date);const explicit=rows.map(r=>validDate(r.processStart)).filter(Boolean).sort((a,b)=>a-b)[0];const start=explicit||validDate(rows[0].date);if(start)ordered.push({...def,start})}
  ordered.sort((a,b)=>a.start-b.start);
  return ordered.map((s,i)=>{const next=ordered[i+1];const terminal=validDate(leaseExpiration)||new Date(x1);const exclusiveEnd=next?new Date(+next.start):terminal;const displayEnd=next?dayBefore(next.start):terminal;return {...s,exclusiveEnd,displayEnd,durationMonths:monthsBetween(s.start,exclusiveEnd)}})
}
function syncSchedule(scheduleEl,model){
  if(!scheduleEl)return;scheduleEl.innerHTML='';scheduleEl.style.setProperty('--stage-count',String(Math.max(1,model.length)));
  for(const s of model){const box=document.createElement('div');box.className='phasebox';box.style.setProperty('--phase-color',s.color);const strong=document.createElement('strong');strong.textContent=s.key;const tiny=document.createElement('span');tiny.className='tiny';tiny.textContent=`${fmtDate(s.start)} · ${s.durationMonths} MONTH${s.durationMonths===1?'':'S'} · ${s.description}`;box.append(strong,tiny);scheduleEl.appendChild(box)}
}
function drawProcess({data,x,m,W,H,x0,x1,leaseExpiration,svg,ns,txt,scheduleEl}){
  const model=buildStageModel(data,x1,leaseExpiration);syncSchedule(scheduleEl,model);if(!model.length)return;
  const defs=svg.querySelector('defs')||svg.insertBefore(ns('defs'),svg.firstChild);
  model.forEach((p,i)=>{const a=Math.max(m.l,x(p.start)),b=Math.min(W-m.r,x(p.exclusiveEnd));if(b<=a)return;const yy=m.t+(H-m.t-32)*p.lane,id=`processGradient${i}`;const g=ns('linearGradient',{id,x1:'0%',y1:'0%',x2:'100%',y2:'0%'});g.appendChild(ns('stop',{offset:'0%','stop-color':p.color,'stop-opacity':'.10'}));g.appendChild(ns('stop',{offset:'50%','stop-color':p.color,'stop-opacity':'.34'}));g.appendChild(ns('stop',{offset:'100%','stop-color':p.color,'stop-opacity':'.10'}));defs.appendChild(g);svg.appendChild(ns('rect',{x:a,y:yy-8,width:b-a,height:16,rx:6,fill:`url(#${id})`,stroke:p.color,'stroke-width':'1.6','stroke-opacity':'.82'}));if(b-a>95){const title=txt((a+b)/2,yy-13,p.key,'proc','middle');title.setAttribute('fill',p.color)}if(b-a>125){const dates=txt((a+b)/2,yy+21,`${fmtDate(p.start)} · ${p.durationMonths} MO`,'axis','middle');dates.setAttribute('fill','#a9bac7')}})
}
export { drawProcess, buildStageModel };
