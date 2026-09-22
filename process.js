// Live process renderer. PROCESS_STAGE determines WHAT renders; Chart_dates determines WHEN.
// No hardcoded stage list and no client-specific timing assumptions.
const PALETTE=['#16e6e9','#3e91d7','#7b8cff','#49be85','#d5a536','#d77ac8','#75c7c4','#d28b55','#8dc56b'];
function cleanStage(v){return String(v??'').trim().replace(/\s+/g,' ')}
function fmtDate(d){return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`}
function dayBefore(d){const x=new Date(+d);x.setDate(x.getDate()-1);return x}
function monthDuration(a,b){const days=Math.max(0,(+b-+a)/86400000);return Math.max(1,Math.round(days/30.4375))}
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
 const rows=data.map((d,i)=>({i,date:new Date(+d.date),stage:cleanStage(d.processStage)}))
   .filter(r=>r.stage && r.stage.toUpperCase()!=='PROCESS_STAGE' && Number.isFinite(+r.date)).sort((a,b)=>a.date-b.date);
 const first=new Map(); for(const r of rows)if(!first.has(r.stage.toUpperCase()))first.set(r.stage.toUpperCase(),r);
 const ordered=[...first.values()].sort((a,b)=>a.date-b.date);
 return ordered.map((r,i)=>{const next=ordered[i+1];const exclusiveEnd=next?new Date(+next.date):new Date(+leaseExpiration);const displayEnd=dayBefore(exclusiveEnd);return {key:r.stage,start:r.date,exclusiveEnd,displayEnd,duration:monthDuration(r.date,exclusiveEnd),color:PALETTE[i%PALETTE.length],lane:.22+(i%7)*.075,description:description(r.stage)}}).filter(s=>+s.exclusiveEnd>+s.start);
}
function syncSchedule(el,model){if(!el)return;el.innerHTML='';el.style.gridTemplateColumns=`repeat(${Math.max(1,model.length)},minmax(0,1fr))`;model.forEach((p,i)=>{const box=document.createElement('div');box.className='phasebox dynamicPhase';box.style.setProperty('--stage-color',p.color);const strong=document.createElement('strong');strong.textContent=p.key;const tiny=document.createElement('span');tiny.className='tiny';tiny.textContent=`${fmtDate(p.start)} · ${p.duration} MONTH${p.duration===1?'':'S'} · ${p.description}`;box.append(strong,tiny);el.appendChild(box)})}
function drawProcess({data,x,m,W,H,leaseExpiration,svg,ns,txt,scheduleEl}){const model=buildStageModel(data,leaseExpiration);syncSchedule(scheduleEl,model);if(!model.length)return;const defs=svg.querySelector('defs')||svg.insertBefore(ns('defs'),svg.firstChild);model.forEach((p,i)=>{const a=Math.max(m.l,x(p.start)),b=Math.min(W-m.r,x(p.exclusiveEnd));if(b<=a)return;const yy=m.t+(H-m.t-32)*p.lane,id=`processGradientLive${i}`,g=ns('linearGradient',{id,x1:'0%',y1:'0%',x2:'100%',y2:'0%'});g.appendChild(ns('stop',{offset:'0%','stop-color':p.color,'stop-opacity':'.10'}));g.appendChild(ns('stop',{offset:'50%','stop-color':p.color,'stop-opacity':'.34'}));g.appendChild(ns('stop',{offset:'100%','stop-color':p.color,'stop-opacity':'.10'}));defs.appendChild(g);svg.appendChild(ns('rect',{x:a,y:yy-8,width:b-a,height:16,rx:6,fill:`url(#${id})`,stroke:p.color,'stroke-width':'1.6','stroke-opacity':'.9'}));if(b-a>90){const title=txt((a+b)/2,yy-13,p.key,'proc','middle');title.setAttribute('fill',p.color)}if(b-a>125){const sub=txt((a+b)/2,yy+21,`${fmtDate(p.start)} · ${p.duration} MO`,'axis','middle');sub.setAttribute('fill','#a9bac7')}})}
export {drawProcess,buildStageModel};
