import { shapedSeries } from "./curves.js";
import { drawProcess } from "./process.js?v=20261006-ldi-final";
import { showPopup } from "./annotations.js";
import { drawRestructure } from "./restructure.js?v=20261009-cleanup-v2";
import { renderIntelligence } from "./intelligence.js?v=20261006-ldi-final";
import { ensureConditionsPanel, applyConditionScenario } from "./conditions.js?v=20261007-conditions-v1";

const qs=new URLSearchParams(location.search);
const CFG={
clientId:qs.get('clientId')||'',
service:qs.get('service')||'',
portal:qs.get('portal')||'https://www.arcgis.com',
startRow:+(qs.get('windowStartRow')||13),
endRow:+(qs.get('windowEndRow')||17),
selected:qs.get('selected')||qs.get('iteration')||''
};
const $=id=>document.getElementById(id);
const wrap=$('wrap'),svg=$('chart'),popup=$('popup'),select=$('iteration'),status=$('status'),center=$('center'),msg=$('msg');

let DATA=[],selected=-1,idm,FeatureLayer,fields={};
let LAST_CONDITION_SCENARIO=null;

function refreshTodaysRead(){
  const content=document.getElementById('todaysReadContent');
  if(!content)return;

  content.replaceChildren();

  if(!DATA.length){
    content.textContent='Decision narrative unavailable until live data loads.';
    return;
  }

  const d=DATA[0];

  const heading=String(d.chrono??'')
    .replace(/\s*[·|]\s*CORE\s*[·|]\s*POSITION/gi,'')
    .replace(/\s*[·|]\s*CORE\s*[·|]\s*POSITION\s*$/gi,'')
    .trim();

  const title=document.createElement('div');
  title.textContent=heading;
  title.style.color='#5DA5EE';
  title.style.fontWeight='700';

  content.appendChild(title);
}

function toggleTodaysRead(open){
  const panel=$('todaysReadPanel');
  const button=$('todaysReadButton');

  if(!panel||!button)return;

  if(open)refreshTodaysRead();

  panel.hidden=!open;
  button.setAttribute('aria-expanded',String(open));
}

function updateScenarioTitle(){
  const title=$('scenarioTitle');
  if(!title)return;

  title.textContent=$('restructure')?.checked
    ? 'EARLY RESTRUCTURE SCENARIO'
    : 'RELOCATION SCENARIO';
}

function scenarioEconomics(baseDelta){
return Number.isFinite(+baseDelta)?+baseDelta:NaN;
}

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=d=>`${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;
const fmtUTC=d=>`${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCFullYear()).slice(-2)}`;
const money=v=>Number.isFinite(+v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(+v):'—';
const months=(a,b)=>Math.max(0,Math.round((b-a)/2629800000));

const ns=(n,a={})=>{
const e=document.createElementNS('http://www.w3.org/2000/svg',n);
Object.entries(a).forEach(([k,v])=>e.setAttribute(k,v));
return e;
};

const txt=(x,y,s,cl,an='start')=>{
const t=ns('text',{x,y,class:cl,'text-anchor':an});
t.textContent=s;
svg.appendChild(t);
return t;
};

function state(s,c=''){
status.textContent=s;
status.className='status '+c;
}

function pick(fs,cands,req=false){
const m=new Map(fs.map(f=>[f.name.toLowerCase(),f.name]));
for(const c of cands){
if(m.has(c.toLowerCase()))return m.get(c.toLowerCase());
}
if(req)throw new Error('Required field missing: '+cands.join(' / '));
return null;
}

function val(a,k){
return fields[k]?a[fields[k]]:null;
}

function parseIteration(s){
const m=String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
if(!m)return null;
const yr=y=>+y<100?2000+(+y):+y;
return{
start:new Date(yr(m[3]),+m[1]-1,+m[2]),
end:new Date(yr(m[6]),+m[4]-1,+m[5])
};
}

function windowBounds(){
const marker=v=>String(v??'').trim().toUpperCase();
const startRows=DATA.filter(d=>marker(d.executionWindow)==='START');
const endRows=DATA.filter(d=>marker(d.executionWindow)==='END');

if(startRows.length!==1||endRows.length!==1){
throw new Error(`EXECUTION_WINDOW requires exactly one START and one END; found START=${startRows.length}, END=${endRows.length}.`);
}

const start=new Date(+startRows[0].date);
const end=new Date(+endRows[0].date);

if(!Number.isFinite(+start)||!Number.isFinite(+end)){
throw new Error('EXECUTION_WINDOW START/END rows must contain valid Chart_dates.');
}
if(+end<=+start){
throw new Error(`EXECUTION_WINDOW END (${fmt(end)}) must be after START (${fmt(start)}).`);
}
return{start,end};
}

function activeDate(){
const d=new Date();
d.setHours(0,0,0,0);
return d;
}

function exactArcGISDate(v){
if(v==null||v==='')return null;
const d=new Date(v);
if(!Number.isFinite(+d))return null;
if(typeof v==='number'||/^\d+$/.test(String(v).trim())){
return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
}
return new Date(d.getFullYear(),d.getMonth(),d.getDate());
}

function leaseExpiration(){
const dates=DATA.map(d=>d.leaseExpiration).filter(d=>d instanceof Date&&Number.isFinite(+d));
if(dates.length>1){
const uniq=[...new Set(dates.map(d=>+d))];
if(uniq.length!==1)throw new Error('LEASE_EXPIRATION_DATE contains conflicting values.');
}
if(!dates.length)throw new Error('LEASE_EXPIRATION_DATE is required.');
return new Date(+dates[0]);
}

async function setup(){
if(!CFG.clientId||!CFG.service){
state('Missing configuration','err');
msg.innerHTML='Missing clientId or service URL.';
return;
}

const OAuthInfo=await $arcgis.import('@arcgis/core/identity/OAuthInfo.js');
idm=await $arcgis.import('@arcgis/core/identity/IdentityManager.js');
FeatureLayer=await $arcgis.import('@arcgis/core/layers/FeatureLayer.js');

const info=new OAuthInfo({
appId:CFG.clientId,
portalUrl:CFG.portal,
popup:true,
popupCallbackUrl:'oauth-callback.html',
flowType:'auto'
});

idm.registerOAuthInfos([info]);

try{
await idm.checkSignInStatus(CFG.portal+'/sharing/rest');
await load();
}catch(e){
$('login').hidden=false;
$('logout').hidden=true;
select.disabled=true;
$('clear').disabled=true;
center.hidden=false;
popup.hidden=true;
state('Sign in required','warn');
}
}

async function signIn(){
try{
state('Opening ArcGIS sign-in…','warn');
$('login').disabled=true;
$('centerLogin').disabled=true;
await idm.getCredential(CFG.portal+'/sharing/rest');
await load();
}catch(e){
console.error(e);
$('login').hidden=false;
$('logout').hidden=true;
state('Authentication failed','err');
msg.innerHTML='<span style="color:#ff9ca7">'+esc(e.message||e)+'</span><br>Authentication did not complete.';
center.hidden=false;
}finally{
$('login').disabled=false;
$('centerLogin').disabled=false;
}
}

async function load(){
center.hidden=false;
msg.textContent='Authenticated. Loading protected chart data…';
state('Loading protected layer…','warn');

const layer=new FeatureLayer({url:CFG.service});
await layer.load();

fields={
date:pick(layer.fields,['Chart_dates','chart_dates','chart_date'],true),
tenant:pick(layer.fields,['Decision_Curve_0to100','decision_curve_0to100','decision_0to100'],true),
landlord:pick(layer.fields,['plot_LL','plot_ll'],true),
iteration:pick(layer.fields,['comb_iter','iteration']),
phase:pick(layer.fields,['Phases','phase']),
processStage:pick(layer.fields,['PROCESS_STAGE','process_stage','Process_Stage','ProcessStage']),
processStart:pick(layer.fields,['PROCESS_START_DATE','process_start_date','Process_Start_Date','ProcessStartDate']),
executionWindow:pick(layer.fields,['EXECUTION_WINDOW','execution_window','Execution_Window','ExecutionWindow'],true),
leaseExpiration:pick(layer.fields,['LEASE_EXPIRATION_DATE','lease_expiration_date','Lease_Expiration_Date','LeaseExpirationDate'],true),

restructureProgress:pick(layer.fields,['RESTRUCTURE_PROGRESS','restructure_progress','Restructure_Progress','RestructureProgress']),
restructureEffectiveDate:pick(layer.fields,['RESTRUCTURE_EFFECTIVE_DATE','restructure_effective_date','Restructure_Effective_Date','RestructureEffectiveDate']),
restructureTenantCurve:pick(layer.fields,['RESTRUCTURE_TENANT_CURVE','restructure_tenant_curve','Restructure_Tenant_Curve','RestructureTenantCurve']),
restructureOptionValue:pick(layer.fields,['RESTRUCTURE_OPTION_VALUE','restructure_option_value','Restructure_Option_Value','RestructureOptionValue']),
restructureDateBreakout:pick(layer.fields,['restrucutre_date_breakout','RESTRUCUTRE_DATE_BREAKOUT','restructure_date_breakout','RESTRUCTURE_DATE_BREAKOUT']),
restructureActionPhase:pick(layer.fields,['restrucutre_action_phase','RESTRUCUTRE_ACTION_PHASE','restructure_action_phase','RESTRUCTURE_ACTION_PHASE']),
restructurePhaseEndDate:pick(layer.fields,['RESTRUCTURE_PHASE_END_DATE','restructure_phase_end_date','Restructure_Phase_End_Date','RestructurePhaseEndDate']),

action:pick(layer.fields,['ACTION_POINT','action_point']),
rent:pick(layer.fields,['ACTION_EFFECTIVE_RENT','action_effective_rent']),
alev:pick(layer.fields,['ACTION_LEVERAGE','action_leverage']),
wait:pick(layer.fields,['NET_WAIT_VALUE_DAY','net_wait_value_day']),
chrono:pick(layer.fields,['CHRONOS_ACTION','chronos_action']),
read:pick(layer.fields,['chronos_read','economic_read']),
npvToday:pick(layer.fields,['ACTION_NPV_CURRENT','action_npv_current']),
npvExec:pick(layer.fields,['ACTION_NPV_EXEC_ADJUSTED','action_npv_exec_adjusted']),
npvDelta:pick(layer.fields,['ACTION_NPV_TIMING_DELTA','action_npv_timing_delta']),

ldiWorkforcePct:pick(layer.fields,['LDI_Workforce_Pct_Change','ldi_workforce_pct_change'],true),
ldiWorkforceExplanation:pick(layer.fields,['LDI_Workforce_Explanation','ldi_workforce_explanation'],true),
ldiCounterpartyPct:pick(layer.fields,['LDI_Counterparty_Pct_Change','ldi_counterparty_pct_change'],true),
ldiCounterpartyExplanation:pick(layer.fields,['LDI_Counterparty_Explanation','ldi_counterparty_explanation'],true),
ldiEnterprisePct:pick(layer.fields,['LDI_Enterprise_Pct_Change','ldi_enterprise_pct_change'],true),
ldiEnterpriseExplanation:pick(layer.fields,['LDI_Enterprise_Explanation','ldi_enterprise_explanation'],true),
ldiOptionalityPct:pick(layer.fields,['LDI_Optionality_Pct_Change','ldi_optionality_pct_change'],true),
ldiOptionalityExplanation:pick(layer.fields,['LDI_Optionality_Explanation','ldi_optionality_explanation'],true),
ldiCapturePct:pick(layer.fields,['LDI_Capture_Pct_Change','ldi_capture_pct_change'],true),
ldiCaptureState:pick(layer.fields,['LDI_Capture_State','ldi_capture_state'],true),
ldiCaptureExplanation:pick(layer.fields,['LDI_Capture_Explanation','ldi_capture_explanation'],true),
ldiModelAlignment:pick(layer.fields,['LDI_Model_Alignment_0to100','ldi_model_alignment_0to100'],true),

conditionAdjuster:pick(layer.fields,['Condition_adjuster','condition_adjuster','CONDITION_ADJUSTER'],true),
conditionXModeled:pick(layer.fields,['CONDITION_X_MODELED','condition_x_modeled'],true),
conditionXAdjusted:pick(layer.fields,['CONDITION_X_ADJUSTED','condition_x_adjusted']),
conditionXVerified:pick(layer.fields,['CONDITION_X_VERIFIED','condition_x_verified']),
conditionXActive:pick(layer.fields,['CONDITION_X_ACTIVE','condition_x_active'],true),
conditionYModeled:pick(layer.fields,['CONDITION_Y_MODELED','condition_y_modeled'],true),
conditionYAdjusted:pick(layer.fields,['CONDITION_Y_ADJUSTED','condition_y_adjusted']),
conditionYVerified:pick(layer.fields,['CONDITION_Y_VERIFIED','condition_y_verified']),
conditionYActive:pick(layer.fields,['CONDITION_Y_ACTIVE','condition_y_active'],true),
leverageActive0to100:pick(layer.fields,['LEVERAGE_ACTIVE_0TO100','leverage_active_0to100'],true),
conditionState:pick(layer.fields,['CONDITION_STATE','condition_state'],true)
};

const out=[...new Set(Object.values(fields).filter(Boolean))];

const q=layer.createQuery();
q.where=`${fields.tenant} IS NOT NULL AND ${fields.date} IS NOT NULL`;
q.outFields=out;
q.returnGeometry=false;
q.orderByFields=[`${fields.date} ASC`];

const r=await layer.queryFeatures(q);

DATA=r.features.map(f=>{
const a=f.attributes;
let t=+val(a,'tenant');
if(t<=1.5)t*=100;

return{
date:new Date(val(a,'date')),
tenant:t,
landlord:+val(a,'landlord'),
iteration:val(a,'iteration'),
phase:val(a,'phase'),
processStage:val(a,'processStage'),
processStart:val(a,'processStart')!=null?new Date(val(a,'processStart')):null,
executionWindow:val(a,'executionWindow'),
leaseExpiration:val(a,'leaseExpiration')!=null?new Date(val(a,'leaseExpiration')):null,

restructureProgress:val(a,'restructureProgress'),
restructureEffectiveDate:val(a,'restructureEffectiveDate')!=null?new Date(val(a,'restructureEffectiveDate')):null,
restructureTenantCurve:val(a,'restructureTenantCurve')!=null?+val(a,'restructureTenantCurve'):null,
restructureOptionValue:val(a,'restructureOptionValue')!=null?+val(a,'restructureOptionValue'):null,
restructureDateBreakout:val(a,'restructureDateBreakout')!=null?new Date(val(a,'restructureDateBreakout')):null,
restructureActionPhase:val(a,'restructureActionPhase'),
restructurePhaseEndDate:val(a,'restructurePhaseEndDate')!=null?new Date(val(a,'restructurePhaseEndDate')):null,

action:val(a,'action'),
rent:val(a,'rent'),
alev:val(a,'alev'),
wait:val(a,'wait'),
chrono:val(a,'chrono'),
read:val(a,'read'),
npvToday:val(a,'npvToday'),
npvExec:val(a,'npvExec'),
npvDelta:val(a,'npvDelta'),

ldiWorkforcePct:val(a,'ldiWorkforcePct'),
ldiWorkforceExplanation:val(a,'ldiWorkforceExplanation'),
ldiCounterpartyPct:val(a,'ldiCounterpartyPct'),
ldiCounterpartyExplanation:val(a,'ldiCounterpartyExplanation'),
ldiEnterprisePct:val(a,'ldiEnterprisePct'),
ldiEnterpriseExplanation:val(a,'ldiEnterpriseExplanation'),
ldiOptionalityPct:val(a,'ldiOptionalityPct'),
ldiOptionalityExplanation:val(a,'ldiOptionalityExplanation'),
ldiCapturePct:val(a,'ldiCapturePct'),
ldiCaptureState:val(a,'ldiCaptureState'),
ldiCaptureExplanation:val(a,'ldiCaptureExplanation'),
ldiModelAlignment:val(a,'ldiModelAlignment'),

conditionAdjuster:val(a,'conditionAdjuster'),
conditionXModeled:val(a,'conditionXModeled')!=null?+val(a,'conditionXModeled'):null,
conditionXAdjusted:val(a,'conditionXAdjusted')!=null?+val(a,'conditionXAdjusted'):null,
conditionXVerified:val(a,'conditionXVerified')!=null?+val(a,'conditionXVerified'):null,
conditionXActive:val(a,'conditionXActive')!=null?+val(a,'conditionXActive'):null,
conditionYModeled:val(a,'conditionYModeled')!=null?+val(a,'conditionYModeled'):null,
conditionYAdjusted:val(a,'conditionYAdjusted')!=null?+val(a,'conditionYAdjusted'):null,
conditionYVerified:val(a,'conditionYVerified')!=null?+val(a,'conditionYVerified'):null,
conditionYActive:val(a,'conditionYActive')!=null?+val(a,'conditionYActive'):null,
leverageActive0to100:val(a,'leverageActive0to100')!=null?Math.max(0,Math.min(100,+val(a,'leverageActive0to100'))):null,
conditionState:val(a,'conditionState')
};
})
.filter(d=>Number.isFinite(+d.date)&&Number.isFinite(d.tenant)&&Number.isFinite(d.landlord))
.sort((a,b)=>a.date-b.date);

if(DATA.length<CFG.endRow){
throw new Error(`Only ${DATA.length} chart rows returned; windowEndRow is ${CFG.endRow}.`);
}

select.innerHTML='<option value="-1">— none —</option>'+
DATA.map((d,i)=>`<option value="${i}">${esc(d.iteration||fmt(d.date))}</option>`).join('');

$('login').hidden=true;
$('logout').hidden=false;
select.disabled=false;
$('clear').disabled=false;
center.hidden=true;
status.textContent='';
status.className='status';
status.style.display='none';

if(CFG.selected){
selected=DATA.findIndex(d=>String(d.iteration||'').trim()===CFG.selected.trim());
select.value=String(selected);
}

ensureConditionsPanel({
  mount: wrap,
  rerender: render,
  getSummary: () => LAST_CONDITION_SCENARIO
});

render();
updateImpact();
renderLiveIntelligence();

refreshTodaysRead();

const todaysButton=$('todaysReadButton');
if(todaysButton){
  todaysButton.hidden=false;
  todaysButton.style.display='block';
}

}

function renderLiveIntelligence(){
const container=$('intelligence');
if(!container||!DATA.length)return;

const source=DATA.find(d=>
d.ldiWorkforcePct!=null||
d.ldiCounterpartyPct!=null||
d.ldiEnterprisePct!=null||
d.ldiOptionalityPct!=null||
d.ldiCapturePct!=null
)||DATA[0];

renderIntelligence(container,{
ldiWorkforcePct:source.ldiWorkforcePct,
ldiWorkforceExplanation:source.ldiWorkforceExplanation,
ldiCounterpartyPct:source.ldiCounterpartyPct,
ldiCounterpartyExplanation:source.ldiCounterpartyExplanation,
ldiEnterprisePct:source.ldiEnterprisePct,
ldiEnterpriseExplanation:source.ldiEnterpriseExplanation,
ldiOptionalityPct:source.ldiOptionalityPct,
ldiOptionalityExplanation:source.ldiOptionalityExplanation,
ldiCapturePct:source.ldiCapturePct,
ldiCaptureState:source.ldiCaptureState,
ldiCaptureExplanation:source.ldiCaptureExplanation,
ldiModelAlignment:source.ldiModelAlignment
});
}

function plottedValueAt(date,P){
if(!Array.isArray(P)||!P.length)return{tenant:0,landlord:0};
const ms=+date;

if(ms<=+P[0].date)return{tenant:+P[0].plotTenant,landlord:+P[0].plotLandlord};
if(ms>=+P.at(-1).date)return{tenant:+P.at(-1).plotTenant,landlord:+P.at(-1).plotLandlord};

let lo=0,hi=P.length-1;
while(hi-lo>1){
const mid=(lo+hi)>>1;
if(+P[mid].date<=ms)lo=mid;
else hi=mid;
}

const a=P[lo],b=P[hi];
const t=(ms-+a.date)/((+b.date-+a.date)||1);

return{
tenant:+a.plotTenant+(+b.plotTenant-+a.plotTenant)*t,
landlord:+a.plotLandlord+(+b.plotLandlord-+a.plotLandlord)*t
};
}

function curvePath(pts){
if(pts.length<2)return'';

let d=`M ${pts[0][0]} ${pts[0][1]}`;

for(let i=0;i<pts.length-1;i++){
let p0=pts[Math.max(0,i-1)];
let p1=pts[i];
let p2=pts[i+1];
let p3=pts[Math.min(pts.length-1,i+2)];

d+=` C ${p1[0]+(p2[0]-p0[0])/6} ${p1[1]+(p2[1]-p0[1])/6}, ${p2[0]-(p3[0]-p1[0])/6} ${p2[1]-(p3[1]-p1[1])/6}, ${p2[0]} ${p2[1]}`;
}

return d;
}

function render(){
if(!DATA.length){
svg.innerHTML='';
return;
}

const baseWin=windowBounds();
const restructureMode=!!$('restructure')?.checked;

updateScenarioTitle();

/* EXISTING MODEL IS IMMUTABLE */
const baselineP=shapedSeries(DATA,baseWin);

/* CONDITIONS ARE AN OVERLAY ONLY */
const scenario=applyConditionScenario({
baselineP,
data:DATA,
baseWindow:baseWin
});

let P=scenario.series;
const win=scenario.window;
LAST_CONDITION_SCENARIO=scenario;
const conditionsPanel=
  document.getElementById('conditionsPanel');

if(
  conditionsPanel &&
  typeof conditionsPanel.refreshSummary==='function'
){
  conditionsPanel.refreshSummary();
}

const W=wrap.clientWidth;
const H=wrap.clientHeight;

const m={
l:58,
r:20,
t:68,
b:32
};

const pw=W-m.l-m.r;
const ph=H-m.t-m.b;

const x0=+P[0].date;
const x1=+P.at(-1).date;

/* DYNAMIC LEVERAGE SCALE WITH BREATHING ROOM */
const values = P.flatMap(d => [d.plotTenant, d.plotLandlord])
  .filter(Number.isFinite);

const dataMin = Math.min(...values);
const dataMax = Math.max(...values);

const padding = Math.max(5, (dataMax - dataMin) * 0.10);

const min = Math.max(0, Math.floor((dataMin - padding) / 5) * 5);
const max = Math.min(100, Math.ceil((dataMax + padding) / 5) * 5);

const x=d=>m.l+((+d-x0)/(x1-x0))*pw;
const y=v=>m.t+((max-v)/(max-min))*ph;
const base=y(min);

svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
svg.innerHTML='';

for(let v=min;v<=max;v+=5){
svg.appendChild(ns('line',{
x1:m.l,
y1:y(v),
x2:W-m.r,
y2:y(v),
class:'grid'
}));
txt(m.l-8,y(v)+3,v,'axis','end');
}

const leverageLabel=txt(
  14,
  m.t+ph/2,
  'LEVERAGE',
  '',
  'middle'
);

leverageLabel.setAttribute(
  'transform',
  `rotate(-90 14 ${m.t+ph/2})`
);

leverageLabel.style.setProperty('fill','#D7DADE','important');
leverageLabel.style.setProperty('font-size','14px','important');
leverageLabel.style.setProperty('font-weight','700','important');
leverageLabel.style.setProperty('letter-spacing','1.5px','important');
leverageLabel.style.setProperty('opacity','1','important');

const axisStart=new Date(
P[0].date.getFullYear(),
P[0].date.getMonth()<6?0:6,
1
);

if(+axisStart<x0)axisStart.setMonth(axisStart.getMonth()+6);

const axisTicks=[];

for(
let d=new Date(axisStart);
+d<=x1&&axisTicks.length<7;
d=new Date(d.getFullYear(),d.getMonth()+6,1)
){
axisTicks.push(new Date(d));
}

axisTicks.forEach(d=>{
svg.appendChild(ns('line',{
x1:x(d),
y1:m.t,
x2:x(d),
y2:base,
class:'grid'
}));

txt(
x(d),
H-10,
`${d.getMonth()===0?'Jan':'Jul'} ${d.getFullYear()}`,
'axis',
'middle'
);
});

const wx1=x(win.start);
const wx2=x(win.end);

if(+win.end>=x0&&+win.start<=x1){
const sx1=Math.max(m.l,wx1);
const sx2=Math.min(W-m.r,wx2);

if(sx2>sx1){
svg.appendChild(ns('rect',{
x:sx1,
y:m.t,
width:sx2-sx1,
height:ph,
class:'windowShade'
}));
}
}

const tp=P.map(d=>[x(d.date),y(d.plotTenant)]);
const lp=P.map(d=>[x(d.date),y(d.plotLandlord)]);

const tl=curvePath(tp);
const ll=curvePath(lp);

svg.appendChild(ns('path',{
d:ll+` L ${lp.at(-1)[0]} ${base} L ${lp[0][0]} ${base} Z`,
fill:'#CE181E',
'fill-opacity':'.28'
}));

svg.appendChild(ns('path',{
d:tl+` L ${tp.at(-1)[0]} ${base} L ${tp[0][0]} ${base} Z`,
fill:'#238291',
'fill-opacity':'.32'
}));

svg.appendChild(ns('path',{
d:ll,
fill:'none',
stroke:'#CE181E',
'stroke-width':'2.5'
}));

svg.appendChild(ns('path',{
d:tl,
fill:'none',
stroke:'#238291',
'stroke-width':'2.5'
}));

drawRestructure({
enabled:restructureMode,
data:DATA,
plottedSeries:P,
scenarioEconomics,
x,
y,
m,
W,
H,
base,
svg,
ns,
txt,
selected
});

if($('process').checked){
drawProcess({
data:DATA,
x,
m,
W,
H,
x0,
x1,
win,
leaseExpiration:leaseExpiration(),
svg,
ns,
txt,
restructureMode,
mapDate:scenario.mapDate
});
}

/* TODAY */
const now=activeDate();

if(+now>=x0&&+now<=x1){
const tx=x(now);
const exp=leaseExpiration();

const insideWindow=+now>=+win.start&&+now<=+win.end;
const afterWindow=+now>+win.end;

svg.appendChild(ns('line',{
x1:tx,
y1:m.t-5,
x2:tx,
y2:base,
stroke:'#FFDF00',
'stroke-width':'2',
opacity:'.90'
}));

const cardW=Math.min(310,Math.max(235,pw*.18));
const cardH=58;

const cardX=Math.max(
m.l+8,
Math.min(W-m.r-cardW-8,tx-cardW/2)
);

const cardY=base-cardH-10;

svg.appendChild(ns('rect',{
x:cardX,
y:cardY,
width:cardW,
height:cardH,
rx:6,
fill:'#25273A',
'fill-opacity':'.97',
stroke:'#FFDF00',
'stroke-width':'1.4',
'stroke-opacity':'.88'
}));

txt(cardX+10,cardY+16,`TODAY · ${fmt(now)}`,'t1');
txt(cardX+10,cardY+32,`${months(now,exp)} months to lease expiration`,'t2');

const timing=
insideWindow
?'INSIDE OPTIMAL EXECUTION WINDOW'
:afterWindow
?`EXECUTION WINDOW PASSED · ${months(win.end,now)} months ago`
:`${months(now,win.start)} months to optimal execution window`;

txt(cardX+10,cardY+47,timing,'t2');
}

/* ACTIVE OPTIMAL EXECUTION WINDOW */
[win.start,win.end].forEach(d=>{
const xx=x(d);

svg.appendChild(ns('line',{
x1:xx,
y1:m.t-8,
x2:xx,
y2:base,
class:'guideDash'
}));
});

txt(
(wx1+wx2)/2,
m.t+10,
'OPTIMAL EXECUTION WINDOW',
't1',
'middle'
);

const ay=m.t+27;

svg.appendChild(ns('line',{
x1:wx1+12,
y1:ay,
x2:wx2-12,
y2:ay,
class:'windowArrow'
}));

svg.appendChild(ns('path',{
d:
`M ${wx1+12} ${ay} l 8 -5 `+
`M ${wx1+12} ${ay} l 8 5 `+
`M ${wx2-12} ${ay} l -8 -5 `+
`M ${wx2-12} ${ay} l -8 5`,
class:'windowArrow'
}));

txt(
(wx1+wx2)/2,
m.t+45,
`${fmt(win.start)} – ${fmt(win.end)}`,
't1',
'middle'
);

/* LEASE EXPIRATION */
const exp=leaseExpiration();

if(+exp>=x0&&+exp<=x1){
const ex=x(exp);

svg.appendChild(ns('line',{
x1:ex,
y1:m.t-8,
x2:ex,
y2:base,
class:'leaseExpiryGuide',
stroke:'#CE181E',
'stroke-width':'2.6',
'stroke-dasharray':'8 4'
}));

const anchor=ex>W-m.r-150?'end':'start';
const lx=anchor==='end'?ex-8:ex+8;

const leaseTitle=txt(
lx,
m.t+64,
'CURRENT LEASE EXPIRATION',
'leaseExpiryText',
anchor
);

leaseTitle.setAttribute('fill','#CE181E');
leaseTitle.setAttribute('font-size','20');
leaseTitle.setAttribute('font-weight','700');

const leaseDate=txt(
lx,
m.t+88,
fmtUTC(exp),
'leaseExpiryDate',
anchor
);

leaseDate.setAttribute('fill','#CE181E');
leaseDate.setAttribute('font-size','20');
leaseDate.setAttribute('font-weight','700');
}

/* CLICKABLE LIVE-DATA ANCHORS */
DATA.forEach((d,i)=>{
if(+d.date<x0||+d.date>x1)return;

const v=plottedValueAt(d.date,P);

const h=ns('circle',{
cx:x(d.date),
cy:y(v.tenant),
r:10,
fill:'transparent',
style:'cursor:pointer'
});

h.addEventListener('click',()=>choose(i));
svg.appendChild(h);
});

if(
selected>=0&&
DATA[selected]&&
+DATA[selected].date>=x0&&
+DATA[selected].date<=x1
){
const d=DATA[selected];
const v=plottedValueAt(d.date,P);

const sx=x(d.date);
const sy=y(v.tenant);
const ly=y(v.landlord);

svg.appendChild(ns('line',{
x1:sx,
y1:m.t+52,
x2:sx,
y2:base,
class:'sel'
}));

svg.appendChild(ns('circle',{
cx:sx,
cy:sy,
r:5,
fill:'#238291',
class:'dot'
}));

svg.appendChild(ns('circle',{
cx:sx,
cy:ly,
r:5,
fill:'#CE181E',
class:'dot'
}));

showPopup({
d:{...d,tenant:v.tenant,landlord:v.landlord},
sx,
sy:Math.min(sy,ly),
W,
H,
m,
popup,
annotationsEnabled:$('anno').checked,
esc,
money
});

}else{
popup.hidden=true;
}
}

function updateImpact(){
const d=selected>=0?DATA[selected]:DATA[0];
if(!d)return;

const today=+d.npvToday;
const raw=+d.npvDelta;
let exec=+d.npvExec;

let delta=
Number.isFinite(raw)
?raw
:(
Number.isFinite(today)&&Number.isFinite(exec)
?today-exec
:NaN
);

const baselineDelta=delta;
delta=scenarioEconomics(baselineDelta);

if(Number.isFinite(today)&&Number.isFinite(delta)){
exec=today-delta;
}

const el=$('impactDelta');

if(!el)return;

if(Number.isFinite(delta)){
const gain=delta>0;
const loss=delta<0;

el.className=
'impact-delta '+
(gain?'gain':loss?'loss':'neutral');

el.textContent=
`${gain?'+':loss?'−':''}${money(Math.abs(delta))} VALUE ${gain?'GAINED':loss?'LOST':'CHANGE'} BY EXECUTING IN WINDOW`;

}else{
el.className='impact-delta neutral';
el.textContent='FINANCIAL IMPACT AVAILABLE WHEN NPV FIELDS ARE POPULATED';
}

const npv=$('impactNpv');

if(npv){
npv.textContent=
`NPV TODAY ${money(today)}   |   NPV IN EXECUTION WINDOW ${money(exec)}`;
}
}

function choose(i){
  selected=+i;
  select.value=String(selected);
  render();
  updateImpact();
  renderLiveIntelligence();
}

$('login').onclick=signIn;
$('centerLogin').onclick=signIn;

const todaysReadButton=$('todaysReadButton');
const todaysReadClose=$('todaysReadClose');

if(todaysReadButton){
  todaysReadButton.onclick=()=>{
    const panel=$('todaysReadPanel');
    toggleTodaysRead(!!panel?.hidden);
  };
}

if(todaysReadClose){
  todaysReadClose.onclick=()=>{
    toggleTodaysRead(false);
  };
}

$('logout').onclick=()=>{
idm?.destroyCredentials();
location.reload();
};

select.onchange=()=>choose(select.value);
$('anno').onchange=render;
$('process').onchange=render;
$('restructure').onchange=render;
$('clear').onclick=()=>choose(-1);
window.onresize=render;

window.addEventListener('message',e=>{
if(
!DATA.length||
e?.data?.type!=='lease-leverage-selection'
)return;

const i=DATA.findIndex(
d=>
String(d.iteration||'').trim()===
String(e.data.iteration||'').trim()
);

if(i>=0)choose(i);
});

setup().catch(e=>{
console.error(e);
state('Initialization failed','err');

msg.innerHTML=
'<span style="color:#ff9ca7">'+
esc(e.message||e)+
'</span>';
});