// Process overlay. Normal mode uses PROCESS_STAGE; restructure mode uses explicit restructure phase start/end fields.
const PALETTE=[
  '#238291',
  '#6CA7B1',
  '#79828C',
  '#A1A7AD',
  '#5DA5EE',
  '#8ABDF3',
  '#6CA7B1',
  '#BDC2C7',
  '#D7DADE'
];

const RESTRUCTURE_COLORS=[
  '#097CE8',
  '#5DA5EE',
  '#6CA7B1',
  '#238291',
  '#A1A7AD'
];

function cleanStage(v){return String(v??'').trim().replace(/\s+/g,' ')}
function validDate(v){if(v instanceof Date)return Number.isFinite(+v)?new Date(+v):null;if(typeof v==='number'){const d=new Date(v);return Number.isFinite(+d)?d:null}if(typeof v==='string'&&v.trim()){const d=new Date(v);return Number.isFinite(+d)?d:null}return null}
function fmtDate(d){return d.toLocaleDateString('en-US',{month:'short',year:'numeric'})}
function dayBefore(d){const x=new Date(+d);x.setDate(x.getDate()-1);return x}
function monthDuration(a,b){return Math.max(0,Math.round((+b-+a)/2629800000))}

function scenarioDate(value,mapDate){
  const original=validDate(value);
  if(!original)return null;
  if(typeof mapDate!=='function')return original;
  return validDate(mapDate(original))||original;
}
function description(stage){const s=stage.toUpperCase();if(s.includes('ADVISORY')&&s.includes('OPTIONALITY'))return 'Broker engagement · intelligence · optionality';if(s.includes('RESTRUCTURE'))return 'Early landlord exploration · preserve alternatives';if(s.includes('STRATEGIC'))return 'Objectives · constraints · viable scenarios';if(s.includes('MARKET'))return 'Market discovery · options · proposals';if(s.includes('TERM SHEET')||s.includes('LOI'))return 'Core renewal business terms';if(s.includes('LEASE AMEND')||s.includes('LEASE NEGOT'))return 'Documentation · final renewal terms';if(s.includes('SPACE REFRESH'))return 'Targeted refresh · as required';if(s.includes('DESIGN')||s.includes('PERMIT')||s.includes('CONSTRUCTION'))return 'Planning · approvals · buildout · occupancy';return 'Transaction process stage'}

function buildStageModel(data,leaseExpiration){
  const exp=validDate(leaseExpiration);
  const rows=data.map((d,i)=>({i,date:validDate(d.date),stage:cleanStage(d.processStage)})).filter(r=>r.date&&r.stage&&r.stage.toUpperCase()!=='PROCESS_STAGE').sort((a,b)=>+a.date-+b.date);
  if(!rows.length)return[];
  const first=new Map();for(const r of rows){const k=r.stage.toUpperCase();if(!first.has(k))first.set(k,r)}
  const ordered=[...first.values()].sort((a,b)=>+a.date-+b.date);
  return ordered.map((r,i)=>{const next=ordered[i+1],terminal=next?.date||exp||rows.at(-1).date,end=validDate(terminal),hasSpan=end&&+end>+r.date;return{key:r.stage,start:new Date(+r.date),exclusiveEnd:hasSpan?new Date(+end):new Date(+r.date),displayEnd:hasSpan?dayBefore(end):new Date(+r.date),duration:hasSpan?monthDuration(r.date,end):0,color:PALETTE[i%PALETTE.length],lane:.24+(i%7)*.095,description:description(r.stage),pointOnly:!hasSpan}})
}

function restructureLane(index){
  // Structural layout only: chronological restructure record -> next fixed row.
  const base=.43;
  const step=.115;
  return base+(index*step);
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
    lane:restructureLane(i),
    description:description(p.key),pointOnly:false,restructure:true
  }));
  return [...normalBefore,...alt];
}

function shortLabel(stage,width){
  if(width>=230)return stage;
  const s=stage.toUpperCase();
  if(s.includes('EARLY RESTRUCTURE'))return width<110?'EARLY RESTRUCTURE EXPLORATION':'EARLY RESTRUCTURE EXPLORATION';
  if(s.includes('TERM SHEET')||s.includes('LOI'))return width<110?'RESTRUCTURE TERM SHEET':'RESTRUCTURE TERM SHEET';
  if(s.includes('LEASE AMEND'))return 'RESTRUCTURE LEASE AMENDMENT';
  if(s.includes('SPACE REFRESH'))return width<110?'REFRESH / RECONFIGURATION':'SPACE REFRESH';
  return stage;
}

function drawProcess({data,x,m,W,H,leaseExpiration,svg,ns,txt,restructureMode=false,mapDate=null}){
  const normalModel=buildStageModel(data,leaseExpiration);
  const model=restructureMode?buildRestructureModel(data):normalModel;
  if(!model.length)return;
  const defs=svg.querySelector('defs')||svg.insertBefore(ns('defs'),svg.firstChild);
  model.forEach((p,i)=>{
    const start=scenarioDate(p.start,mapDate);
    const end=scenarioDate(p.exclusiveEnd,mapDate);
    if(!start||!end)return;
    const duration=p.pointOnly?0:monthDuration(start,end);
    const a=Math.max(m.l,x(start)),yy=m.t+(H-m.t-32)*p.lane;
    if(p.pointOnly){if(a>=m.l&&a<=W-m.r){svg.appendChild(ns('circle',{cx:a,cy:yy,r:5,fill:p.color,stroke:p.color,'stroke-width':'2'}));const labelX=Math.max(m.l+90,a-10);const title=txt(labelX,yy-14,p.key,'proc','end');title.setAttribute('fill',p.color);title.style.setProperty('font-size','19px','important');title.style.setProperty('font-weight','700','important');const sub=txt(labelX,yy+23,`${fmtDate(start)} · MILESTONE`,'axis','end');sub.setAttribute('fill','#D7DADE');sub.style.setProperty('font-size','18px','important');sub.style.setProperty('font-weight','700','important')}return}
    const b=Math.min(W-m.r,x(end));if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return;
    const width=b-a,id=`processGradientLive${i}`;const g=ns('linearGradient',{id,x1:'0%',y1:'0%',x2:'100%',y2:'0%'});g.appendChild(ns('stop',{offset:'0%','stop-color':p.color,'stop-opacity':'.10'}));g.appendChild(ns('stop',{offset:'50%','stop-color':p.color,'stop-opacity':'.34'}));g.appendChild(ns('stop',{offset:'100%','stop-color':p.color,'stop-opacity':'.10'}));defs.appendChild(g);
    svg.appendChild(ns('rect',{x:a,y:yy-8,width,height:16,rx:6,fill:`url(#${id})`,stroke:p.color,'stroke-width':'1.6','stroke-opacity':'.9'}));
        const mid=(a+b)/2;
    const titleText=p.restructure?shortLabel(p.key,width):p.key;

    const edgePad=12;
    const titleGuard=150;

    let titleX=mid;
    let titleAnchor='middle';

    if(mid-titleGuard<m.l+edgePad){
      titleX=m.l+edgePad;
      titleAnchor='start';
    }else if(mid+titleGuard>W-m.r-edgePad){
      titleX=W-m.r-edgePad;
      titleAnchor='end';
    }

    const title=txt(
      titleX,
      yy-14,
      titleText,
      'proc',
      titleAnchor
    );

    title.setAttribute('fill',p.color);
    title.style.setProperty('font-size','19px','important');
    title.style.setProperty('font-weight','700','important');
    title.style.setProperty('paint-order','stroke','important');
    title.style.setProperty('stroke','#1B1D2C','important');
    title.style.setProperty('stroke-width','2px','important');

    const dateText=`${fmtDate(start)} · ${duration} MO`;

    const dateGuard=145;

    let dateX=a+4;
    let dateAnchor='start';

    if(dateX+dateGuard>W-m.r-edgePad){
      dateX=W-m.r-edgePad;
      dateAnchor='end';
    }else{
      dateX=Math.max(
        m.l+edgePad,
        dateX
      );
    }

    const sub=txt(
      dateX,
      yy+23,
      dateText,
      'axis',
      dateAnchor
    );

    sub.setAttribute('fill','#D7DADE');
    sub.style.setProperty('font-size','18px','important');
    sub.style.setProperty('font-weight','700','important');
    sub.style.setProperty('paint-order','stroke','important');
    sub.style.setProperty('stroke','#1B1D2C','important');
    sub.style.setProperty('stroke-width','2px','important');
  })
}
export {drawProcess,buildStageModel,buildRestructureModel};