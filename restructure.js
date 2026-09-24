const BLUE='#3e91d7',BLUE_TEXT='#79baf0',PANEL='earlyRestructureBottom';
let override=null,lastSource=null;
function vd(v){if(v instanceof Date)return Number.isFinite(+v)?new Date(+v):null;if(v==null||v==='')return null;const d=new Date(v);return Number.isFinite(+d)?d:null}
function cash(v){return Number.isFinite(+v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(+v):'—'}
function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,v))}
function smooth(v){v=clamp(v);return v*v*(3-2*v)}
function pct(s){const m=String(s??'').match(/(\d+(?:\.\d+)?)\s*%/);return m?clamp(+m[1],0,100):0}
function lbl(s){s=String(s??'').trim();const i=s.indexOf('-');return(i>=0?s.slice(i+1):s||'TEST').trim().toUpperCase()}
function retained(p){p=clamp(+p,0,100);const a=[[0,1],[25,.95],[50,.75],[75,.35],[100,0]];for(let i=0;i<a.length-1;i++){const[p0,r0]=a[i],[p1,r1]=a[i+1];if(p<=p1){const t=(p-p0)/(p1-p0);return r0+(r1-r0)*t}}return 0}
function interp(P,ms){if(ms<=+P[0].date)return +P[0].plotTenant;if(ms>=+P.at(-1).date)return +P.at(-1).plotTenant;let a=0,b=P.length-1;while(b-a>1){const n=(a+b)>>1;if(+P[n].date<=ms)a=n;else b=n}const p=P[a],q=P[b],t=(ms-+p.date)/((+q.date-+p.date)||1);return +p.plotTenant+(+q.plotTenant-+p.plotTenant)*t}
function path(q){if(q.length<2)return'';let d=`M ${q[0][0]} ${q[0][1]}`;for(let i=0;i<q.length-1;i++){const p0=q[Math.max(0,i-1)],p1=q[i],p2=q[i+1],p3=q[Math.min(q.length-1,i+2)];d+=` C ${p1[0]+(p2[0]-p0[0])/6} ${p1[1]+(p2[1]-p0[1])/6}, ${p2[0]-(p3[0]-p1[0])/6} ${p2[1]-(p3[1]-p1[1])/6}, ${p2[0]} ${p2[1]}`}return d}
function ctl(data){const progress=String(data.find(d=>String(d.restructureProgress??'').trim())?.restructureProgress??'0% - TEST').trim();const effective=data.map(d=>vd(d.restructureEffectiveDate)).find(Boolean)||vd(data.find(d=>String(d.processStage??'').toUpperCase().includes('RESTRUCTURE'))?.date);return{progress,effective}}
function removeUI(){document.getElementById(PANEL)?.remove();document.getElementById(PANEL+'Summary')?.remove();override=null;lastSource=null}
function ui(source,label,ret,remaining,rerender){
  const impact=document.getElementById('impact');if(!impact)return;
  Object.assign(impact.style,{position:'relative',display:'grid',gridTemplateColumns:'1fr 1.2fr 1fr',gap:'10px',alignItems:'stretch',padding:'8px 10px',minHeight:'96px'});
  let center=document.getElementById(PANEL+'Center');
  if(!center){center=document.createElement('div');center.id=PANEL+'Center';Object.assign(center.style,{gridColumn:'2',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'});[impact.querySelector('.impact-title'),document.getElementById('impactDelta'),document.getElementById('impactNpv')].filter(Boolean).forEach(e=>center.appendChild(e));impact.appendChild(center)}
  let p=document.getElementById(PANEL);
  if(!p){p=document.createElement('div');p.id=PANEL;Object.assign(p.style,{gridColumn:'1',padding:'8px 10px',background:'rgba(7,19,33,.97)',border:`1px solid ${BLUE}`,borderRadius:'7px',fontFamily:'"Courier New",monospace',color:'#c7d7e4',zIndex:'20'});p.innerHTML=`<div style="color:${BLUE_TEXT};font-size:11px;font-weight:700;margin-bottom:5px">EARLY RESTRUCTURE COMMITMENT</div><div id="${PANEL}Meta" style="font-size:9px;margin-bottom:6px"></div><div style="display:flex;align-items:center;gap:7px"><span style="font-size:9px">0</span><input id="${PANEL}Range" type="range" min="0" max="100" step="1" style="flex:1;accent-color:${BLUE}"><span style="font-size:9px">100</span><b id="${PANEL}Pct" style="color:${BLUE_TEXT};min-width:34px;text-align:right"></b></div>`;impact.appendChild(p);p.querySelector('#'+PANEL+'Range').addEventListener('input',e=>{override=+e.target.value;rerender()})}
  let s=document.getElementById(PANEL+'Summary');if(!s){s=document.createElement('div');s.id=PANEL+'Summary';Object.assign(s.style,{gridColumn:'3',padding:'8px 10px',background:'rgba(7,19,33,.82)',border:`1px solid ${BLUE}`,borderRadius:'7px',fontFamily:'"Courier New",monospace',color:'#c7d7e4',zIndex:'20',display:'flex',flexDirection:'column',justifyContent:'center'});impact.appendChild(s)}
  if(lastSource!==source){lastSource=source;override=null}
  const current=override==null?source:override;
  p.querySelector('#'+PANEL+'Range').value=String(current);p.querySelector('#'+PANEL+'Pct').textContent=`${Math.round(current)}%`;p.querySelector('#'+PANEL+'Meta').textContent=`SMARTSHEET ${Math.round(source)}% · SCENARIO ${Math.round(current)}%`;
  s.innerHTML=`<div style="color:${BLUE_TEXT};font-size:11px;font-weight:700;margin-bottom:7px">EARLY RESTRUCTURE · ${label}</div><div style="font-size:9px;margin-bottom:5px">OPTIONALITY RETAINED · ${Math.round(ret*100)}%</div><div style="font-size:10px;font-weight:700">OPTIONALITY VALUE REMAINING · ${cash(remaining)}</div>`;
}
function drawRestructure({enabled,data,plottedSeries,x,y,m,W,H,base,svg,ns,txt,selected=-1}){
  if(!enabled){removeUI();return}
  if(!Array.isArray(data)||!data.length||!Array.isArray(plottedSeries)||!plottedSeries.length)return;
  const P=plottedSeries,c=ctl(data);if(!c.effective)return;
  const source=pct(c.progress);if(lastSource!==source){lastSource=source;override=null}const commit=clamp(override==null?source:override,0,100),ret=retained(commit),start=+c.effective,end=+P.at(-1).date,b0=interp(P,start);if(!Number.isFinite(b0))return;
  const q=[];if(commit<100){for(let i=0;i<320;i++){const t=i/319,ms=start+(end-start)*t,b=interp(P,ms),fade=smooth(Math.min(1,t/.22)),rn=1-(1-ret)*fade,up=Math.max(0,b-b0);q.push({date:new Date(ms),value:Math.min(b,b-up*(1-rn))})}}
  if(q.length>1)svg.appendChild(ns('path',{d:path(q.map(p=>[x(p.date),y(p.value)])),fill:'none',stroke:BLUE,'stroke-width':'2.35','stroke-dasharray':'8 5',opacity:'.98'}));
  const ex=x(c.effective);svg.appendChild(ns('line',{x1:ex,y1:m.t+52,x2:ex,y2:base,stroke:BLUE,'stroke-width':'1.5','stroke-dasharray':'4 4',opacity:'.78'}));svg.appendChild(ns('circle',{cx:ex,cy:y(b0),r:5,fill:BLUE,stroke:'#fff','stroke-width':'1.5'}));
  let er=selected>=0&&data[selected]&&Number.isFinite(+data[selected].restructureOptionValue)?data[selected]:data.find(d=>Number.isFinite(+d.restructureOptionValue));const sourceVal=er?+er.restructureOptionValue:NaN,sourceRet=retained(source);const full=Number.isFinite(sourceVal)&&sourceRet>0?sourceVal/sourceRet:NaN,remaining=Number.isFinite(full)?full*ret:0;
  ui(source,lbl(c.progress),ret,remaining,()=>window.dispatchEvent(new Event('resize')));
}
export{drawRestructure};
