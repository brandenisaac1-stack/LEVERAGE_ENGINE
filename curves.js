export function clamp01(t){return Math.max(0,Math.min(1,t))}
export function lerp(a,b,t){return a+(b-a)*t}
function logistic01(t,k=11){
  t=clamp01(t);
  const f=x=>1/(1+Math.exp(-k*(x-.5)));
  const lo=f(0),hi=f(1);
  return (f(t)-lo)/(hi-lo);
}
export function levels(data){
  const t=data.map(d=>d.tenant).filter(Number.isFinite);
  const l=data.map(d=>d.landlord).filter(Number.isFinite);
  return {tEarly:t[0],tPeak:Math.max(...t)*.955,tLate:t.at(-1),lEarly:l[0],lLow:Math.min(...l)*1.025,lLate:l.at(-1)};
}
export function valueAt(date,data,win){
  const L=levels(data),x0=+data[0].date,x1=+data.at(-1).date,ws=+win.start,we=+win.end,z=+date;

  // The window is an annotation period, NOT a plateau instruction.
  // The actual peak/trough is localized around the middle of the window.
  const center=(ws+we)/2;
  const half=Math.max(1,(we-ws)/2);

  // Strong transitions start before and finish after the window.
  const preStart=ws-(ws-x0)*.34;
  const postEnd=we+(x1-we)*.34;

  let tenant,landlord;

  if(z<ws){
    const p=logistic01((z-preStart)/(ws-preStart),10);
    const quiet=clamp01((z-x0)/(preStart-x0));
    const tBase=lerp(L.tEarly,L.tEarly+(L.tPeak-L.tEarly)*.06,quiet*quiet);
    const lBase=lerp(L.lEarly,L.lEarly-(L.lEarly-L.lLow)*.06,quiet*quiet);
    tenant=lerp(tBase,L.tPeak*.88,p);
    landlord=lerp(lBase,L.lLow*1.14,p);
  }else if(z<=we){
    // Smooth, narrow, rounded peak/trough. No horizontal shelf.
    const q=(z-center)/half;                    // -1..1
    const bell=Math.exp(-2.6*q*q);             // localized rounded crown
    const shoulder=.88+.12*bell;
    tenant=L.tPeak*shoulder;
    landlord=L.lLow*(2-shoulder);
  }else{
    const p=logistic01((z-we)/(postEnd-we),10);
    const tShoulder=L.tPeak*.88;
    const lShoulder=L.lLow*1.14;
    const tNearLate=L.tLate+(L.tPeak-L.tLate)*.06;
    const lNearLate=L.lLate-(L.lLate-L.lLow)*.06;
    tenant=lerp(tShoulder,tNearLate,p);
    landlord=lerp(lShoulder,lNearLate,p);
    if(z>postEnd){
      const r=clamp01((z-postEnd)/(x1-postEnd));
      const e=1-Math.pow(1-r,2);
      tenant=lerp(tNearLate,L.tLate,e);
      landlord=lerp(lNearLate,L.lLate,e);
    }
  }
  return {tenant,landlord};
}
export function series(data,win,n=420){
  const x0=+data[0].date,x1=+data.at(-1).date,out=[];
  for(let i=0;i<n;i++){
    const date=new Date(x0+(x1-x0)*(i/(n-1)));
    const v=valueAt(date,data,win);
    out.push({date,plotTenant:v.tenant,plotLandlord:v.landlord});
  }
  return out;
}
export function smoothPath(points){
  if(points.length<2)return "";
  let d=`M ${points[0][0]} ${points[0][1]}`;
  for(let i=0;i<points.length-1;i++){
    const p0=points[Math.max(0,i-1)],p1=points[i],p2=points[i+1],p3=points[Math.min(points.length-1,i+2)];
    d+=` C ${p1[0]+(p2[0]-p0[0])/6} ${p1[1]+(p2[1]-p0[1])/6}, ${p2[0]-(p3[0]-p1[0])/6} ${p2[1]-(p3[1]-p1[1])/6}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}
