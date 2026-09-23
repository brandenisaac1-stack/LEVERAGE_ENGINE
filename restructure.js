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
  let panel=document.getElementById(PANEL_ID);
  if(!panel){
    panel=document.createElement('div');panel.id=PANEL_ID;
    Object.assign(panel.style,{position:'absolute',right:'18px',top:'190px',zIndex:'14',width:'315px',padding:'10px 12px',background:'rgba(7,19,33,.97)',border:`1px solid ${BLUE}`,borderRadius:'7px',fontFamily:'"Courier New",monospace',color:'#c7d7e4'});
    const title=document.createElement('div');title.textContent='EARLY RESTRUCTURE COMMITMENT';Object.assign(title.style,{color:BLUE_TEXT,fontSize:'11px',fontWeight:'700',marginBottom:'6px'});
    const value=document.createElement('div');value.id=PANEL_ID+'Value';Object.assign(value.style,{color:BLUE_TEXT,textAlign:'center',fontSize:'12px',fontWeight:'700'});
    const input=document.createElement('input');input.type='range';input.min='0';input.max='100';input.step='1';input.id=PANEL_ID+'Range';Object.assign(input.style,{width:'100%',accentColor:BLUE,cursor:'pointer'});
    input.addEventListener('input',()=>{commitmentOverride=+input.value;value.textContent=`${commitmentOverride}%`;rerender()});
    const reset=document.createElement('button');reset.textContent='RESET TO SMARTSHEET';Object.assign(reset.style,{width:'100%',fontSize:'9px',marginTop:'5px'});reset.onclick=()=>{commitmentOverride=null;input.value=String(defaultPct);value.textContent=`${defaultPct}%`;rerender()};
    panel.append(title,input,value,reset);(document.getElementById('wrap')||document.body).appendChild(panel);
  }
  const input=document.getElementById(PANEL_ID+'Range'),value=document.getElementById(PANEL_ID+'Value');
  const current=commitmentOverride==null?defaultPct:commitmentOverride;
  if(input)input.value=String(current);if(value)value.textContent=`${Math.round(current)}%`;
}
function removePanel(){document.getElementById(PANEL_ID)?.remove();commitmentOverride=null}

function drawRestructure({enabled,data,plottedSeries,x,y,m,W,base,svg,ns,txt,selected=-1,scenarioEconomics}){
  if(!enabled){removePanel();return}
  if(!Array.isArray(data)||!data.length||!Array.isArray(plottedSeries)||!plottedSeries.length)return;
  const P=plottedSeries,ctl=controls(data);if(!ctl.effective)return;
  const sourcePct=pct(ctl.progress);
  ensurePanel(sourcePct,()=>window.dispatchEvent(new Event('resize')));
  const commitment=clamp(commitmentOverride==null?sourcePct:commitmentOverride,0,100);
  const retained=1-commitment/100,start=+ctl.effective,end=+P.at(-1).date,baseline0=interp(P,start);if(!Number.isFinite(baseline0))return;

  const scenario=[];
  if(commitment<100){
    for(let i=0;i<320;i++){const t=i/319,ms=start+(end-start)*t,b=interp(P,ms),fade=smooth(Math.min(1,t/.22)),ret=1-(1-retained)*fade,up=Math.max(0,b-baseline0);scenario.push({date:new Date(ms),value:Math.min(b,b-up*(1-ret))})}
  }
  if(scenario.length>1)svg.appendChild(ns('path',{d:path(scenario.map(p=>[x(p.date),y(p.value)])),fill:'none',stroke:BLUE,'stroke-width':'2.35','stroke-dasharray':'8 5',opacity:'.98'}));
  const ex=x(ctl.effective);svg.appendChild(ns('line',{x1:ex,y1:m.t+52,x2:ex,y2:base,stroke:BLUE,'stroke-width':'1.5','stroke-dasharray':'4 4'}));svg.appendChild(ns('circle',{cx:ex,cy:y(baseline0),r:5,fill:BLUE,stroke:'#fff','stroke-width':'1.5'}));

  const row=(selected>=0&&data[selected]&&Number.isFinite(+data[selected].restructureOptionValue))?data[selected]:data.find(d=>Number.isFinite(+d.restructureOptionValue));
  const baseOption=row?+row.restructureOptionValue:NaN;
  const sourceRetained=Math.max(.000001,1-sourcePct/100);
  const fullOption=Number.isFinite(baseOption)?baseOption/sourceRetained:NaN;
  const leverageAdjusted=typeof scenarioEconomics==='function'?scenarioEconomics(fullOption):fullOption;
  const remaining=Number.isFinite(leverageAdjusted)?leverageAdjusted*retained:NaN;

  const cw=Math.min(430,Math.max(360,(W-m.l-m.r)*.26)),ch=98,cx=Math.max(m.l+10,Math.min(W-m.r-cw-10,ex-cw*.45)),cy=m.t+52;
  svg.appendChild(ns('rect',{x:cx,y:cy,width:cw,height:ch,rx:7,fill:'#071321','fill-opacity':'.97',stroke:BLUE,'stroke-width':'1.4'}));
  const line=(yy,s,c='#c7d7e4',sz='10')=>{const t=txt(cx+12,yy,s,'','start');t.setAttribute('fill',c);t.setAttribute('font-size',sz);t.setAttribute('font-weight','700')};
  line(cy+19,`EARLY RESTRUCTURE · ${label(ctl.progress)}`,BLUE_TEXT,'12');
  line(cy+39,`SMARTSHEET STATE · ${sourcePct}%`);
  line(cy+57,`SCENARIO COMMITMENT · ${Math.round(commitment)}%`);
  line(cy+75,`OPTIONALITY RETAINED · ${Math.round(retained*100)}%`);
  line(cy+92,`OPTIONALITY VALUE REMAINING · ${cash(remaining)}`,'#c7d7e4','9');
}
export {drawRestructure};
