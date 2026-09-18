// Lease Leverage curve engine.
// PURE presentation math: all live data and execution-window values are passed in by app.js.
// No OAuth, ArcGIS, DOM, or hidden app globals.

const clamp01=t=>Math.max(0,Math.min(1,t));
const lerp=(a,b,t)=>a+(b-a)*t;

function gaussian(x,mu,sigma){
  const z=(x-mu)/sigma;
  return Math.exp(-0.5*z*z);
}
function smoothstep(t){
  t=clamp01(t);
  return t*t*(3-2*t);
}
function levels(data){
  const rawT=data.map(d=>d.tenant).filter(Number.isFinite);
  const rawL=data.map(d=>d.landlord).filter(Number.isFinite);
  const tMin=Math.min(...rawT),tMax=Math.max(...rawT);
  const lMin=Math.min(...rawL),lMax=Math.max(...rawL);

  return {
    tenantEarly:rawT[0],
    tenantPeak:tMax,
    tenantLate:tMin+(tMax-tMin)*0.10,
    landlordEarly:rawL[0],
    landlordTrough:lMin,
    landlordLate:Math.max(rawL.at(-1),lMin+(lMax-lMin)*0.82)
  };
}
function normalizedTime(date,data){
  const x0=+data[0].date,x1=+data.at(-1).date;
  return clamp01((+date-x0)/(x1-x0));
}
function geometry(data,win){
  const x0=+data[0].date,x1=+data.at(-1).date;
  const ws=(+win.start-x0)/(x1-x0);
  const we=(+win.end-x0)/(x1-x0);
  return {
    center:(ws+we)/2,
    width:Math.max(0.105,(we-ws)*0.62),
    lateStart:Math.min(.88,we+.10)
  };
}

function curveValueAt(date,data,win){
  const L=levels(data);
  const t=normalizedTime(date,data);
  const G=geometry(data,win);

  // One continuous bell across the entire timeline.
  // Execution-window boundaries do not create curve joins.
  const bell=gaussian(t,G.center,G.width);

  // Smooth late-state transition for backend landlord recovery/crossover.
  const late=smoothstep((t-G.lateStart)/(1-G.lateStart));

  const tenantBase=lerp(L.tenantEarly,L.tenantLate,late);
  const landlordBase=lerp(L.landlordEarly,L.landlordLate,late);

  return {
    tenant:tenantBase+(L.tenantPeak-tenantBase)*bell,
    landlord:landlordBase-(landlordBase-L.landlordTrough)*bell
  };
}

function shapedSeries(data,win){
  if(!Array.isArray(data)||data.length<2) return [];
  const x0=+data[0].date,x1=+data.at(-1).date;
  const out=[],n=1000;
  for(let i=0;i<n;i++){
    const date=new Date(x0+(x1-x0)*(i/(n-1)));
    const v=curveValueAt(date,data,win);
    out.push({date,plotTenant:v.tenant,plotLandlord:v.landlord});
  }
  return out;
}

export { shapedSeries, curveValueAt };
