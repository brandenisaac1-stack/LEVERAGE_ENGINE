import { shapedSeries, curveValueAt } from "./curves.js";
import { drawProcess } from "./process.js?v=20260925-tim-restructure-v2";
import { showPopup } from "./annotations.js";
import { drawRestructure } from "./restructure.js?v=20260925-tim-restructure-v2";
const qs=new URLSearchParams(location.search);const CFG={clientId:qs.get('clientId')||'',service:qs.get('service')||'',portal:qs.get('portal')||'https://www.arcgis.com',startRow:+(qs.get('windowStartRow')||13),endRow:+(qs.get('windowEndRow')||17),selected:qs.get('selected')||qs.get('iteration')||''};const $=id=>document.getElementById(id);const wrap=$('wrap'),svg=$('chart'),popup=$('popup'),select=$('iteration'),status=$('status'),center=$('center'),msg=$('msg');let DATA=[],selected=-1,idm,FeatureLayer,fields={};
let leverageScenario={tenant:0,landlord:0};
const SCENARIO_PANEL_ID='leverageScenarioPanel';

function scenarioEconomics(baseDelta){
  if(!Number.isFinite(+baseDelta))return NaN;
  const t=Math.max(-1,Math.min(1,leverageScenario.tenant/100));
  const l=Math.max(-1,Math.min(1,leverageScenario.landlord/100));
  const relative=t-l;
  return (+baseDelta)*Math.max(.20,1+(relative*.55));
}

function ensureLeverageScenarioPanel(){
  let panel=document.getElementById(SCENARIO_PANEL_ID);
  if(panel)return panel;

  panel=document.createElement('div');
  panel.id=SCENARIO_PANEL_ID;
  Object.assign(panel.style,{
    position:'absolute',left:'62px',right:'auto',top:'8px',zIndex:'30',
    width:'225px',padding:'6px 8px',
    background:'rgba(7,19,33,.97)',border:'1px solid #31506b',
    borderRadius:'7px',boxShadow:'0 8px 24px rgba(0,0,0,.24)',
    fontFamily:'"Courier New",monospace',color:'#c7d7e4'
  });

  const title=document.createElement('div');
  title.textContent='LEVERAGE SCENARIO';
  Object.assign(title.style,{fontSize:'11px',fontWeight:'700',color:'#8fdde3',marginBottom:'8px'});
  panel.appendChild(title);

  const makeSlider=(key,label,color)=>{
    const wrapRow=document.createElement('div');
    wrapRow.style.marginBottom='8px';
    const head=document.createElement('div');
    Object.assign(head.style,{display:'flex',justifyContent:'space-between',fontSize:'9px',marginBottom:'3px'});
    const lab=document.createElement('span');lab.textContent=label;lab.style.color=color;
    const val=document.createElement('span');val.id=`scenario_${key}_value`;val.textContent='0';
    head.append(lab,val);

    const input=document.createElement('input');
    input.type='range';input.min='-100';input.max='100';input.step='1';input.value='0';
    input.id=`scenario_${key}`;
    Object.assign(input.style,{width:'100%',accentColor:color,cursor:'pointer'});
    input.addEventListener('input',()=>{
      leverageScenario[key]=+input.value;
      val.textContent=(leverageScenario[key]>0?'+':'')+leverageScenario[key];
      render();
      updateImpact();
    });
    wrapRow.append(head,input);
    panel.appendChild(wrapRow);
  };

  makeSlider('tenant','TENANT LEVERAGE','#69c9c6');
  makeSlider('landlord','LANDLORD LEVERAGE','#f21e32');

  const reset=document.createElement('button');
  reset.textContent='RESET TO BASELINE';
  Object.assign(reset.style,{width:'100%',marginTop:'2px',fontSize:'9px'});
  reset.onclick=()=>{
    leverageScenario={tenant:0,landlord:0};
    for(const key of ['tenant','landlord']){
      const input=document.getElementById(`scenario_${key}`);
      const val=document.getElementById(`scenario_${key}_value`);
      if(input)input.value='0';
      if(val)val.textContent='0';
    }
    render();updateImpact();
  };
  panel.appendChild(reset);

  const note=document.createElement('div');
  note.textContent='0 = MODEL BASELINE';
  Object.assign(note.style,{fontSize:'8px',color:'#7890a2',textAlign:'center',marginTop:'5px'});
  panel.appendChild(note);

  wrap.appendChild(panel);
  return panel;
}

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const fmt=d=>`${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;const fmtUTC=d=>`${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCFullYear()).slice(-2)}`;const money=v=>Number.isFinite(+v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(+v):'—';const months=(a,b)=>Math.max(0,Math.round((b-a)/2629800000));const ns=(n,a={})=>{const e=document.createElementNS('http://www.w3.org/2000/svg',n);Object.entries(a).forEach(([k,v])=>e.setAttribute(k,v));return e};const txt=(x,y,s,cl,an='start')=>{const t=ns('text',{x,y,class:cl,'text-anchor':an});t.textContent=s;svg.appendChild(t);return t};function state(s,c=''){status.textContent=s;status.className='status '+c}
function pick(fs,cands,req=false){const m=new Map(fs.map(f=>[f.name.toLowerCase(),f.name]));for(const c of cands){if(m.has(c.toLowerCase()))return m.get(c.toLowerCase())}if(req)throw new Error('Required field missing: '+cands.join(' / '));return null}function val(a,k){return fields[k]?a[fields[k]]:null}
function parseIteration(s){const m=String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;const yr=y=>+y<100?2000+(+y):+y;return{start:new Date(yr(m[3]),+m[1]-1,+m[2]),end:new Date(yr(m[6]),+m[4]-1,+m[5])}}
function windowBounds(){
  // EXACT SAME-ROW RULE:
  // START uses Chart_dates from the row containing START.
  // END uses Chart_dates from the row containing END.
  // No next-row lookup, no iteration end-date interpretation, no offset.
  const marker=v=>String(v??'').trim().toUpperCase();
  const startRows=DATA.filter(d=>marker(d.executionWindow)==='START');
  const endRows=DATA.filter(d=>marker(d.executionWindow)==='END');

  if(startRows.length!==1 || endRows.length!==1){
    throw new Error(`EXECUTION_WINDOW requires exactly one START and one END; found START=${startRows.length}, END=${endRows.length}.`);
  }

  const start=new Date(+startRows[0].date);
  const end=new Date(+endRows[0].date);

  if(!Number.isFinite(+start) || !Number.isFinite(+end)){
    throw new Error('EXECUTION_WINDOW START/END rows must contain valid Chart_dates.');
  }
  if(+end<=+start){
    throw new Error(`EXECUTION_WINDOW END (${fmt(end)}) must be after START (${fmt(start)}).`);
  }

  return {start,end};
}
function activeDate(){const d=new Date();d.setHours(0,0,0,0);return d}
function exactArcGISDate(v){if(v==null||v==='')return null;const d=new Date(v);if(!Number.isFinite(+d))return null;if(typeof v==='number'||/^\d+$/.test(String(v).trim()))return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());return new Date(d.getFullYear(),d.getMonth(),d.getDate())}
function leaseExpiration(){const dates=DATA.map(d=>d.leaseExpiration).filter(d=>d instanceof Date&&Number.isFinite(+d));if(dates.length!==1&&dates.length>1){const uniq=[...new Set(dates.map(d=>+d))];if(uniq.length!==1)throw new Error('LEASE_EXPIRATION_DATE contains conflicting values.');}if(!dates.length)throw new Error('LEASE_EXPIRATION_DATE is required.');return new Date(+dates[0])}
async function setup(){if(!CFG.clientId||!CFG.service){state('Missing configuration','err');msg.innerHTML='Missing clientId or service URL.';return}const OAuthInfo=await $arcgis.import('@arcgis/core/identity/OAuthInfo.js');idm=await $arcgis.import('@arcgis/core/identity/IdentityManager.js');FeatureLayer=await $arcgis.import('@arcgis/core/layers/FeatureLayer.js');const info=new OAuthInfo({appId:CFG.clientId,portalUrl:CFG.portal,popup:true,popupCallbackUrl:'oauth-callback.html',flowType:'auto'});idm.registerOAuthInfos([info]);try{await idm.checkSignInStatus(CFG.portal+'/sharing/rest');await load()}catch(e){$('login').hidden=false;$('logout').hidden=true;select.disabled=true;$('clear').disabled=true;center.hidden=false;popup.hidden=true;state('Sign in required','warn')}}
async function signIn(){try{state('Opening ArcGIS sign-in…','warn');$('login').disabled=true;$('centerLogin').disabled=true;await idm.getCredential(CFG.portal+'/sharing/rest');await load()}catch(e){console.error(e);$('login').hidden=false;$('logout').hidden=true;state('Authentication failed','err');msg.innerHTML='<span style="color:#ff9ca7">Authentication did not complete.</span><br>'+esc(e.message||e);center.hidden=false}finally{$('login').disabled=false;$('centerLogin').disabled=false}}
async function load(){center.hidden=false;msg.textContent='Authenticated. Loading protected chart data…';state('Loading protected layer…','warn');const layer=new FeatureLayer({url:CFG.service});await layer.load();fields={date:pick(layer.fields,['Chart_dates','chart_dates','chart_date'],true),tenant:pick(layer.fields,['Decision_Curve_0to100','decision_curve_0to100','decision_0to100'],true),landlord:pick(layer.fields,['plot_LL','plot_ll'],true),iteration:pick(layer.fields,['comb_iter','iteration']),phase:pick(layer.fields,['Phases','phase']),processStage:pick(layer.fields,['PROCESS_STAGE','process_stage','Process_Stage','ProcessStage']),processStart:pick(layer.fields,['PROCESS_START_DATE','process_start_date','Process_Start_Date','ProcessStartDate']),executionWindow:pick(layer.fields,['EXECUTION_WINDOW','execution_window','Execution_Window','ExecutionWindow'],true),leaseExpiration:pick(layer.fields,['LEASE_EXPIRATION_DATE','lease_expiration_date','Lease_Expiration_Date','LeaseExpirationDate'],true),restructureProgress:pick(layer.fields,['RESTRUCTURE_PROGRESS','restructure_progress','Restructure_Progress','RestructureProgress']),restructureEffectiveDate:pick(layer.fields,['RESTRUCTURE_EFFECTIVE_DATE','restructure_effective_date','Restructure_Effective_Date','RestructureEffectiveDate']),restructureTenantCurve:pick(layer.fields,['RESTRUCTURE_TENANT_CURVE','restructure_tenant_curve','Restructure_Tenant_Curve','RestructureTenantCurve']),restructureOptionValue:pick(layer.fields,['RESTRUCTURE_OPTION_VALUE','restructure_option_value','Restructure_Option_Value','RestructureOptionValue']),restructureDateBreakout:pick(layer.fields,['restrucutre_date_breakout','RESTRUCUTRE_DATE_BREAKOUT','restructure_date_breakout','RESTRUCTURE_DATE_BREAKOUT']),restructureActionPhase:pick(layer.fields,['restrucutre_action_phase','RESTRUCUTRE_ACTION_PHASE','restructure_action_phase','RESTRUCTURE_ACTION_PHASE']),restructurePhaseEndDate:pick(layer.fields,['RESTRUCTURE_PHASE_END_DATE','restructure_phase_end_date','Restructure_Phase_End_Date','RestructurePhaseEndDate']),action:pick(layer.fields,['ACTION_POINT','action_point']),rent:pick(layer.fields,['ACTION_EFFECTIVE_RENT','action_effective_rent']),alev:pick(layer.fields,['ACTION_LEVERAGE','action_leverage']),wait:pick(layer.fields,['NET_WAIT_VALUE_DAY','net_wait_value_day']),chrono:pick(layer.fields,['CHRONOS_ACTION','chronos_action']),read:pick(layer.fields,['chronos_read','economic_read']),npvToday:pick(layer.fields,['ACTION_NPV_CURRENT','action_npv_current']),npvExec:pick(layer.fields,['ACTION_NPV_EXEC_ADJUSTED','action_npv_exec_adjusted']),npvDelta:pick(layer.fields,['ACTION_NPV_TIMING_DELTA','action_npv_timing_delta'])};const out=[...new Set(Object.values(fields).filter(Boolean))];const q=layer.createQuery();q.where=`${fields.tenant} IS NOT NULL AND ${fields.date} IS NOT NULL`;q.outFields=out;q.returnGeometry=false;q.orderByFields=[`${fields.date} ASC`];const r=await layer.queryFeatures(q);DATA=r.features.map(f=>{const a=f.attributes;let t=+val(a,'tenant');if(t<=1.5)t*=100;return{date:new Date(val(a,'date')),tenant:t,landlord:+val(a,'landlord'),iteration:val(a,'iteration'),phase:val(a,'phase'),processStage:val(a,'processStage'),processStart:val(a,'processStart')!=null?new Date(val(a,'processStart')):null,executionWindow:val(a,'executionWindow'),leaseExpiration:val(a,'leaseExpiration')!=null?new Date(val(a,'leaseExpiration')):null,restructureProgress:val(a,'restructureProgress'),restructureEffectiveDate:val(a,'restructureEffectiveDate')!=null?new Date(val(a,'restructureEffectiveDate')):null,restructureTenantCurve:val(a,'restructureTenantCurve')!=null?+val(a,'restructureTenantCurve'):null,restructureOptionValue:val(a,'restructureOptionValue')!=null?+val(a,'restructureOptionValue'):null,restructureDateBreakout:val(a,'restructureDateBreakout')!=null?new Date(val(a,'restructureDateBreakout')):null,restructureActionPhase:val(a,'restructureActionPhase'),restructurePhaseEndDate:val(a,'restructurePhaseEndDate')!=null?new Date(val(a,'restructurePhaseEndDate')):null,action:val(a,'action'),rent:val(a,'rent'),alev:val(a,'alev'),wait:val(a,'wait'),chrono:val(a,'chrono'),read:val(a,'read'),npvToday:val(a,'npvToday'),npvExec:val(a,'npvExec'),npvDelta:val(a,'npvDelta')}}).filter(d=>Number.isFinite(+d.date)&&Number.isFinite(d.tenant)&&Number.isFinite(d.landlord)).sort((a,b)=>a.date-b.date);if(DATA.length<CFG.endRow)throw new Error(`Only ${DATA.length} chart rows returned; windowEndRow is ${CFG.endRow}.`);select.innerHTML='<option value="-1">— none —</option>'+DATA.map((d,i)=>`<option value="${i}">${esc(d.iteration||fmt(d.date))}</option>`).join('');$('login').hidden=true;$('logout').hidden=false;select.disabled=false;$('clear').disabled=false;center.hidden=true;state(`Live · ${DATA.length} chart rows`,'ok');if(CFG.selected){selected=DATA.findIndex(d=>String(d.iteration||'').trim()===CFG.selected.trim());select.value=String(selected)}render();updateImpact()}
function curvePath(pts){if(pts.length<2)return'';let d=`M ${pts[0][0]} ${pts[0][1]}`;for(let i=0;i<pts.length-1;i++){let p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];d+=` C ${p1[0]+(p2[0]-p0[0])/6} ${p1[1]+(p2[1]-p0[1])/6}, ${p2[0]-(p3[0]-p1[0])/6} ${p2[1]-(p3[1]-p1[1])/6}, ${p2[0]} ${p2[1]}`}return d}
function render(){
  if(!DATA.length){svg.innerHTML='';return}
  const win=windowBounds(),restructureMode=!!$('restructure')?.checked;let P=shapedSeries(DATA,win);const W=wrap.clientWidth,H=wrap.clientHeight,m={l:58,r:20,t:68,b:32};
  ensureLeverageScenarioPanel();
  const baselineP=P.map(p=>({...p}));
  const tShock=Math.max(-1,Math.min(1,leverageScenario.tenant/100));
  const lShock=Math.max(-1,Math.min(1,leverageScenario.landlord/100));

  // Coupled bargaining system:
  // own-side strength magnifies its favorable deviation while counterparty
  // strength compresses it toward a neutral start/end chord.
  const tenantNet=tShock-(0.55*lShock);
  const landlordNet=lShock-(0.55*tShock);

  const t0=baselineP[0].plotTenant,t1=baselineP[baselineP.length-1].plotTenant;
  const l0=baselineP[0].plotLandlord,l1=baselineP[baselineP.length-1].plotLandlord;

  const scenarioP=baselineP.map((p,i)=>{
    const u=baselineP.length>1?i/(baselineP.length-1):0;
    const envelope=Math.sin(Math.PI*u);
    const tn=t0+(t1-t0)*u;
    const ln=l0+(l1-l0)*u;
    const ts=p.plotTenant-tn;
    const ls=p.plotLandlord-ln;

    // Positive landlord strength raises/flattens a landlord-disadvantage trough
    // by compressing negative landlord signal toward neutral; positive tenant
    // strength does the analogous thing for tenant bargaining power.
    const tScale=tenantNet>=0
      ? 1+(0.80*tenantNet*envelope)
      : Math.max(.08,1+(0.92*tenantNet*envelope));
    const lScale=landlordNet>=0
      ? (ls<0?Math.max(.08,1-(0.92*landlordNet*envelope)):1+(0.55*landlordNet*envelope))
      : Math.max(.08,1+(0.80*landlordNet*envelope));

    return {...p,
      plotTenant:Math.max(0,Math.min(100,tn+ts*tScale)),
      plotLandlord:Math.max(0,Math.min(100,ln+ls*lScale))
    };
  });
  P.splice(0,P.length,...scenarioP);
  const pw=W-m.l-m.r,ph=H-m.t-m.b,x0=+P[0].date,x1=+P.at(-1).date;
  const min=Math.floor(Math.min(...P.flatMap(d=>[d.plotTenant,d.plotLandlord]))/5)*5-3;
  const max=Math.ceil(Math.max(...P.flatMap(d=>[d.plotTenant,d.plotLandlord]))/5)*5+3;
  const x=d=>m.l+((+d-x0)/(x1-x0))*pw,y=v=>m.t+(max-v)/(max-min)*ph,base=y(min);
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.innerHTML='';

  for(let v=Math.ceil(min/5)*5;v<=Math.floor(max/5)*5;v+=5){
    svg.appendChild(ns('line',{x1:m.l,y1:y(v),x2:W-m.r,y2:y(v),class:'grid'}));txt(m.l-8,y(v)+3,v,'axis','end')
  }
  for(let yr=P[0].date.getFullYear();yr<=P.at(-1).date.getFullYear();yr++){
    const d=new Date(`${yr}-01-01T00:00:00`);if(+d>=x0&&+d<=x1){svg.appendChild(ns('line',{x1:x(d),y1:m.t,x2:x(d),y2:base,class:'grid'}));txt(x(d),H-10,'Jan '+yr,'axis','middle')}
  }

  const wx1=x(win.start),wx2=x(win.end);
  if(+win.end>=x0&&+win.start<=x1){
    const sx1=Math.max(m.l,wx1),sx2=Math.min(W-m.r,wx2);
    if(sx2>sx1)svg.appendChild(ns('rect',{x:sx1,y:m.t,width:sx2-sx1,height:ph,class:'windowShade'}));
  }
  const tp=P.map(d=>[x(d.date),y(d.plotTenant)]),lp=P.map(d=>[x(d.date),y(d.plotLandlord)]),tl=curvePath(tp),ll=curvePath(lp);
  svg.appendChild(ns('path',{d:ll+` L ${lp.at(-1)[0]} ${base} L ${lp[0][0]} ${base} Z`,fill:'#b50019','fill-opacity':'.62'}));
  svg.appendChild(ns('path',{d:tl+` L ${tp.at(-1)[0]} ${base} L ${tp[0][0]} ${base} Z`,fill:'#4b8584','fill-opacity':'.54'}));
  svg.appendChild(ns('path',{d:ll,fill:'none',stroke:'#f21e32','stroke-width':'2.35'}));
  svg.appendChild(ns('path',{d:tl,fill:'none',stroke:'#69c9c6','stroke-width':'2.35'}));

  drawRestructure({enabled:restructureMode,data:DATA,plottedSeries:P,scenarioEconomics,x,y,m,W,H,base,svg,ns,txt,selected});

  $('schedule').style.display=$('sched').checked?'grid':'none'; if($('process').checked)drawProcess({data:DATA,x,m,W,H,x0,x1,win,leaseExpiration:leaseExpiration(),svg,ns,txt,scheduleEl:$('schedule'),restructureMode})

  // TODAY remains anchored to the actual current date, but its narrative lives
  // in a dedicated lower-chart card so it can never collide with the execution-window header.
  const now=activeDate();
  if(+now>=x0&&+now<=x1){
    const tx=x(now),exp=leaseExpiration();
    const insideWindow=+now>=+win.start&&+now<=+win.end;
    const afterWindow=+now>+win.end;
    svg.appendChild(ns('line',{x1:tx,y1:m.t-5,x2:tx,y2:base,class:'guideDash'}));

    const cardW=Math.min(310,Math.max(235,pw*.18)),cardH=58;
    const cardX=Math.max(m.l+8,Math.min(W-m.r-cardW-8,tx-cardW/2));
    const cardY=base-cardH-10;
    svg.appendChild(ns('rect',{
      x:cardX,y:cardY,width:cardW,height:cardH,rx:6,
      fill:'#071321','fill-opacity':'.94',
      stroke:'#16e6e9','stroke-width':'1.2','stroke-opacity':'.72'
    }));
    txt(cardX+10,cardY+16,`TODAY · ${fmt(now)}`,'t1');
    txt(cardX+10,cardY+32,`${months(now,exp)} months to lease expiration`,'t2');
    const timing=insideWindow
      ? 'INSIDE OPTIMAL EXECUTION WINDOW'
      : afterWindow
        ? `EXECUTION WINDOW PASSED · ${months(win.end,now)} months ago`
        : `${months(now,win.start)} months to optimal execution window`;
    txt(cardX+10,cardY+47,timing,'t2');
  }

  // Execution window remains unchanged in both normal and restructure modes.
  [win.start,win.end].forEach(d=>{const xx=x(d);svg.appendChild(ns('line',{x1:xx,y1:m.t-8,x2:xx,y2:base,class:'guideDash'}))});
  txt((wx1+wx2)/2,m.t+10,'OPTIMAL EXECUTION WINDOW','t1','middle');
  const ay=m.t+27;
  svg.appendChild(ns('line',{x1:wx1+12,y1:ay,x2:wx2-12,y2:ay,class:'windowArrow'}));
  svg.appendChild(ns('path',{d:`M ${wx1+12} ${ay} l 8 -5 M ${wx1+12} ${ay} l 8 5 M ${wx2-12} ${ay} l -8 -5 M ${wx2-12} ${ay} l -8 5`,class:'windowArrow'}));
  txt((wx1+wx2)/2,m.t+45,`${fmt(win.start)} – ${fmt(win.end)}`,'t1','middle');

  // Lease expiration is the permanent transaction north star.
  const exp=leaseExpiration();
  if(+exp>=x0&&+exp<=x1){
    const ex=x(exp);
    svg.appendChild(ns('line',{x1:ex,y1:m.t-8,x2:ex,y2:base,class:'leaseExpiryGuide',stroke:'#f21e32','stroke-width':'3','stroke-dasharray':'8 4'}));
    const anchor=ex>W-m.r-150?'end':'start';
    const lx=anchor==='end'?ex-8:ex+8;
    const leaseTitle=txt(lx,m.t+64,'LEASE EXPIRATION','leaseExpiryText',anchor);
    leaseTitle.setAttribute('fill','#f21e32');
    leaseTitle.setAttribute('font-size','20');
    leaseTitle.setAttribute('font-weight','700');
    const leaseDate=txt(lx,m.t+88,fmtUTC(exp),'leaseExpiryDate',anchor);
    leaseDate.setAttribute('fill','#f21e32');
    leaseDate.setAttribute('font-size','20');
    leaseDate.setAttribute('font-weight','700');
  }

  // Clickable live-data anchors. The full curve never disappears.
  DATA.forEach((d,i)=>{if(+d.date<x0||+d.date>x1)return;const v=curveValueAt(d.date,DATA,win),h=ns('circle',{cx:x(d.date),cy:y(v.tenant),r:10,fill:'transparent',style:'cursor:pointer'});h.addEventListener('click',()=>choose(i));svg.appendChild(h)});

  if(selected>=0&&DATA[selected]&&+DATA[selected].date>=x0&&+DATA[selected].date<=x1){
    const d=DATA[selected],v=curveValueAt(d.date,DATA,win),sx=x(d.date),sy=y(v.tenant),ly=y(v.landlord);
    svg.appendChild(ns('line',{x1:sx,y1:m.t+52,x2:sx,y2:base,class:'sel'}));
    svg.appendChild(ns('circle',{cx:sx,cy:sy,r:5,fill:'#16e6e9',class:'dot'}));
    svg.appendChild(ns('circle',{cx:sx,cy:ly,r:5,fill:'#f21e32',class:'dot'}));
    showPopup({d,sx,sy:Math.min(sy,ly),W,H,m,popup,annotationsEnabled:$('anno').checked,esc,money});
  }else popup.hidden=true;
}

function updateImpact(){const d=selected>=0?DATA[selected]:DATA[0];if(!d)return;const today=+d.npvToday,raw=+d.npvDelta;let exec=+d.npvExec;let delta=Number.isFinite(raw)?raw:(Number.isFinite(today)&&Number.isFinite(exec)?today-exec:NaN);const baselineDelta=delta;
  delta=scenarioEconomics(baselineDelta);
  if(Number.isFinite(today)&&Number.isFinite(delta))exec=today-delta;const el=$('impactDelta');if(Number.isFinite(delta)){const gain=delta>0,loss=delta<0;el.className='impact-delta '+(gain?'gain':loss?'loss':'neutral');el.textContent=`${gain?'+':loss?'−':''}${money(Math.abs(delta))} VALUE ${gain?'GAINED':loss?'LOST':'CHANGE'} BY EXECUTING IN WINDOW`}else{el.className='impact-delta neutral';el.textContent='FINANCIAL IMPACT AVAILABLE WHEN NPV FIELDS ARE POPULATED'}$('impactNpv').textContent=`NPV TODAY ${money(today)}   |   NPV IN EXECUTION WINDOW ${money(exec)}`}
function choose(i){selected=+i;select.value=String(selected);render();updateImpact()}
$('login').onclick=signIn;$('centerLogin').onclick=signIn;$('logout').onclick=()=>{idm?.destroyCredentials();location.reload()};select.onchange=()=>choose(select.value);$('anno').onchange=render;$('process').onchange=render;$('sched').onchange=e=>$('schedule').style.display=e.target.checked?'grid':'none';$('restructure').onchange=render;$('clear').onclick=()=>choose(-1);window.onresize=render;window.addEventListener('message',e=>{if(!DATA.length||e?.data?.type!=='lease-leverage-selection')return;let i=DATA.findIndex(d=>String(d.iteration||'').trim()===String(e.data.iteration||'').trim());if(i>=0)choose(i)});setup().catch(e=>{console.error(e);state('Initialization failed','err');msg.innerHTML='<span style="color:#ff9ca7">'+esc(e.message||e)+'</span>'});
