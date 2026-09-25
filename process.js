// Process overlay. Normal mode uses PROCESS_STAGE; restructure mode uses explicit restructure phase start/end fields.
const PALETTE=['#16e6e9','#3e91d7','#7b8cff','#49be85','#d5a536','#d77ac8','#75c7c4','#d28b55','#8dc56b'];
const RESTRUCTURE_COLORS=['#3e91d7','#d5a536','#d77ac8','#75c7c4','#8dc56b'];

function cleanStage(v){return String(v??'').trim().replace(/\s+/g,' ')}
function validDate(v){if(v instanceof Date)return Number.isFinite(+v)?new Date(+v):null;if(typeof v==='number'){const d=new Date(v);return Number.isFinite(+d)?d:null}if(typeof v==='string'&&v.trim()){const d=new Date(v);return Number.isFinite(+d)?d:null}return null}
function fmtDate(d){return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`}
function dayBefore(d){const x=new Date(+d);x.setDate(x.getDate()-1);return x}
function monthDuration(a,b){return Math.max(0,Math.round((+b-+a)/2629800000))}
function description(stage){const s=stage.toUpperCase();if(s.includes('ADVISORY')&&s.includes('OPTIONALITY'))return 'Broker engagement · intelligence · optionality';if(s.includes('RESTRUCTURE'))return 'Early landlord exploration · preserve alternatives';if(s.includes('STRATEGIC'))return 'Objectives · constraints · viable scenarios';if(s.includes('MARKET'))return 'Market discovery · options · proposals';if(s.includes('TERM SHEET')||s.includes('LOI'))return 'Core renewal business terms';if(s.includes('LEASE AMEND')||s.includes('LEASE NEGOT'))return 'Documentation · final renewal terms';if(s.includes('SPACE REFRESH'))return 'Targeted refresh · as required';if(s.includes('DESIGN')||s.includes('PERMIT')||s.includes('CONSTRUCTION'))return 'Planning · approvals · buildout · occupancy';return 'Transaction process stage'}

function buildStageModel(data,leaseExpiration){
  const exp=validDate(leaseExpiration);
  const rows=data.map((d,i)=>({i,date:validDate(d.date),stage:cleanStage(d.processStage)})).filter(r=>r.date&&r.stage&&r.stage.toUpperCase()!=='PROCESS_STAGE').sort((a,b)=>+a.date-+b.date);
  if(!rows.length)return[];
  const first=new Map();for(const r of rows){const k=r.stage.toUpperCase();if(!first.has(k))first.set(k,r)}
  const ordered=[...first.values()].sort((a,b)=>+a.date-+b.date);
  return ordered.map((r,i)=>{const next=ordered[i+1],terminal=next?.date||exp||rows.at(-1).date,end=validDate(terminal),hasSpan=end&&+end>+r.date;return{key:r.stage,start:new Date(+r.date),exclusiveEnd:hasSpan?new Date(+end):new Date(+r.date),displayEnd:hasSpan?dayBefore(end):new Date(+r.date),duration:hasSpan?monthDuration(r.date,end):0,color:PALETTE[i%PALETTE.length],lane:.24+(i%7)*.095,description:description(r.stage),pointOnly:!hasSpan}})
}

function restructureLane(stage){
  const s=stage.toUpperCase();
  // Preserve the normal process vertical architecture: Early Restructure,
  // Term Sheet/LOI and Lease Negotiations keep their familiar lanes while
  // Market Evaluation and downstream relocation/buildout stages disappear.
  if(s.includes('EARLY RESTRUCTURE'))return .43;
  if(s.includes('TERM SHEET')||s.includes('LOI'))return .525;
  if(s.includes('LEASE AMEND')||s.includes('LEASE NEGOT'))return .62;
  if(s.includes('SPACE REFRESH'))return .715;
  return .62;
}

function buildRestructureModel(data){
  const phases=data.map(d=>({
    key:cleanStage(d.restructureActionPhase),
    start:validDate(d.restructureDateBreakout),
    end:validDate(d.restructurePhaseEndDate)
  })).filter(p=>p.key&&p.start&&p.end&&+p.end>+p.start).sort((a,b)=>+a.start-+b.start);
  if(!phases.length)return[];
  const firstStart=phases[0].start;
  // Only the pre-restructure normal stages survive the alternate renewal path.
  const normalBefore=buildStageModel(data,null)
    .filter(p=>+p.start<+firstStart&&!p.key.toUpperCase().includes('RESTRUCTURE'))
    .map((p,i)=>({...p,lane:.24+(i%2)*.095}));
  const alt=phases.map((p,i)=>({
    key:p.key,start:p.start,exclusiveEnd:p.end,displayEnd:p.end,
    duration:monthDuration(p.start,p.end),
    color:RESTRUCTURE_COLORS[i%RESTRUCTURE_COLORS.length],
    lane:restructureLane(p.key),
    description:description(p.key),pointOnly:false,restructure:true
  }));
  return [...normalBefore,...alt];
}

function syncSchedule(el,model){if(!el)return;el.innerHTML='';el.style.gridTemplateColumns=`repeat(${Math.max(1,model.length)},minmax(0,1fr))`;for(const p of model){const box=document.createElement('div');box.className='phasebox dynamicPhase';box.style.setProperty('--stage-color',p.color);box.style.borderTop=`3px solid ${p.color}`;const strong=document.createElement('strong');strong.textContent=p.key;strong.style.setProperty('color',p.color,'important');const tiny=document.createElement('span');tiny.className='tiny';tiny.textContent=p.pointOnly?`${fmtDate(p.start)} · MILESTONE · ${p.description}`:`${fmtDate(p.start)} · ${p.duration} MO · ${p.description}`;box.append(strong,tiny);el.appendChild(box)}}

function shortLabel(stage,width){
  if(width>=230)return stage;
  const s=stage.toUpperCase();
  if(s.includes('EARLY RESTRUCTURE'))return width<110?'EARLY RESTRUCTURE EXPLORATION':'EARLY RESTRUCTURE EXPLORATION';
  if(s.includes('TERM SHEET')||s.includes('LOI'))return width<110?'RESTRUCTURE TERM SHEET':'RENEWAL TERM SHEET NEGOTIATIONS';
  if(s.includes('LEASE AMEND'))return 'RESTRUCTURE LEASE AMENDMENT';
  if(s.includes('SPACE REFRESH'))return width<110?'REFRESH / RECONFIGURATION':'SPACE REFRESH (PAINT/CARPET)';
  return stage;
}

function drawProcess({data,x,m,W,H,leaseExpiration,svg,ns,txt,scheduleEl,restructureMode=false}){
  const normalModel=buildStageModel(data,leaseExpiration);
  const model=restructureMode?buildRestructureModel(data):normalModel;
  // Keep the bottom schedule synchronized with the exact process model shown on the chart.
  // Normal mode = normal roadmap; Early Restructure mode = alternate restructure roadmap.
  syncSchedule(scheduleEl,model);if(!model.length)return;
  const defs=svg.querySelector('defs')||svg.insertBefore(ns('defs'),svg.firstChild);
  model.forEach((p,i)=>{
    const a=Math.max(m.l,x(p.start)),yy=m.t+(H-m.t-32)*p.lane;
    if(p.pointOnly){if(a>=m.l&&a<=W-m.r){svg.appendChild(ns('circle',{cx:a,cy:yy,r:5,fill:p.color,stroke:p.color,'stroke-width':'2'}));const labelX=Math.max(m.l+90,a-10);const title=txt(labelX,yy-14,p.key,'proc','end');title.setAttribute('fill',p.color);const sub=txt(labelX,yy+20,`${fmtDate(p.start)} · MILESTONE`,'axis','end');sub.setAttribute('fill','#a9bac7')}return}
    const b=Math.min(W-m.r,x(p.exclusiveEnd));if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return;
    const width=b-a,id=`processGradientLive${i}`;const g=ns('linearGradient',{id,x1:'0%',y1:'0%',x2:'100%',y2:'0%'});g.appendChild(ns('stop',{offset:'0%','stop-color':p.color,'stop-opacity':'.10'}));g.appendChild(ns('stop',{offset:'50%','stop-color':p.color,'stop-opacity':'.34'}));g.appendChild(ns('stop',{offset:'100%','stop-color':p.color,'stop-opacity':'.10'}));defs.appendChild(g);
    svg.appendChild(ns('rect',{x:a,y:yy-8,width,height:16,rx:6,fill:`url(#${id})`,stroke:p.color,'stroke-width':'1.6','stroke-opacity':'.9'}));
    const mid=(a+b)/2,titleText=p.restructure?shortLabel(p.key,width):p.key;
    const title=txt(mid,yy-14,titleText,'proc','middle');title.setAttribute('fill',p.color);title.style.setProperty('font-size','16px','important');title.style.setProperty('font-weight','700','important');title.style.setProperty('paint-order','stroke','important');title.style.setProperty('stroke','#06101f','important');title.style.setProperty('stroke-width','2px','important');
    const dateText=`${fmtDate(p.start)} · ${p.duration} MO`;
    const sub=txt(mid,yy+21,dateText,'axis','middle');sub.setAttribute('fill','#a9bac7');sub.style.setProperty('font-size','16px','important');sub.style.setProperty('font-weight','700','important');sub.style.setProperty('paint-order','stroke','important');sub.style.setProperty('stroke','#06101f','important');sub.style.setProperty('stroke-width','2px','important');
  })
}
export {drawProcess,buildStageModel,buildRestructureModel};
