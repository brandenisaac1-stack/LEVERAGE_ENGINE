import {series,valueAt,smoothPath} from "./curves.js";
import {drawProcess} from "./process.js";
import {escapeHtml,money,showPopup} from "./annotations.js";

const qs=new URLSearchParams(location.search);
const CFG={clientId:qs.get("clientId")||"",service:qs.get("service")||"",portal:qs.get("portal")||"https://www.arcgis.com",startRow:+(qs.get("windowStartRow")||13),endRow:+(qs.get("windowEndRow")||17),selected:qs.get("selected")||qs.get("iteration")||""};
const $=id=>document.getElementById(id),wrap=$("wrap"),svg=$("chart"),popup=$("popup"),select=$("iteration"),status=$("status"),center=$("center"),msg=$("msg");
let DATA=[],selected=-1,idm,FeatureLayer,fields={};

const ns=(n,a={})=>{const e=document.createElementNS("http://www.w3.org/2000/svg",n);Object.entries(a).forEach(([k,v])=>e.setAttribute(k,v));return e};
const txt=(x,y,s,cl,an="start")=>{const t=ns("text",{x,y,class:cl,"text-anchor":an});t.textContent=s;svg.appendChild(t);return t};
const fmt=d=>`${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${String(d.getFullYear()).slice(-2)}`;
const months=(a,b)=>Math.max(0,Math.round((b-a)/2629800000));
function state(s,c=""){status.textContent=s;status.className="status "+c}
function pick(fs,cands,req=false){const m=new Map(fs.map(f=>[f.name.toLowerCase(),f.name]));for(const c of cands)if(m.has(c.toLowerCase()))return m.get(c.toLowerCase());if(req)throw new Error("Required field missing: "+cands.join(" / "));return null}
function val(a,k){return fields[k]?a[fields[k]]:null}
function parseIteration(s){const m=String(s||"").match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;const yr=y=>+y<100?2000+(+y):+y;return{start:new Date(yr(m[3]),+m[1]-1,+m[2]),end:new Date(yr(m[6]),+m[4]-1,+m[5])}}
function windowBounds(){
  const openRec=DATA[CFG.startRow-1],closeRec=DATA[CFG.endRow-2];
  const po=parseIteration(openRec?.iteration),pc=parseIteration(closeRec?.iteration);
  return{start:po?.start||openRec?.date,end:pc?.end||closeRec?.date};
}
function today(){const d=new Date();d.setHours(0,0,0,0);return d}

async function setup(){
  if(!CFG.clientId||!CFG.service){state("Missing configuration","err");msg.textContent="Missing clientId or service URL.";return}
  const OAuthInfo=await $arcgis.import("@arcgis/core/identity/OAuthInfo.js");
  idm=await $arcgis.import("@arcgis/core/identity/IdentityManager.js");
  FeatureLayer=await $arcgis.import("@arcgis/core/layers/FeatureLayer.js");
  const info=new OAuthInfo({appId:CFG.clientId,portalUrl:CFG.portal,popup:true,popupCallbackUrl:"oauth-callback.html",flowType:"auto"});
  idm.registerOAuthInfos([info]);
  try{await idm.checkSignInStatus(CFG.portal+"/sharing/rest");await load()}catch{state("Sign in required","warn")}
}
async function signIn(){try{state("Opening ArcGIS sign-in…","warn");await idm.getCredential(CFG.portal+"/sharing/rest");await load()}catch(e){console.error(e);state("Authentication failed","err");msg.innerHTML=`<span style="color:#ff9ca7">Authentication did not complete.</span><br>${escapeHtml(e.message||e)}`;center.hidden=false}}
async function load(){
  center.hidden=false;msg.textContent="Authenticated. Loading protected chart data…";state("Loading protected layer…","warn");
  const layer=new FeatureLayer({url:CFG.service});await layer.load();
  fields={date:pick(layer.fields,["Chart_dates","chart_dates","chart_date"],true),tenant:pick(layer.fields,["Decision_Curve_0to100","decision_curve_0to100","decision_0to100"],true),landlord:pick(layer.fields,["plot_LL","plot_ll"],true),iteration:pick(layer.fields,["comb_iter","iteration"]),phase:pick(layer.fields,["Phases","phase"]),action:pick(layer.fields,["ACTION_POINT","action_point"]),rent:pick(layer.fields,["ACTION_EFFECTIVE_RENT","action_effective_rent"]),alev:pick(layer.fields,["ACTION_LEVERAGE","action_leverage"]),wait:pick(layer.fields,["NET_WAIT_VALUE_DAY","net_wait_value_day"]),chrono:pick(layer.fields,["CHRONOS_ACTION","chronos_action"]),read:pick(layer.fields,["chronos_read","economic_read"]),npvToday:pick(layer.fields,["ACTION_NPV_CURRENT","action_npv_current"]),npvExec:pick(layer.fields,["ACTION_NPV_EXEC_ADJUSTED","action_npv_exec_adjusted"]),npvDelta:pick(layer.fields,["ACTION_NPV_TIMING_DELTA","action_npv_timing_delta"])};
  const out=[...new Set(Object.values(fields).filter(Boolean))],q=layer.createQuery();
  q.where=`${fields.tenant} IS NOT NULL AND ${fields.date} IS NOT NULL`;q.outFields=out;q.returnGeometry=false;q.orderByFields=[`${fields.date} ASC`];
  const r=await layer.queryFeatures(q);
  DATA=r.features.map(f=>{const a=f.attributes;let t=+val(a,"tenant");if(t<=1.5)t*=100;return{date:new Date(val(a,"date")),tenant:t,landlord:+val(a,"landlord"),iteration:val(a,"iteration"),phase:val(a,"phase"),action:val(a,"action"),rent:val(a,"rent"),alev:val(a,"alev"),wait:val(a,"wait"),chrono:val(a,"chrono"),read:val(a,"read"),npvToday:val(a,"npvToday"),npvExec:val(a,"npvExec"),npvDelta:val(a,"npvDelta")}}).filter(d=>Number.isFinite(+d.date)&&Number.isFinite(d.tenant)&&Number.isFinite(d.landlord)).sort((a,b)=>a.date-b.date);
  select.innerHTML='<option value="-1">— none —</option>'+DATA.map((d,i)=>`<option value="${i}">${escapeHtml(d.iteration||fmt(d.date))}</option>`).join("");
  $("login").hidden=true;$("logout").hidden=false;select.disabled=false;$("clear").disabled=false;center.hidden=true;state(`Live · ${DATA.length} chart rows`,"ok");
  if(CFG.selected){selected=DATA.findIndex(d=>String(d.iteration||"").trim()===CFG.selected.trim());select.value=String(selected)}
  render();updateImpact();
}
function render(){
  if(!DATA.length)return;

  const win=windowBounds();
  const P=series(DATA,win);
  const W=wrap.clientWidth;
  const H=wrap.clientHeight;

  // Layout only. This does NOT determine leverage scale.
  const m={l:68,r:24,t:126,b:38};
  const pw=W-m.l-m.r;
  const ph=H-m.t-m.b;
  const x0=+P[0].date;
  const x1=+P.at(-1).date;

  // SINGLE SOURCE OF TRUTH FOR THE Y DOMAIN.
  // Measure the FINAL series that is actually about to be drawn.
  const renderedValues=[];
  for(const point of P){
    if(Number.isFinite(point.plotTenant)) renderedValues.push(point.plotTenant);
    if(Number.isFinite(point.plotLandlord)) renderedValues.push(point.plotLandlord);
  }
  if(!renderedValues.length) throw new Error("No finite rendered leverage values.");

  const renderedMin=Math.min(...renderedValues);
  const renderedMax=Math.max(...renderedValues);

  // Automatic for every client/group. Exactly 10 leverage points of breathing room.
  // No floor(), ceil(), fixed 35/100, or tick rounding is allowed to change this domain.
  const axisPadding=10;
  const ymin=Math.max(0,renderedMin-axisPadding);
  const ymax=Math.min(100,renderedMax+axisPadding);

  const x=d=>m.l+((+d-x0)/(x1-x0))*pw;
  const y=v=>m.t+((ymax-v)/(ymax-ymin))*ph;
  const base=y(ymin);

  // Visible verification of the ACTIVE scale; proves what this running build is using.
  status.textContent=`Live · ${DATA.length} chart rows · Y ${Math.round(ymin*10)/10}–${Math.round(ymax*10)/10}`;

svg.setAttribute("viewBox",`0 0 ${W} ${H}`);svg.innerHTML="";

  {
    const tickStep=5;
    const firstTick=Math.ceil(ymin/tickStep)*tickStep;
    const lastTick=Math.floor(ymax/tickStep)*tickStep;
    // Y-axis ticks are labels INSIDE the exact domain; they never redefine it.
  // Use a readable step based on the actual domain span.
  const ySpan=ymax-ymin;
  const tickStep=ySpan<=35?5:ySpan<=70?10:20;
  const firstTick=Math.ceil(ymin/tickStep)*tickStep;
  const lastTick=Math.floor(ymax/tickStep)*tickStep;

  // Explicit true domain endpoints so you can SEE the automatic padding.
  
  for(let v=firstTick;v<=lastTick+1e-9;v+=tickStep){
    if(Math.abs(v-ymin)<.01||Math.abs(v-ymax)<.01)continue;
    svg.appendChild(ns("line",{x1:m.l,y1:y(v),x2:W-m.r,y2:y(v),class:"grid"}));
    txt(m.l-8,y(v)+3,(Math.round(v*10)/10).toString(),"axis","end");
  }
  

  for(let yr=P[0].date.getFullYear();yr<=P.at(-1).date.getFullYear();yr++){const d=new Date(`${yr}-01-01T00:00:00`);if(+d>=x0&&+d<=x1){svg.appendChild(ns("line",{x1:x(d),y1:m.t,x2:x(d),y2:base,class:"grid"}));txt(x(d),H-10,"Jan "+yr,"axis","middle")}}

  const wx1=x(win.start),wx2=x(win.end);
  svg.appendChild(ns("rect",{x:wx1,y:m.t,width:Math.max(2,wx2-wx1),height:ph,class:"windowShade"}));

  const tp=P.map(d=>[x(d.date),y(d.plotTenant)]),lp=P.map(d=>[x(d.date),y(d.plotLandlord)]),tl=smoothPath(tp),ll=smoothPath(lp);
  svg.appendChild(ns("path",{d:ll+` L ${lp.at(-1)[0]} ${base} L ${lp[0][0]} ${base} Z`,fill:"#b50019","fill-opacity":".52"}));
  svg.appendChild(ns("path",{d:tl+` L ${tp.at(-1)[0]} ${base} L ${tp[0][0]} ${base} Z`,fill:"#4b8584","fill-opacity":".48"}));
  svg.appendChild(ns("path",{d:ll,fill:"none",stroke:"#f21e32","stroke-width":"3.25"}));
  svg.appendChild(ns("path",{d:tl,fill:"none",stroke:"#69c9c6","stroke-width":"3.25"}));

  // Dedicated header band: impossible for curves to intersect these labels.
  const headerTitleY=42,arrowY=65,dateY=91;
  txt((wx1+wx2)/2,headerTitleY,"OPTIMAL EXECUTION WINDOW","windowTitle","middle");
  svg.appendChild(ns("line",{x1:wx1+12,y1:arrowY,x2:wx2-12,y2:arrowY,class:"windowArrow"}));
  svg.appendChild(ns("path",{d:`M ${wx1+12} ${arrowY} l 8 -5 M ${wx1+12} ${arrowY} l 8 5 M ${wx2-12} ${arrowY} l -8 -5 M ${wx2-12} ${arrowY} l -8 5`,class:"windowArrow"}));
  txt((wx1+wx2)/2,dateY,`${fmt(win.start)} – ${fmt(win.end)}`,"windowDate","middle");
  [win.start,win.end].forEach(d=>{const xx=x(d);svg.appendChild(ns("line",{x1:xx,y1:34,x2:xx,y2:base,class:"guideDash"}))});

  const now=today();
  if(+now>=x0&&+now<=x1){
    const tx=x(now),exp=parseIteration(DATA.at(-1).iteration)?.end||DATA.at(-1).date;
    svg.appendChild(ns("line",{x1:tx,y1:34,x2:tx,y2:base,class:"guideDash"}));
    txt(tx+10,47,`TODAY (${fmt(now)})`,"todayTitle");
    txt(tx+10,65,`${months(now,exp)} months to lease expiration`,"todaySub");
    txt(tx+10,81,`${months(now,win.start)} months to optimal execution window`,"todaySub");
  }

  if($("process").checked)drawProcess(svg,{ns,txt},{x,m,W,H,x0,x1,win});

  DATA.forEach((d,i)=>{const v=valueAt(d.date,DATA,win),h=ns("circle",{cx:x(d.date),cy:y(v.tenant),r:11,fill:"transparent",style:"cursor:pointer"});h.addEventListener("click",()=>choose(i));svg.appendChild(h)});
  if(selected>=0&&DATA[selected]){
    const d=DATA[selected],v=valueAt(d.date,DATA,win),sx=x(d.date),sy=y(v.tenant),ly=y(v.landlord);
    svg.appendChild(ns("line",{x1:sx,y1:m.t,x2:sx,y2:base,class:"sel"}));
    svg.appendChild(ns("circle",{cx:sx,cy:sy,r:5,fill:"#16e6e9",class:"dot"}));svg.appendChild(ns("circle",{cx:sx,cy:ly,r:5,fill:"#f21e32",class:"dot"}));
    showPopup(popup,d,sx,Math.min(sy,ly),W,H,m,$("anno").checked);
  }else popup.hidden=true;
}
function updateImpact(){
  const d=selected>=0?DATA[selected]:DATA[0];if(!d)return;
  const nToday=+d.npvToday,nExec=+d.npvExec,raw=+d.npvDelta,delta=Number.isFinite(raw)?raw:(Number.isFinite(nToday)&&Number.isFinite(nExec)?nToday-nExec:NaN),el=$("impactDelta");
  if(Number.isFinite(delta)){const gain=delta>0,loss=delta<0;el.className="impact-delta "+(gain?"gain":loss?"loss":"neutral");el.textContent=`${gain?"+":loss?"−":""}${money(Math.abs(delta))} VALUE ${gain?"GAINED":loss?"LOST":"CHANGE"} BY EXECUTING IN WINDOW`}else{el.className="impact-delta neutral";el.textContent="FINANCIAL IMPACT AVAILABLE WHEN NPV FIELDS ARE POPULATED"}
  $("impactNpv").textContent=`NPV TODAY ${money(nToday)}   |   NPV IN EXECUTION WINDOW ${money(nExec)}`;
}
function choose(i){selected=+i;select.value=String(selected);render();updateImpact()}
$("login").onclick=signIn;$("centerLogin").onclick=signIn;$("logout").onclick=()=>{idm?.destroyCredentials();location.reload()};select.onchange=()=>choose(select.value);$("anno").onchange=render;$("process").onchange=render;$("sched").onchange=e=>$("schedule").style.display=e.target.checked?"grid":"none";$("clear").onclick=()=>choose(-1);window.onresize=render;
window.addEventListener("message",e=>{if(!DATA.length||e?.data?.type!=="lease-leverage-selection")return;const i=DATA.findIndex(d=>String(d.iteration||"").trim()===String(e.data.iteration||"").trim());if(i>=0)choose(i)});
setup().catch(e=>{console.error(e);state("Initialization failed","err");msg.innerHTML=`<span style="color:#ff9ca7">${escapeHtml(e.message||e)}</span>`});
