// Lease Leverage curve engine.
// Curve geometry only. No OAuth, ArcGIS, DOM, process, or annotation logic.

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

function levels(){
  const rawT=DATA.map(d=>d.tenant).filter(Number.isFinite);
  const rawL=DATA.map(d=>d.landlord).filter(Number.isFinite);

  const tMin=Math.min(...rawT),tMax=Math.max(...rawT);
  const lMin=Math.min(...rawL),lMax=Math.max(...rawL);

  return {
    tenantEarly:rawT[0],
    tenantPeak:tMax,
    tenantLate:tMin+(tMax-tMin)*0.10,

    landlordEarly:rawL[0],
    landlordTrough:lMin,
    // Late landlord deliberately recovers above late tenant.
    landlordLate:Math.max(rawL.at(-1),lMin+(lMax-lMin)*0.82)
  };
}

function normalizedTime(date){
  const x0=+DATA[0].date,x1=+DATA.at(-1).date;
  return clamp01((+date-x0)/(x1-x0));
}

function curveCenterAndWidth(){
  const win=windowBounds();
  const x0=+DATA[0].date,x1=+DATA.at(-1).date;
  const ws=(+win.start-x0)/(x1-x0);
  const we=(+win.end-x0)/(x1-x0);

  // Window only positions the center/scale of ONE continuous curve.
  // It does NOT create separate before/inside/after segments.
  const center=(ws+we)/2;
  const width=Math.max(0.105,(we-ws)*0.62);
  return {center,width,we};
}

function curveValueAt(date){
  const L=levels();
  const t=normalizedTime(date);
  const {center,width,we}=curveCenterAndWidth();

  // ONE continuous bell controls leverage advantage across the full timeline.
  // No if/else at execution-window boundaries. No joins. No shoulders.
  const bell=gaussian(t,center,width);

  // A separate globally smooth late-state transition creates the backend crossover.
  // It is intentionally broad enough to avoid a knee.
  const lateStart=Math.min(.88,we+.10);
  const late=smoothstep((t-lateStart)/(1-lateStart));

  const tenantBase=lerp(L.tenantEarly,L.tenantLate,late);
  const landlordBase=lerp(L.landlordEarly,L.landlordLate,late);

  const tenant=tenantBase+(L.tenantPeak-tenantBase)*bell;
  const landlord=landlordBase-(landlordBase-L.landlordTrough)*bell;

  return {tenant,landlord};
}

function shapedSeries(){
  const x0=+DATA[0].date,x1=+DATA.at(-1).date;
  const out=[],n=1000;
  for(let i=0;i<n;i++){
    const date=new Date(x0+(x1-x0)*(i/(n-1)));
    const v=curveValueAt(date);
    out.push({date,plotTenant:v.tenant,plotLandlord:v.landlord});
  }
  return out;
}

export { shapedSeries, curveValueAt };
