// EARLY RESTRUCTURE — dependent scenario layer.
// Receives the already-adjusted tenant/landlord environment from app.js.

const BLUE='#3e91d7', BLUE_TEXT='#79baf0';
let commitmentOverride=null;
const PANEL_ID='restructureCommitmentPanel';

function vd(v){if(v instanceof Date)return Number.isFinite(+v)?new Date(+v):null;if(v==null||v==='')return null;const d=new Date(v);return Number.isFinite(+d)?d:null}
function cash(v){return Number.isFinite(+v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(+v):'—'}
function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,v))}
function smooth(v){v=clamp(v);return v*v*(3-2*v)}
function pct(raw){const m=String(raw??'').match(/(\d+(?:\.\d+)?)\s*%/);return m?clamp(+m[1],0,100):0}
function label(raw){const s=String(raw??'').trim(),i=s.indexOf('-');return (i>=0?s.slice(i+1):s||'TEST').trim().toUpperCase()}
function interp(P,ms){if(!P.length)return null;if(ms<=+P[0].date)return +P[0].plotTenant;if(ms>=+P.at(-1).date)return +P.at(-1).plotTenant;let a=0,b=P.length-1;while(b-a>1){const n=(a+b)>>1;if(+P[n].date<=ms)a=n;else b=n}const p=P[a],q=P[b],t=(ms-+p.date)/((+q.date-+p.date)||1);return +p.plotTenant+(+q.plotTenant-+p.plotTenant)*t}
function path(pts){if(pts.length<2)return'';let d=`M ${pts[0][0]} ${pts[0][1]}`;for(let i=0;i<pts.length-1;i++){const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];d+=` C ${p1[0]+(p2[0]-p0[0])/6} ${p1[1]+(p2[1]-p0[1])/6}, ${p2[0]-(p3[0]-p1[0])/6} ${p2[1]-(p3[1]-p1[1])/6}, ${p2[0]} ${p2[1]}`}return d}

function controls(data){
  const progress=String(data.find(d=>String(d.restructureProgress??'').trim())?.restructureProgress??'0% - TEST').trim();
  const explicit=data.map(d=>vd(d.restructureEffectiveDate)).find(Boolean);
  const fallback=vd(data.find(d=>String(d.processStage??'').toUpperCase().includes('RESTRUCTURE'))?.date);
  return {progress,effective:explicit||fallback};
}

function ensurePanel(defaultPct,rerender){
  const impact=document.getElementById('impact');
  if(!impact)return null;

  Object.assign(impact.style,{
    position:'relative',
    display:'grid',
    gridTemplateColumns:'minmax(0,1fr) minmax(430px,1.35fr) minmax(340px,1fr)',
    gap:'10px',
    alignItems:'stretch',
    padding:'8px 10px',
    minHeight:'96px'
  });

  let center=document.getElementById(PANEL_ID+'Center');
  if(!center){
    center=document.createElement('div');
    center.id=PANEL_ID+'Center';
    Object.assign(center.style,{
      gridColumn:'2',gridRow:'1',
      display:'flex',flexDirection:'column',
      justifyContent:'center',alignItems:'center',minWidth:'0'
    });
    [impact.querySelector('.impact-title'),document.getElementById('impactDelta'),document.getElementById('impactNpv')]
      .filter(Boolean).forEach(el=>center.appendChild(el));
    impact.appendChild(center);
  }

  let box=document.getElementById(PANEL_ID);
  if(!box){
    box=document.createElement('div');
    box.id=PANEL_ID;
    Object.assign(box.style,{
      gridColumn:'3',gridRow:'1',
      position:'relative',zIndex:'30',minWidth:'0',
      padding:'8px 10px',
      background:'rgba(7,19,33,.97)',
      border:`1px solid ${BLUE}`,borderRadius:'7px',
      boxShadow:'0 8px 24px rgba(0,0,0,.20)',
      fontFamily:'"Courier New",monospace',color:'#c7d7e4',
      pointerEvents:'auto',display:'flex',
      flexDirection:'column',justifyContent:'center'
    });

    box.innerHTML=`
      <div style="color:${BLUE_TEXT};font-size:11px;font-weight:700;margin-bottom:5px">EARLY RESTRUCTURE COMMITMENT</div>
      <div id="${PANEL_ID}Meta" style="font-size:9px;margin-bottom:6px"></div>
      <div style="display:flex;align-items:center;gap:7px">
        <span style="font-size:9px">0</span>
        <input id="${PANEL_ID}Range" type="range" min="0" max="100" step="1"
          style="flex:1;min-width:90px;accent-color:${BLUE};cursor:pointer">
        <span style="font-size:9px">100</span>
        <strong id="${PANEL_ID}Value" style="color:${BLUE_TEXT};font-size:11px;min-width:36px;text-align:right"></strong>
      </div>
      <div id="${PANEL_ID}Economics" style="font-size:9px;font-weight:700;margin-top:6px"></div>
    `;
    impact.appendChild(box);

    box.querySelector(`#${PANEL_ID}Range`).addEventListener('input',e=>{
      commitmentOverride=+e.target.value;
      box.querySelector(`#${PANEL_ID}Value`).textContent=`${Math.round(commitmentOverride)}%`;
      rerender();
    });
  }

  if(commitmentOverride==null)commitmentOverride=defaultPct;
  box.querySelector(`#${PANEL_ID}Range`).value=String(commitmentOverride);
  box.querySelector(`#${PANEL_ID}Value`).textContent=`${Math.round(commitmentOverride)}%`;
  return box;
}
function removePanel(){
  document.getElementById(PANEL_ID)?.remove();
  commitmentOverride=null;
}
function drawRestructure({enabled,data,plottedSeries,x,y,m,W,base,svg,ns,txt,selected=-1,scenarioEconomics}){
  if(!enabled){removePanel();return}
  if(!Array.isArray(data)||!data.length||!Array.isArray(plottedSeries)||!plottedSeries.length)return;
  const P=plottedSeries,ctl=controls(data);if(!ctl.effective)return;
  const sourcePct=pct(ctl.progress);
  ensurePanel(sourcePct,()=>window.dispatchEvent(new Event('resize')));
  const commitment=clamp(commitmentOverride==null?sourcePct:commitmentOverride,0,100);
  const retained=1-commitment/100,start=+ctl.effective,end=+P.at(-1).date,baseline0=interp(P,start);
  const meta=document.getElementById(PANEL_ID+'Meta');
  if(meta)meta.textContent=`SMARTSHEET ${Math.round(sourcePct)}% · SCENARIO ${Math.round(commitment)}% · OPTIONALITY RETAINED ${Math.round(retained*100)}%`;if(!Number.isFinite(baseline0))return;

  const scenario=[];
  if(commitment<100){
    for(let i=0;i<320;i++){const t=i/319,ms=start+(end-start)*t,b=interp(P,ms),fade=smooth(Math.min(1,t/.22)),ret=1-(1-retained)*fade,up=Math.max(0,b-baseline0);scenario.push({date:new Date(ms),value:Math.min(b,b-up*(1-ret))})}
  }
  if(scenario.length>1)svg.appendChild(ns('path',{d:path(scenario.map(p=>[x(p.date),y(p.value)])),fill:'none',stroke:BLUE,'stroke-width':'2.35','stroke-dasharray':'8 5',opacity:'.98'}));
  const ex=x(ctl.effective);svg.appendChild(ns('line',{x1:ex,y1:m.t+52,x2:ex,y2:base,stroke:BLUE,'stroke-width':'1.5','stroke-dasharray':'4 4'}));svg.appendChild(ns('circle',{cx:ex,cy:y(baseline0),r:5,fill:BLUE,stroke:'#fff','stroke-width':'1.5'}));

  const row=(selected>=0&&data[selected]&&Number.isFinite(+data[selected].restructureOptionValue))
    ? data[selected]
    : data.find(d=>Number.isFinite(+d.restructureOptionValue))||null;
  const sourceOption=row?+row.restructureOptionValue:NaN;
  const sourceRetained=Math.max(.000001,1-sourcePct/100);
  const fullOption=Number.isFinite(sourceOption)?sourceOption/sourceRetained:NaN;
  const leverageAdjusted=typeof scenarioEconomics==='function'?scenarioEconomics(fullOption):fullOption;
  const remaining=Number.isFinite(leverageAdjusted)?leverageAdjusted*retained:NaN;
  const economics=document.getElementById(PANEL_ID+'Economics');
  if(economics)economics.textContent=`OPTIONALITY VALUE REMAINING · ${cash(remaining)}`;



}
export {drawRestructure};
