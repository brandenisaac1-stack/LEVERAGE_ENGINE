// EARLY RESTRUCTURE overlay — robust drop-in renderer.
// Matches the CURRENT working app.js contract:
// drawRestructure({enabled,data,plottedSeries:P,x,y,m,W,base,svg,ns,txt,selected})

const BLUE='#3e91d7';
const BLUE_TEXT='#79baf0';

function validDate(v){
  if(v instanceof Date) return Number.isFinite(+v)?new Date(+v):null;
  if(v==null||v==='') return null;
  const d=new Date(v);
  return Number.isFinite(+d)?d:null;
}

function money(v){
  return Number.isFinite(+v)
    ? new Intl.NumberFormat('en-US',{
        style:'currency',
        currency:'USD',
        maximumFractionDigits:0
      }).format(+v)
    : '—';
}

function clamp01(v){return Math.max(0,Math.min(1,v))}
function smoothstep(v){v=clamp01(v);return v*v*(3-2*v)}

function progressState(raw){
  const s=String(raw??'').trim().toUpperCase();
  if(s.startsWith('100%')) return {retained:0,label:'100% - EXECUTED',executed:true};
  if(s.startsWith('75%')) return {retained:.35,label:'75% - COMMIT',executed:false};
  if(s.startsWith('50%')) return {retained:.75,label:'50% - CONVERGE',executed:false};
  if(s.startsWith('25%')) return {retained:.95,label:'25% - PRICE',executed:false};
  return {retained:1,label:s||'0% - TEST',executed:false};
}

function interpolateTenant(P,ms){
  if(!Array.isArray(P)||!P.length)return null;
  if(ms<=+P[0].date)return +P[0].plotTenant;
  if(ms>=+P[P.length-1].date)return +P[P.length-1].plotTenant;

  let lo=0,hi=P.length-1;
  while(hi-lo>1){
    const mid=(lo+hi)>>1;
    if(+P[mid].date<=ms)lo=mid;else hi=mid;
  }
  const a=P[lo],b=P[hi];
  const span=(+b.date-+a.date)||1;
  const t=(ms-+a.date)/span;
  return +a.plotTenant+(+b.plotTenant-+a.plotTenant)*t;
}

function curvePath(pts){
  if(pts.length<2)return'';
  let d=`M ${pts[0][0]} ${pts[0][1]}`;
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[Math.max(0,i-1)];
    const p1=pts[i];
    const p2=pts[i+1];
    const p3=pts[Math.min(pts.length-1,i+2)];
    d+=` C ${p1[0]+(p2[0]-p0[0])/6} ${p1[1]+(p2[1]-p0[1])/6}, ${p2[0]-(p3[0]-p1[0])/6} ${p2[1]-(p3[1]-p1[1])/6}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function getProgress(data){
  const row=data.find(d=>String(d.restructureProgress??'').trim());
  return row ? String(row.restructureProgress).trim() : '0% - TEST';
}

function getEffectiveDate(data){
  // PRIMARY: explicit ESRI/Smartsheet RESTRUCTURE_EFFECTIVE_DATE anywhere in DATA.
  const explicit=data
    .map(d=>validDate(d.restructureEffectiveDate))
    .find(Boolean);
  if(explicit)return explicit;

  // SAFE FALLBACK: first live PROCESS_STAGE row containing RESTRUCTURE.
  // This prevents the overlay from disappearing if the control date is blank/not exposed.
  const stageRow=data.find(d=>
    String(d.processStage??'').toUpperCase().includes('RESTRUCTURE') &&
    validDate(d.date)
  );
  return stageRow ? validDate(stageRow.date) : null;
}

function drawRestructure({
  enabled,
  data,
  plottedSeries,
  x,
  y,
  m,
  W,
  base,
  svg,
  ns,
  txt,
  selected=-1
}){
  if(!enabled)return;
  if(!Array.isArray(data)||!data.length)return;
  if(!Array.isArray(plottedSeries)||!plottedSeries.length)return;

  const P=plottedSeries;
  const effective=getEffectiveDate(data);
  if(!effective)return;

  const state=progressState(getProgress(data));
  const startMs=+effective;
  const horizonMs=+P[P.length-1].date;

  if(!Number.isFinite(startMs)||!Number.isFinite(horizonMs)||startMs>horizonMs)return;

  // Exact baseline value at branch date.
  const baselineAtStart=interpolateTenant(P,startMs);
  if(!Number.isFinite(baselineAtStart))return;

  // Build a dense smooth path directly from the proven teal relocation geometry.
  // 0/25/50/75% progressively consume ONLY future incremental leverage.
  // The restructure path is mathematically prohibited from exceeding teal.
  const scenario=[];

  if(!state.executed){
    const N=320;
    for(let i=0;i<N;i++){
      const t=i/(N-1);
      const ms=startMs+(horizonMs-startMs)*t;
      const baseline=interpolateTenant(P,ms);
      if(!Number.isFinite(baseline))continue;

      // Ease commitment in after the exact branch point so there is no kink.
      const fade=smoothstep(Math.min(1,t/.22));
      const retainedNow=1-(1-state.retained)*fade;

      // Consume only the future leverage gained above the branch-date level.
      const upside=Math.max(0,baseline-baselineAtStart);
      let value=baseline-upside*(1-retainedNow);

      // Never manufacture leverage above the relocation counterfactual.
      value=Math.min(value,baseline);

      scenario.push({date:new Date(ms),value});
    }
  }

  if(scenario.length>=2){
    svg.appendChild(ns('path',{
      d:curvePath(scenario.map(p=>[x(p.date),y(p.value)])),
      fill:'none',
      stroke:BLUE,
      'stroke-width':'2.35',
      'stroke-dasharray':'8 5',
      opacity:'.98'
    }));
  }

  const ex=x(effective);

  // Branch-date guide.
  svg.appendChild(ns('line',{
    x1:ex,y1:m.t+52,x2:ex,y2:base,
    stroke:BLUE,
    'stroke-width':'1.5',
    'stroke-dasharray':'4 4',
    opacity:'.78'
  }));

  // Exact branch point on teal.
  svg.appendChild(ns('circle',{
    cx:ex,
    cy:y(baselineAtStart),
    r:5,
    fill:BLUE,
    stroke:'#fff',
    'stroke-width':'1.5'
  }));

  // Existing engine economics only.
  let econRow=null;
  if(
    selected>=0 &&
    data[selected] &&
    +data[selected].date>=startMs &&
    Number.isFinite(+data[selected].npvDelta)
  ){
    econRow=data[selected];
  }else{
    econRow=data.find(d=>
      +d.date>=startMs &&
      Number.isFinite(+d.npvDelta)
    )||null;
  }
  const optionValue=econRow?+econRow.npvDelta:NaN;

  // Scenario card.
  const cardW=Math.min(410,Math.max(340,(W-m.l-m.r)*.25));
  const cardH=78;
  const cardX=Math.max(m.l+10,Math.min(W-m.r-cardW-10,ex-cardW*.45));
  const cardY=m.t+52;

  svg.appendChild(ns('rect',{
    x:cardX,y:cardY,width:cardW,height:cardH,rx:7,
    fill:'#071321',
    'fill-opacity':'.97',
    stroke:BLUE,
    'stroke-width':'1.4'
  }));

  const title=txt(
    cardX+12,cardY+20,
    `EARLY RESTRUCTURE · ${state.label}`,
    '',
    'start'
  );
  title.setAttribute('fill',BLUE_TEXT);
  title.setAttribute('font-size','12');
  title.setAttribute('font-weight','700');

  const statusText=state.executed
    ? 'RESTRUCTURE EXECUTED · RELOCATION PATH IS COUNTERFACTUAL'
    : 'RELOCATION ALTERNATIVE REMAINS ACTIVE';

  const status=txt(cardX+12,cardY+42,statusText,'','start');
  status.setAttribute('fill','#c7d7e4');
  status.setAttribute('font-size','10');
  status.setAttribute('font-weight','700');

  const econ=txt(
    cardX+12,cardY+63,
    `VALUE OF PRESERVING OPTIONALITY · ${money(optionValue)}`,
    '',
    'start'
  );
  econ.setAttribute('fill','#c7d7e4');
  econ.setAttribute('font-size','10');
  econ.setAttribute('font-weight','700');
}

export {drawRestructure};
