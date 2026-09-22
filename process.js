// Live process overlay: PROCESS_STAGE determines WHAT renders; Chart_dates determines WHEN.
// No hardcoded stage list. No PROCESS_START_DATE dependency. No client-specific timing.
const PALETTE=['#16e6e9','#3e91d7','#7b8cff','#49be85','#d5a536','#d77ac8','#75c7c4','#d28b55','#8dc56b'];

function cleanStage(v){return String(v??'').trim().replace(/\s+/g,' ')}
function validDate(v){
  if(v instanceof Date) return Number.isFinite(+v)?new Date(+v):null;
  if(typeof v==='number') { const d=new Date(v); return Number.isFinite(+d)?d:null; }
  if(typeof v==='string' && v.trim()) { const d=new Date(v); return Number.isFinite(+d)?d:null; }
  return null;
}
function fmtDate(d){return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`}
function dayBefore(d){const x=new Date(+d);x.setDate(x.getDate()-1);return x}
function monthDuration(a,b){return Math.max(0,Math.round((+b-+a)/2629800000))}
function description(stage){
  const s=stage.toUpperCase();
  if(s.includes('ADVISORY')&&s.includes('OPTIONALITY'))return 'Broker engagement · intelligence · optionality';
  if(s.includes('RESTRUCTURE'))return 'Early landlord exploration · preserve alternatives';
  if(s.includes('STRATEGIC'))return 'Objectives · constraints · viable scenarios';
  if(s.includes('MARKET'))return 'Market discovery · options · proposals';
  if(s.includes('TERM SHEET')||s.includes('LOI'))return 'Competing proposals · core business terms';
  if(s.includes('LEASE NEGOT'))return 'Documentation · final lease terms';
  if(s.includes('DESIGN')||s.includes('PERMIT')||s.includes('CONSTRUCTION'))return 'Planning · approvals · buildout · occupancy';
  return 'Transaction process stage';
}

function buildStageModel(data,leaseExpiration){
  const exp=validDate(leaseExpiration);
  const rows=data.map((d,i)=>({i,date:validDate(d.date),stage:cleanStage(d.processStage)}))
    .filter(r=>r.date && r.stage && r.stage.toUpperCase()!=='PROCESS_STAGE')
    .sort((a,b)=>+a.date-+b.date);
  if(!rows.length)return [];

  // Preserve first appearance order in actual Chart_dates. Each distinct live stage is rendered.
  const first=new Map();
  for(const r of rows){const k=r.stage.toUpperCase();if(!first.has(k))first.set(k,r)}
  const ordered=[...first.values()].sort((a,b)=>+a.date-+b.date);

  return ordered.map((r,i)=>{
    const next=ordered[i+1];
    const terminal=next?.date || exp || rows.at(-1).date;
    const end=validDate(terminal);
    const hasSpan=end && +end>+r.date;
    return {
      key:r.stage,
      start:new Date(+r.date),
      exclusiveEnd:hasSpan?new Date(+end):new Date(+r.date),
      displayEnd:hasSpan?dayBefore(end):new Date(+r.date),
      duration:hasSpan?monthDuration(r.date,end):0,
      color:PALETTE[i%PALETTE.length],
      // Stagger bars down the chart like the established working visual.
      lane:.24+(i%7)*.095,
      description:description(r.stage),
      pointOnly:!hasSpan
    };
  });
}

function syncSchedule(el,model){
  if(!el)return;
  el.innerHTML='';
  el.style.gridTemplateColumns=`repeat(${Math.max(1,model.length)},minmax(0,1fr))`;
  for(const p of model){
    const box=document.createElement('div');
    box.className='phasebox dynamicPhase';
    box.style.setProperty('--stage-color',p.color);
    box.style.borderTop=`3px solid ${p.color}`;

    const strong=document.createElement('strong');
    strong.textContent=p.key;
    strong.style.setProperty('color',p.color,'important');

    const tiny=document.createElement('span');
    tiny.className='tiny';
    tiny.textContent=p.pointOnly
      ? `${fmtDate(p.start)} · MILESTONE · ${p.description}`
      : `${fmtDate(p.start)} · ${p.duration} MONTH${p.duration===1?'':'S'} · ${p.description}`;

    box.append(strong,tiny);
    el.appendChild(box);
  }
}

function drawProcess({data,x,m,W,H,leaseExpiration,svg,ns,txt,scheduleEl}){
  const model=buildStageModel(data,leaseExpiration);
  syncSchedule(scheduleEl,model);
  if(!model.length)return;
  const defs=svg.querySelector('defs')||svg.insertBefore(ns('defs'),svg.firstChild);

  model.forEach((p,i)=>{
    const a=Math.max(m.l,x(p.start));
    const yy=m.t+(H-m.t-32)*p.lane;

    // If a stage begins exactly at the terminal north star, show a milestone rather than inventing duration.
    if(p.pointOnly){
      if(a>=m.l&&a<=W-m.r){
        svg.appendChild(ns('circle',{
          cx:a,
          cy:yy,
          r:5,
          fill:p.color,
          stroke:p.color,
          'stroke-width':'2'
        }));

        const labelX=Math.max(m.l+90,a-10);

        const title=txt(labelX,yy-14,p.key,'proc','end');
        title.setAttribute('fill',p.color);
        title.style.setProperty('font-size','16px','important');
        title.style.setProperty('font-weight','700','important');
        title.style.setProperty('paint-order','stroke','important');
        title.style.setProperty('stroke','#06101f','important');
        title.style.setProperty('stroke-width','2px','important');

        const sub=txt(
          labelX,
          yy+20,
          `${fmtDate(p.start)} · MILESTONE`,
          'axis',
          'end'
        );
        sub.setAttribute('fill','#a9bac7');
        sub.style.setProperty('font-size','16px','important');
        sub.style.setProperty('font-weight','700','important');
        sub.style.setProperty('paint-order','stroke','important');
        sub.style.setProperty('stroke','#06101f','important');
        sub.style.setProperty('stroke-width','2px','important');
      }
      return;
    }

    const b=Math.min(W-m.r,x(p.exclusiveEnd));
    if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return;
    const id=`processGradientLive${i}`;
    const g=ns('linearGradient',{id,x1:'0%',y1:'0%',x2:'100%',y2:'0%'});
    g.appendChild(ns('stop',{offset:'0%','stop-color':p.color,'stop-opacity':'.10'}));
    g.appendChild(ns('stop',{offset:'50%','stop-color':p.color,'stop-opacity':'.34'}));
    g.appendChild(ns('stop',{offset:'100%','stop-color':p.color,'stop-opacity':'.10'}));
    defs.appendChild(g);
    svg.appendChild(ns('rect',{
      x:a,
      y:yy-8,
      width:b-a,
      height:16,
      rx:6,
      fill:`url(#${id})`,
      stroke:p.color,
      'stroke-width':'1.6',
      'stroke-opacity':'.9'
    }));

    // ALWAYS render the phase name regardless of bar width.
    // The bar retains its true calendar width; text is allowed to extend beyond it.
    const mid=(a+b)/2;

    const title=txt(
      mid,
      yy-14,
      p.key,
      'proc',
      'middle'
    );
    title.setAttribute('fill',p.color);
    title.style.setProperty('font-size','16px','important');
    title.style.setProperty('font-weight','700','important');
    title.style.setProperty('paint-order','stroke','important');
    title.style.setProperty('stroke','#06101f','important');
    title.style.setProperty('stroke-width','2px','important');

    // ALWAYS render start date + duration regardless of bar width.
    const sub=txt(
      mid,
      yy+21,
      `${fmtDate(p.start)} · ${p.duration} MO`,
      'axis',
      'middle'
    );
    sub.setAttribute('fill','#a9bac7');
    sub.style.setProperty('font-size','16px','important');
    sub.style.setProperty('font-weight','700','important');
    sub.style.setProperty('paint-order','stroke','important');
    sub.style.setProperty('stroke','#06101f','important');
    sub.style.setProperty('stroke-width','2px','important');
  });
}

export {drawProcess,buildStageModel};
