// Lease Leverage curve engine.
// Presentation math only. No OAuth, ArcGIS, DOM, process, or annotation logic lives here.

const clamp01=t=>Math.max(0,Math.min(1,t));
const lerp=(a,b,t)=>a+(b-a)*t;

function curveLevels(){
  const rawT=DATA.map(d=>d.tenant).filter(Number.isFinite);
  const rawL=DATA.map(d=>d.landlord).filter(Number.isFinite);
  return {
    tStart:rawT[0] ?? Math.min(...rawT),
    tPeak:Math.max(...rawT),
    tEnd:rawT.at(-1) ?? Math.min(...rawT),
    lStart:rawL[0] ?? Math.max(...rawL),
    lLow:Math.min(...rawL),
    lEnd:rawL.at(-1) ?? Math.max(...rawL)
  };
}
function easeInOutCubic(t){
  t=clamp01(t);
  return t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
}
function curveValueAt(date){
  const win=windowBounds(),lev=curveLevels();
  const x0=+DATA[0].date,x1=+DATA.at(-1).date;
  const ws=+win.start,we=+win.end,z=+date;

  const tenantStart=lev.tStart;
  const tenantHigh=lev.tPeak*0.94;
  const tenantEnd=lev.tEnd;
  const landlordStart=lev.lStart;
  const landlordLow=lev.lLow*1.035;
  const landlordEnd=lev.lEnd;

  let tenant,landlord;

  if(z<=ws){
    const p=clamp01((z-x0)/(ws-x0));
    const e=p*p*(3-2*p);
    const late=easeInOutCubic(e);
    tenant=lerp(tenantStart,tenantHigh*0.985,late);
    landlord=lerp(landlordStart,landlordLow*1.02,late);
  }else if(z<=we){
    const p=clamp01((z-ws)/(we-ws));
    const crown=1-0.006*Math.pow((p-.5)/.5,2);
    tenant=tenantHigh*crown;
    landlord=landlordLow*(2-crown);
  }else{
    const p=clamp01((z-we)/(x1-we));
    const e=easeInOutCubic(p);
    tenant=lerp(tenantHigh*0.994,tenantEnd,e);
    landlord=lerp(landlordLow*1.006,landlordEnd,e);
  }
  return {tenant,landlord};
}
function shapedSeries(){
  const x0=+DATA[0].date,x1=+DATA.at(-1).date,n=300,out=[];
  for(let i=0;i<n;i++){
    const date=new Date(x0+(x1-x0)*(i/(n-1)));
    const v=curveValueAt(date);
    out.push({date,plotTenant:v.tenant,plotLandlord:v.landlord});
  }
  return out;
}


export { shapedSeries, curveValueAt };
