// Curve geometry only. Receives live DATA and window explicitly.
function clamp01(t){return Math.max(0,Math.min(1,t))}
function smoother(t){t=clamp01(t);return t*t*t*(t*(t*6-15)+10)}
function lerp(a,b,t){return a+(b-a)*t}
function curveLevels(DATA){
  const rawT=DATA.map(d=>d.tenant).filter(Number.isFinite), rawL=DATA.map(d=>d.landlord).filter(Number.isFinite);
  const tMin=Math.min(...rawT),tMax=Math.max(...rawT),lMin=Math.min(...rawL),lMax=Math.max(...rawL);
  return {
    tEarly:rawT[0], tPeak:tMax*0.955, tLate:Math.max(tMin,rawT.at(-1)),
    lEarly:rawL[0], lLow:lMin*1.01, lLate:Math.max(rawL.at(-1),lMin+(lMax-lMin)*0.72)
  };
}
function gaussian(t,mu,sigma){const z=(t-mu)/sigma;return Math.exp(-0.5*z*z)}
function smoothstep(t){t=clamp01(t);return t*t*(3-2*t)}
function curveValueAt(date,DATA,win){
  const lev=curveLevels(DATA);
  const x0=+DATA[0].date,x1=+DATA.at(-1).date,t=clamp01((+date-x0)/(x1-x0));
  const ws=clamp01((+win.start-x0)/(x1-x0)),we=clamp01((+win.end-x0)/(x1-x0));
  const center=(ws+we)/2;
  // One continuous leverage event: no joins at the execution-window boundaries.
  const width=Math.max(.115,(we-ws)*.58);
  const bell=gaussian(t,center,width);
  // Broad, smooth late transition lets landlord recover/cross without a knee.
  const lateStart=Math.min(.84,we+.08);
  const late=smoothstep((t-lateStart)/(1-lateStart));
  const tenantBase=lerp(lev.tEarly,lev.tLate,late);
  const landlordBase=lerp(lev.lEarly,lev.lLate,late);
  return {
    tenant:tenantBase+(lev.tPeak-tenantBase)*bell,
    landlord:landlordBase-(landlordBase-lev.lLow)*bell
  };
}
function shapedSeries(DATA,win){
  const x0=+DATA[0].date,x1=+DATA.at(-1).date,n=360,out=[];
  for(let i=0;i<n;i++){const date=new Date(x0+(x1-x0)*(i/(n-1))),v=curveValueAt(date,DATA,win);out.push({date,plotTenant:v.tenant,plotLandlord:v.landlord})}
  return out;
}

export { curveValueAt, shapedSeries };
