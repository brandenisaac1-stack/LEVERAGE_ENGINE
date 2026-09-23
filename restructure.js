// EARLY RESTRUCTURE overlay — interactive commitment simulator.
// DROP-IN replacement only. No app.js/index.html/process.js/curves.js changes required.
// Smartsheet remains authoritative; slider is local scenario simulation only.

const BLUE='#3e91d7';
const BLUE_TEXT='#79baf0';
const SLIDER_ID='restructureCommitmentSimulator';

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

function smartsheetPercent(raw){
  const m=String(raw??'').match(/(\d+(?:\.\d+)?)\s*%/);
  return m?clamp(+m[1],0,100):0;
}
function stateName(raw){
  const s=String(raw??'').trim();
  const p=s.indexOf('-');
  return p>=0?s.slice(p+1).trim().toUpperCase():(s||'TEST').toUpperCase();
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
function getProgress(data){
  const row=data.find(d=>String(d.restructureProgress??'').trim());
  return row?String(row.restructureProgress).trim():'0% - TEST';
}
function getEffectiveDate(data){
  const explicit=data.map(d=>validDate(d.restructureEffectiveDate)).find(Boolean);
  if(explicit)return explicit;
  const stage=data.find(d=>String(d.processStage??'').toUpperCase().includes('RESTRUCTURE')&&validDate(d.date));
  return stage?validDate(stage.date):null;
}

let sliderValue=null;
let sliderDefault=null;
let requestRender=null;

function removeSimulator(){
  const el=document.getElementById(SLIDER_ID);
  if(el)el.remove();
  sliderValue=null;
  sliderDefault=null;
}

function ensureSimulator(defaultPct,renderFn){
  requestRender=renderFn||requestRender;
  let box=document.getElementById(SLIDER_ID);

  if(!box){
    box=document.createElement('div');
    box.id=SLIDER_ID;
    Object.assign(box.style,{
      position:'absolute',
      right:'18px',
      top:'48px',
      zIndex:'12',
      width:'300px',
      padding:'10px 12px',
      background:'rgba(7,19,33,.97)',
      border:`1px solid ${BLUE}`,
      borderRadius:'7px',
      boxShadow:'0 8px 24px rgba(0,0,0,.24)',
      fontFamily:'"Courier New",monospace',
      color:'#c7d7e4',
      pointerEvents:'auto'
    });

    const title=document.createElement('div');
    title.textContent='EARLY RESTRUCTURE COMMITMENT';
    Object.assign(title.style,{color:BLUE_TEXT,fontSize:'11px',fontWeight:'700',marginBottom:'7px'});

    const row=document.createElement('div');
    Object.assign(row.style,{display:'flex',alignItems:'center',gap:'8px'});

    const zero=document.createElement('span');
    zero.textContent='0';
    zero.style.fontSize='9px';

    const input=document.createElement('input');
    input.type='range';
    input.min='0';
    input.max='100';
    input.step='1';
    input.id=SLIDER_ID+'Range';
    Object.assign(input.style,{flex:'1',accentColor:BLUE,cursor:'pointer'});

    const hundred=document.createElement('span');
    hundred.textContent='100';
    hundred.style.fontSize='9px';

    const value=document.createElement('div');
    value.id=SLIDER_ID+'Value';
    Object.assign(value.style,{color:BLUE_TEXT,fontSize:'12px',fontWeight:'700',textAlign:'center',marginTop:'5px'});

    const note=document.createElement('div');
    note.textContent='LOCAL SCENARIO · RESET/REFRESH RETURNS TO SMARTSHEET';
    Object.assign(note.style,{fontSize:'8px',color:'#7890a2',textAlign:'center',marginTop:'4px'});

    row.append(zero,input,hundred);
    box.append(title,row,value,note);

    const host=document.getElementById('wrap')||document.body;
    host.appendChild(box);

    input.addEventListener('input',()=>{
      sliderValue=+input.value;
      value.textContent=`${sliderValue}%`;
      if(typeof requestRender==='function')requestRender();
    });
  }

  const input=document.getElementById(SLIDER_ID+'Range');
  const value=document.getElementById(SLIDER_ID+'Value');

  if(sliderDefault!==defaultPct || sliderValue===null){
    sliderDefault=defaultPct;
    sliderValue=defaultPct;
    if(input)input.value=String(defaultPct);
  }
  if(value)value.textContent=`${Math.round(sliderValue)}%`;
}

function drawRestructure({
  enabled,
  data,
  plottedSeries,
  x,y,m,W,base,svg,ns,txt,selected=-1
}){
  if(!enabled){
    removeSimulator();
    return;
  }
  if(!Array.isArray(data)||!data.length||!Array.isArray(plottedSeries)||!plottedSeries.length)return;

  const P=plottedSeries;
  const progress=getProgress(data);
  const sourcePct=smartsheetPercent(progress);
  const label=stateName(progress);
  const effective=getEffectiveDate(data);
  if(!effective)return;

  // render() is globally reachable only through UI event; dispatching change on toggle is unnecessary.
  // Re-render safely by using window resize, which current app.js already binds to render().
  ensureSimulator(sourcePct,()=>window.dispatchEvent(new Event('resize')));

  const commitment=clamp(sliderValue??sourcePct,0,100);
  const retained=1-commitment/100;
  const startMs=+effective;
  const horizonMs=+P[P.length-1].date;
  if(!Number.isFinite(startMs)||startMs>horizonMs)return;

  const baselineAtStart=interpolateTenant(P,startMs);
  if(!Number.isFinite(baselineAtStart))return;

  const executed=commitment>=100;
  const scenario=[];

  if(!executed){
    const N=320;
    for(let i=0;i<N;i++){
      const t=i/(N-1);
      const ms=startMs+(horizonMs-startMs)*t;
      const baseline=interpolateTenant(P,ms);
      if(!Number.isFinite(baseline))continue;

      // Smoothly phase commitment into the future path.
      const fade=smoothstep(Math.min(1,t/.22));
      const retainedNow=1-(1-retained)*fade;
      const upside=Math.max(0,baseline-baselineAtStart);
      let scenarioValue=baseline-upside*(1-retainedNow);
      scenarioValue=Math.min(scenarioValue,baseline);

      scenario.push({date:new Date(ms),value:scenarioValue});
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
  svg.appendChild(ns('line',{
    x1:ex,y1:m.t+52,x2:ex,y2:base,
    stroke:BLUE,'stroke-width':'1.5','stroke-dasharray':'4 4',opacity:'.78'
  }));
  svg.appendChild(ns('circle',{
    cx:ex,cy:y(baselineAtStart),r:5,
    fill:BLUE,stroke:'#fff','stroke-width':'1.5'
  }));

  let econRow=null;
  if(selected>=0&&data[selected]&&+data[selected].date>=startMs&&Number.isFinite(+data[selected].npvDelta)){
    econRow=data[selected];
  }else{
    econRow=data.find(d=>+d.date>=startMs&&Number.isFinite(+d.npvDelta))||null;
  }
  const optionValue=econRow?+econRow.npvDelta:NaN;

  const cardW=Math.min(430,Math.max(360,(W-m.l-m.r)*.26));
  const cardH=98;
  const cardX=Math.max(m.l+10,Math.min(W-m.r-cardW-10,ex-cardW*.45));
  const cardY=m.t+52;

  svg.appendChild(ns('rect',{
    x:cardX,y:cardY,width:cardW,height:cardH,rx:7,
    fill:'#071321','fill-opacity':'.97',stroke:BLUE,'stroke-width':'1.4'
  }));

  const line=(yy,textValue,color='#c7d7e4',size='10',weight='700')=>{
    const t=txt(cardX+12,yy,textValue,'','start');
    t.setAttribute('fill',color);
    t.setAttribute('font-size',size);
    t.setAttribute('font-weight',weight);
    return t;
  };

  line(cardY+19,`EARLY RESTRUCTURE · ${label}`,BLUE_TEXT,'12');
  line(cardY+39,`SMARTSHEET STATE · ${sourcePct}%`);
  line(cardY+57,`SCENARIO COMMITMENT · ${Math.round(commitment)}%`);
  line(cardY+75,`OPTIONALITY RETAINED · ${Math.round(retained*100)}%`);
  line(cardY+92,`VALUE OF PRESERVING OPTIONALITY · ${money(optionValue)}`,'#c7d7e4','9');

  if(executed){
    const executedLabel=txt(ex+10,y(baselineAtStart)-10,'RESTRUCTURE EXECUTED','','start');
    executedLabel.setAttribute('fill',BLUE_TEXT);
    executedLabel.setAttribute('font-size','10');
    executedLabel.setAttribute('font-weight','700');
  }
}

export {drawRestructure};
