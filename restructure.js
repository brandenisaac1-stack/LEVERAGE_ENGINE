// EARLY RESTRUCTURE — clean stacked scenario control.
// Red/cyan governing curves remain untouched.
// This module owns ONLY the dependent blue restructure scenario + its local commitment control.

const BLUE='#3e91d7';
const BLUE_TEXT='#79baf0';
const PANEL_ID='earlyRestructureStack';

let commitmentOverride=null;
let lastSourcePct=null;

function validDate(v){
  if(v instanceof Date)return Number.isFinite(+v)?new Date(+v):null;
  if(v==null||v==='')return null;
  const d=new Date(v);
  return Number.isFinite(+d)?d:null;
}
function money(v){
  return Number.isFinite(+v)
    ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(+v)
    : '—';
}
function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,v))}
function smoothstep(v){v=clamp(v);return v*v*(3-2*v)}

function sourcePercent(raw){
  const m=String(raw??'').match(/(\d+(?:\.\d+)?)\s*%/);
  return m?clamp(+m[1],0,100):0;
}
function stateLabel(raw){
  const s=String(raw??'').trim();
  const i=s.indexOf('-');
  return (i>=0?s.slice(i+1):s||'TEST').trim().toUpperCase();
}

// Matches the Smartsheet state assumptions already established:
// 0 TEST=100%, 25 PRICE=95%, 50 CONVERGE=75%, 75 COMMIT=35%, 100 EXECUTED=0%.
// Slider values between anchors interpolate continuously.
function retainedForCommitment(pct){
  const p=clamp(+pct,0,100);
  const pts=[
    [0,1.00],
    [25,0.95],
    [50,0.75],
    [75,0.35],
    [100,0.00]
  ];
  for(let i=0;i<pts.length-1;i++){
    const [p0,r0]=pts[i],[p1,r1]=pts[i+1];
    if(p<=p1){
      const t=(p-p0)/(p1-p0);
      return r0+(r1-r0)*t;
    }
  }
  return 0;
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
  const a=P[lo],b=P[hi],span=(+b.date-+a.date)||1;
  const t=(ms-+a.date)/span;
  return +a.plotTenant+(+b.plotTenant-+a.plotTenant)*t;
}

function curvePath(pts){
  if(pts.length<2)return'';
  let d=`M ${pts[0][0]} ${pts[0][1]}`;
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
    d+=` C ${p1[0]+(p2[0]-p0[0])/6} ${p1[1]+(p2[1]-p0[1])/6}, ${p2[0]-(p3[0]-p1[0])/6} ${p2[1]-(p3[1]-p1[1])/6}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function controls(data){
  const progress=String(
    data.find(d=>String(d.restructureProgress??'').trim())?.restructureProgress
    ??'0% - TEST'
  ).trim();

  const explicit=data.map(d=>validDate(d.restructureEffectiveDate)).find(Boolean);
  const fallbackRow=data.find(d=>
    String(d.processStage??'').toUpperCase().includes('RESTRUCTURE') &&
    validDate(d.date)
  );

  return {
    progress,
    effective:explicit||validDate(fallbackRow?.date)
  };
}

function stagePlacement(data,x,m,H){
  const rows=data
    .filter(d=>validDate(d.date)&&String(d.processStage??'').trim())
    .slice()
    .sort((a,b)=>+a.date-+b.date);

  const ordered=[];
  const seen=new Set();
  for(const d of rows){
    const key=String(d.processStage).trim();
    const u=key.toUpperCase();
    if(!seen.has(u)){seen.add(u);ordered.push({key,date:validDate(d.date)});}
  }

  let idx=ordered.findIndex(s=>s.key.toUpperCase().includes('RESTRUCTURE'));
  if(idx<0)idx=1;

  const start=ordered[idx]?.date;
  const end=ordered[idx+1]?.date;
  const lane=.24+(idx%7)*.095;
  const barY=m.t+(H-m.t-32)*lane;
  const midX=start&&end?(x(start)+x(end))/2:(start?x(start):m.l+300);

  return {barY,midX};
}

function removePanel(){
  document.getElementById(PANEL_ID)?.remove();
  commitmentOverride=null;
  lastSourcePct=null;
}

function ensurePanel({sourcePct,label,retained,remaining,left,top,rerender}){
  let panel=document.getElementById(PANEL_ID);

  if(!panel){
    panel=document.createElement('div');
    panel.id=PANEL_ID;

    Object.assign(panel.style,{
      position:'absolute',
      zIndex:'14',
      width:'390px',
      padding:'10px 12px',
      background:'rgba(7,19,33,.97)',
      border:`1px solid ${BLUE}`,
      borderRadius:'7px',
      boxShadow:'0 8px 24px rgba(0,0,0,.24)',
      fontFamily:'"Courier New",monospace',
      color:'#c7d7e4',
      pointerEvents:'auto'
    });

    panel.innerHTML=`
      <div id="${PANEL_ID}Title" style="color:${BLUE_TEXT};font-size:11px;font-weight:700;margin-bottom:5px"></div>
      <div id="${PANEL_ID}Meta" style="font-size:9px;color:#c7d7e4;margin-bottom:7px"></div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:9px">0</span>
        <input id="${PANEL_ID}Range" type="range" min="0" max="100" step="1"
          style="flex:1;accent-color:${BLUE};cursor:pointer">
        <span style="font-size:9px">100</span>
        <strong id="${PANEL_ID}Pct" style="color:${BLUE_TEXT};font-size:11px;min-width:34px;text-align:right"></strong>
      </div>
      <div id="${PANEL_ID}Economics" style="font-size:9px;color:#c7d7e4;margin-top:7px"></div>
    `;

    (document.getElementById('wrap')||document.body).appendChild(panel);

    panel.querySelector(`#${PANEL_ID}Range`).addEventListener('input',e=>{
      commitmentOverride=+e.target.value;
      rerender();
    });
  }

  Object.assign(panel.style,{
    left:`${Math.round(left)}px`,
    top:`${Math.round(top)}px`
  });

  const range=panel.querySelector(`#${PANEL_ID}Range`);
  const pctEl=panel.querySelector(`#${PANEL_ID}Pct`);

  // A changed Smartsheet state resets the local simulator to the new authoritative state.
  if(lastSourcePct!==sourcePct){
    lastSourcePct=sourcePct;
    commitmentOverride=null;
  }

  const current=commitmentOverride==null?sourcePct:commitmentOverride;
  range.value=String(current);
  pctEl.textContent=`${Math.round(current)}%`;

  panel.querySelector(`#${PANEL_ID}Title`).textContent=`EARLY RESTRUCTURE · ${label}`;
  panel.querySelector(`#${PANEL_ID}Meta`).textContent=
    `SMARTSHEET ${Math.round(sourcePct)}%  ·  SCENARIO ${Math.round(current)}%  ·  OPTIONALITY RETAINED ${Math.round(retained*100)}%`;
  panel.querySelector(`#${PANEL_ID}Economics`).textContent=
    `OPTIONALITY VALUE REMAINING · ${money(remaining)}`;

  return current;
}

function drawRestructure({
  enabled,
  data,
  plottedSeries,
  x,y,m,W,H,base,svg,ns,txt,selected=-1
}){
  if(!enabled){
    removePanel();
    return;
  }

  if(!Array.isArray(data)||!data.length||!Array.isArray(plottedSeries)||!plottedSeries.length)return;

  const P=plottedSeries;
  const ctl=controls(data);
  if(!ctl.effective)return;

  const sourcePct=sourcePercent(ctl.progress);
  const sourceRetained=retainedForCommitment(sourcePct);

  // Determine current local commitment before drawing.
  if(lastSourcePct!==sourcePct){
    lastSourcePct=sourcePct;
    commitmentOverride=null;
  }
  const commitment=clamp(commitmentOverride==null?sourcePct:commitmentOverride,0,100);
  const retained=retainedForCommitment(commitment);

  const startMs=+ctl.effective;
  const horizonMs=+P[P.length-1].date;
  if(!Number.isFinite(startMs)||startMs>horizonMs)return;

  const baselineAtStart=interpolateTenant(P,startMs);
  if(!Number.isFinite(baselineAtStart))return;

  // Blue is dependent on the untouched cyan counterfactual.
  // 0% commitment = blue overlays cyan.
  // Increasing commitment progressively consumes future incremental leverage.
  // 100% = executed; no continuing active blue path.
  const scenario=[];

  if(commitment<100){
    const N=320;
    for(let i=0;i<N;i++){
      const t=i/(N-1);
      const ms=startMs+(horizonMs-startMs)*t;
      const baseline=interpolateTenant(P,ms);
      if(!Number.isFinite(baseline))continue;

      const fade=smoothstep(Math.min(1,t/.22));
      const retainedNow=1-(1-retained)*fade;
      const upside=Math.max(0,baseline-baselineAtStart);
      const value=Math.min(baseline,baseline-upside*(1-retainedNow));

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

  const ex=x(ctl.effective);

  svg.appendChild(ns('line',{
    x1:ex,y1:m.t+52,x2:ex,y2:base,
    stroke:BLUE,'stroke-width':'1.5','stroke-dasharray':'4 4',opacity:'.78'
  }));

  svg.appendChild(ns('circle',{
    cx:ex,cy:y(baselineAtStart),r:5,
    fill:BLUE,stroke:'#fff','stroke-width':'1.5'
  }));

  if(commitment>=100){
    const t=txt(ex+10,y(baselineAtStart)-10,'RESTRUCTURE EXECUTED','','start');
    t.setAttribute('fill',BLUE_TEXT);
    t.setAttribute('font-size','10');
    t.setAttribute('font-weight','700');
  }

  // Use the actual RESTRUCTURE_OPTION_VALUE from Smartsheet as the authoritative
  // remaining value at the Smartsheet commitment state.
  let econRow=null;

  if(
    selected>=0 &&
    data[selected] &&
    Number.isFinite(+data[selected].restructureOptionValue)
  ){
    econRow=data[selected];
  }else{
    econRow=data.find(d=>
      +d.date>=startMs &&
      Number.isFinite(+d.restructureOptionValue)
    ) || data.find(d=>Number.isFinite(+d.restructureOptionValue)) || null;
  }

  const sourceRemaining=econRow?+econRow.restructureOptionValue:NaN;

  // Back-solve full optionality from the authoritative Smartsheet state, then
  // apply the continuous slider retention curve. At the default state this
  // reproduces RESTRUCTURE_OPTION_VALUE exactly.
  let fullOptionality=NaN;
  if(Number.isFinite(sourceRemaining)){
    if(sourceRetained>0){
      fullOptionality=sourceRemaining/sourceRetained;
    }else{
      // If Smartsheet is already 100% executed, use timing delta only as a
      // reference ceiling when available; remaining value still resolves to 0.
      const raw=econRow&&Number.isFinite(+econRow.npvDelta)?+econRow.npvDelta:NaN;
      fullOptionality=raw;
    }
  }

  const remaining=Number.isFinite(fullOptionality)
    ? fullOptionality*retained
    : NaN;

  // ONE coherent stacked control, positioned directly above the live
  // EARLY RESTRUCTURE EXPLORATION process bar.
  const place=stagePlacement(data,x,m,H);
  const panelW=390;
  const panelH=84;
  const left=clamp(place.midX-panelW/2,m.l+8,W-m.r-panelW-8);
  const top=Math.max(m.t+8,place.barY-panelH-22);

  ensurePanel({
    sourcePct,
    label:stateLabel(ctl.progress),
    retained,
    remaining,
    left,
    top,
    rerender:()=>window.dispatchEvent(new Event('resize'))
  });
}

export {drawRestructure};
