export function clamp01(t){return Math.max(0,Math.min(1,t))}
export function lerp(a,b,t){return a+(b-a)*t}

function pchipSlopes(xs,ys){
  const n=xs.length,h=[],d=[],m=new Array(n).fill(0);
  for(let i=0;i<n-1;i++){h[i]=xs[i+1]-xs[i];d[i]=(ys[i+1]-ys[i])/h[i]}
  if(n===2){m[0]=m[1]=d[0];return m}

  // Shape-preserving interior derivatives (Fritsch-Carlson / PCHIP).
  for(let i=1;i<n-1;i++){
    if(d[i-1]===0||d[i]===0||Math.sign(d[i-1])!==Math.sign(d[i])) m[i]=0;
    else{
      const w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];
      m[i]=(w1+w2)/(w1/d[i-1]+w2/d[i]);
    }
  }
  m[0]=((2*h[0]+h[1])*d[0]-h[0]*d[1])/(h[0]+h[1]);
  if(Math.sign(m[0])!==Math.sign(d[0]))m[0]=0;
  else if(Math.sign(d[0])!==Math.sign(d[1])&&Math.abs(m[0])>Math.abs(3*d[0]))m[0]=3*d[0];

  const k=n-1;
  m[k]=((2*h[k-1]+h[k-2])*d[k-1]-h[k-1]*d[k-2])/(h[k-1]+h[k-2]);
  if(Math.sign(m[k])!==Math.sign(d[k-1]))m[k]=0;
  else if(Math.sign(d[k-1])!==Math.sign(d[k-2])&&Math.abs(m[k])>Math.abs(3*d[k-1]))m[k]=3*d[k-1];
  return m;
}

function pchip(xs,ys,x){
  if(x<=xs[0])return ys[0];
  if(x>=xs.at(-1))return ys.at(-1);
  let i=0;
  while(i<xs.length-2&&x>xs[i+1])i++;
  const h=xs[i+1]-xs[i],u=(x-xs[i])/h,m=pchipSlopes(xs,ys);
  const h00=2*u*u*u-3*u*u+1,h10=u*u*u-2*u*u+u,h01=-2*u*u*u+3*u*u,h11=u*u*u-u*u;
  return h00*ys[i]+h10*h*m[i]+h01*ys[i+1]+h11*h*m[i+1];
}

export function levels(data){
  const T=data.map(d=>d.tenant).filter(Number.isFinite);
  const L=data.map(d=>d.landlord).filter(Number.isFinite);
  const tMin=Math.min(...T),tMax=Math.max(...T),lMin=Math.min(...L),lMax=Math.max(...L);

  // Live data controls the amplitude/range; visual control points control geometry.
  const tenantLow=Math.max(tMin,Math.min(T[0],tMin+(tMax-tMin)*.12));
  const tenantPeak=tMax;
  const tenantLate=tMin+(tMax-tMin)*.10;

  const landlordHigh=Math.max(L[0],lMin+(lMax-lMin)*.88);
  const landlordLow=lMin;
  // Deliberately finish landlord above tenant late.
  const landlordLate=Math.max(L.at(-1),lMin+(lMax-lMin)*.80);

  return {tenantLow,tenantPeak,tenantLate,landlordHigh,landlordLow,landlordLate};
}

function controlPoints(data,win){
  const L=levels(data);
  const x0=+data[0].date,x1=+data.at(-1).date;
  const ws=(+win.start-x0)/(x1-x0),we=(+win.end-x0)/(x1-x0),wc=(ws+we)/2;

  // Explicit geometry matching the approved render.
  // No plateau: only ONE point at the peak/trough.
  const xs=[
    0.00,
    Math.max(.08,ws-.38),
    Math.max(.12,ws-.22),
    Math.max(.16,ws-.10),
    Math.max(.18,ws-.025),
    wc,
    Math.min(.82,we+.025),
    Math.min(.86,we+.10),
    Math.min(.91,we+.22),
    Math.min(.96,we+.38),
    1.00
  ];

  const tRange=L.tenantPeak-L.tenantLow;
  const tenant=[
    L.tenantLow,
    L.tenantLow+tRange*.06,
    L.tenantLow+tRange*.18,
    L.tenantLow+tRange*.48,
    L.tenantLow+tRange*.78,
    L.tenantPeak,
    L.tenantLow+tRange*.78,
    L.tenantLow+tRange*.47,
    L.tenantLow+tRange*.20,
    L.tenantLate+(L.tenantPeak-L.tenantLate)*.05,
    L.tenantLate
  ];

  const lRange=L.landlordHigh-L.landlordLow;
  const landlord=[
    L.landlordHigh,
    L.landlordHigh-lRange*.05,
    L.landlordHigh-lRange*.16,
    L.landlordHigh-lRange*.46,
    L.landlordHigh-lRange*.76,
    L.landlordLow,
    L.landlordHigh-lRange*.76,
    L.landlordHigh-lRange*.46,
    L.landlordHigh-lRange*.17,
    L.landlordLate-(L.landlordLate-L.landlordLow)*.04,
    L.landlordLate
  ];

  // Ensure strictly increasing x coordinates after dynamic placement.
  for(let i=1;i<xs.length;i++) if(xs[i]<=xs[i-1]) xs[i]=Math.min(.999,xs[i-1]+.002);
  return {xs,tenant,landlord};
}

export function valueAt(date,data,win){
  const x0=+data[0].date,x1=+data.at(-1).date;
  const t=clamp01((+date-x0)/(x1-x0));
  const C=controlPoints(data,win);
  return {
    tenant:pchip(C.xs,C.tenant,t),
    landlord:pchip(C.xs,C.landlord,t)
  };
}

export function series(data,win,n=900){
  const x0=+data[0].date,x1=+data.at(-1).date,out=[];
  for(let i=0;i<n;i++){
    const date=new Date(x0+(x1-x0)*(i/(n-1)));
    const v=valueAt(date,data,win);
    out.push({date,plotTenant:v.tenant,plotLandlord:v.landlord});
  }
  return out;
}

export function smoothPath(points){
  // PCHIP already supplies the smooth geometry. Dense sampling prevents visible segments
  // and avoids any second spline pass that could introduce overshoot/lumps.
  if(points.length<2)return "";
  return points.reduce((d,p,i)=>d+(i?` L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`:`M ${p[0].toFixed(2)} ${p[1].toFixed(2)}`),"");
}
