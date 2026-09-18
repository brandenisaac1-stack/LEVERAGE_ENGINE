export function clamp01(t){return Math.max(0,Math.min(1,t))}
export function lerp(a,b,t){return a+(b-a)*t}

function logistic(x){return 1/(1+Math.exp(-x))}
function normLogistic(t,c,k){
  t=clamp01(t);
  const f=x=>logistic((x-c)*k),lo=f(0),hi=f(1);
  return (f(t)-lo)/(hi-lo);
}
function gaussian(t,c,s){
  const z=(t-c)/s;
  return Math.exp(-0.5*z*z);
}

export function levels(data){
  const T=data.map(d=>d.tenant).filter(Number.isFinite);
  const L=data.map(d=>d.landlord).filter(Number.isFinite);
  const tMin=Math.min(...T),tMax=Math.max(...T),lMin=Math.min(...L),lMax=Math.max(...L);

  return {
    // Use live data as amplitude anchors, while the presentation curve controls shape.
    tEarly:Math.max(tMin,Math.min(T[0],tMin+(tMax-tMin)*0.20)),
    tPeak:tMax,
    tLate:tMin+(tMax-tMin)*0.16,

    lEarly:Math.max(L[0],lMin+(lMax-lMin)*0.82),
    lTrough:lMin,
    // Backend landlord deliberately finishes above tenant.
    lLate:lMin+(lMax-lMin)*0.78
  };
}

export function valueAt(date,data,win){
  const L=levels(data);
  const x0=+data[0].date,x1=+data.at(-1).date,z=+date;
  const t=clamp01((z-x0)/(x1-x0));
  const ws=clamp01((+win.start-x0)/(x1-x0));
  const we=clamp01((+win.end-x0)/(x1-x0));
  const wc=(ws+we)/2;

  // Broad baseline movement is smooth, but leverage accelerates materially
  // as the execution window approaches and decays materially after it.
  const rise=normLogistic(t,ws-.075,10.5);
  const fall=normLogistic(t,we+.075,10.5);

  // One smooth localized leverage event. This prevents any horizon/tabletop.
  const pulseBase=rise*(1-fall);
  const crown=gaussian(t,wc,Math.max(.055,(we-ws)*.42));
  const pulse=clamp01(pulseBase*(.84+.16*crown));

  // Late regime drives the backend crossover.
  const late=normLogistic(t,we+.18,8.5);

  const tenantBase=lerp(L.tEarly,L.tLate,late);
  const landlordBase=lerp(L.lEarly,L.lLate,late);

  const tenant=tenantBase+(L.tPeak-tenantBase)*pulse;
  const landlord=landlordBase-(landlordBase-L.lTrough)*pulse;

  return {tenant,landlord};
}

export function series(data,win,n=700){
  const x0=+data[0].date,x1=+data.at(-1).date,out=[];
  for(let i=0;i<n;i++){
    const date=new Date(x0+(x1-x0)*(i/(n-1)));
    const v=valueAt(date,data,win);
    out.push({date,plotTenant:v.tenant,plotLandlord:v.landlord});
  }
  return out;
}

export function smoothPath(points){
  // Analytic curve sampled densely. Polyline avoids interpolation overshoot/lumps.
  if(points.length<2)return "";
  return points.reduce((d,p,i)=>d+(i?` L ${p[0]} ${p[1]}`:`M ${p[0]} ${p[1]}`),"");
}
