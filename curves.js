export function clamp01(t){return Math.max(0,Math.min(1,t))}
export function lerp(a,b,t){return a+(b-a)*t}

function smoothstep(t){
  t=clamp01(t);
  return t*t*(3-2*t);
}
function logistic(x){
  return 1/(1+Math.exp(-x));
}
function normalizedLogistic(t,center,steepness){
  t=clamp01(t);
  const f=x=>logistic((x-center)*steepness);
  const lo=f(0),hi=f(1);
  return (f(t)-lo)/(hi-lo);
}
function bell(t,center,width){
  const z=(t-center)/width;
  return Math.exp(-0.5*z*z);
}

export function levels(data){
  const tenant=data.map(d=>d.tenant).filter(Number.isFinite);
  const landlord=data.map(d=>d.landlord).filter(Number.isFinite);

  const tMin=Math.min(...tenant),tMax=Math.max(...tenant);
  const lMin=Math.min(...landlord),lMax=Math.max(...landlord);

  return {
    tenantEarly:tenant[0],
    tenantPeak:tMax,
    // Force the late tenant state toward the lower live-data regime.
    tenantLate:Math.max(tMin,Math.min(tenant.at(-1),tMin+(tMax-tMin)*0.18)),

    landlordEarly:landlord[0],
    landlordTrough:lMin,
    // Landlord MUST finish above tenant. Use live landlord ending value as a floor,
    // then ensure a visible crossover margin.
    landlordLate:Math.max(landlord.at(-1),lMin+(lMax-lMin)*0.72)
  };
}

export function valueAt(date,data,win){
  const L=levels(data);
  const x0=+data[0].date,x1=+data.at(-1).date,z=+date;
  const t=clamp01((z-x0)/(x1-x0));

  const ws=clamp01((+win.start-x0)/(x1-x0));
  const we=clamp01((+win.end-x0)/(x1-x0));
  const wc=(ws+we)/2;

  // Rise begins gently, then accelerates sharply immediately before the window.
  // Fall begins sharply around the back side of the window.
  // These are smooth logistic functions, so there are no corners or lumps.
  const riseCenter=Math.max(.05,ws-.055);
  const fallCenter=Math.min(.95,we+.055);
  const rise=normalizedLogistic(t,riseCenter,18);
  const fall=normalizedLogistic(t,fallCenter,18);

  // Smooth leverage "advantage" pulse: 0 early, ~1 around the window, 0 late.
  // Multiplication prevents a horizontal shelf.
  let pulse=rise*(1-fall);

  // Add one subtle rounded crown centered in the execution window.
  // This creates a true peak/trough instead of a horizon.
  const crown=bell(t,wc,Math.max(.035,(we-ws)*.34));
  pulse=clamp01(pulse*(0.90+0.10*crown));

  // Late-state transition begins after the leverage pulse has materially decayed.
  const late=normalizedLogistic(t,Math.min(.96,we+.17),12);

  // Tenant: early -> localized peak -> low late state.
  const tenantBase=lerp(L.tenantEarly,L.tenantLate,late);
  const tenant=tenantBase+(L.tenantPeak-tenantBase)*pulse;

  // Landlord: exact narrative inverse -> localized trough -> strong late recovery.
  const landlordBase=lerp(L.landlordEarly,L.landlordLate,late);
  const landlord=landlordBase-(landlordBase-L.landlordTrough)*pulse;

  return {tenant,landlord};
}

export function series(data,win,n=520){
  const x0=+data[0].date,x1=+data.at(-1).date,out=[];
  for(let i=0;i<n;i++){
    const date=new Date(x0+(x1-x0)*(i/(n-1)));
    const v=valueAt(date,data,win);
    out.push({date,plotTenant:v.tenant,plotLandlord:v.landlord});
  }
  return out;
}

export function smoothPath(points){
  // Dense analytic sampling means a simple polyline is already visually smooth.
  // Using straight joins avoids Catmull-Rom overshoot/lumps.
  if(points.length<2)return "";
  let d=`M ${points[0][0]} ${points[0][1]}`;
  for(let i=1;i<points.length;i++)d+=` L ${points[i][0]} ${points[i][1]}`;
  return d;
}
