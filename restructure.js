// EARLY RESTRUCTURE SCENARIO — additive only.
// Toggle OFF => this module renders nothing and baseline engine is unchanged.

function finiteDate(v){
  return v instanceof Date && Number.isFinite(+v) ? v : null;
}

function restructureControl(data){
  const row=data.find(d=>String(d.restructureProgress??'').trim()) || null;
  const effective=data.map(d=>finiteDate(d.restructureEffectiveDate)).find(Boolean) || null;
  return {progress:row?String(row.restructureProgress).trim():'',effective};
}

function restructureSeries(data){
  return data.map(d=>{
    let value=+d.restructureTenantCurve;
    if(!Number.isFinite(value)) return null;
    if(value<=1.5) value*=100;
    return {date:d.date,value,optionValue:Number.isFinite(+d.restructureOptionValue)?+d.restructureOptionValue:null};
  }).filter(Boolean).sort((a,b)=>a.date-b.date);
}

function curvePath(pts){
  if(pts.length<2)return'';
  let d=`M ${pts[0][0]} ${pts[0][1]}`;
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
    d+=` C ${p1[0]+(p2[0]-p0[0])/6} ${p1[1]+(p2[1]-p0[1])/6}, ${p2[0]-(p3[0]-p1[0])/6} ${p2[1]-(p3[1]-p1[1])/6}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function drawRestructure({enabled,data,x,y,m,W,base,svg,ns,txt,money}){
  if(!enabled)return;
  const series=restructureSeries(data);
  if(!series.length)return;

  const pts=series.map(d=>[x(d.date),y(d.value)]);
  svg.appendChild(ns('path',{
    d:curvePath(pts),fill:'none',stroke:'#f29be2','stroke-width':'2.2',
    'stroke-dasharray':'8 5',opacity:'.98'
  }));

  const ctl=restructureControl(data);
  const first=series[0],last=series.at(-1);
  const effective=ctl.effective||first.date;
  const ex=x(effective);
  if(Number.isFinite(ex))svg.appendChild(ns('line',{
    x1:ex,y1:m.t+52,x2:ex,y2:base,stroke:'#f29be2','stroke-width':'1.5',
    'stroke-dasharray':'4 4',opacity:'.8'
  }));

  svg.appendChild(ns('circle',{
    cx:x(last.date),cy:y(last.value),r:4,fill:'#f29be2',stroke:'#fff','stroke-width':'1.5'
  }));

  const optionRow=data.find(d=>finiteDate(d.date)&&+d.date>=+effective&&Number.isFinite(+d.restructureOptionValue))
    || data.find(d=>Number.isFinite(+d.restructureOptionValue));
  const option=optionRow?+optionRow.restructureOptionValue:NaN;
  const cardW=Math.min(365,Math.max(290,(W-m.l-m.r)*.23)),cardH=56;
  const cardX=Math.max(m.l+8,Math.min(W-m.r-cardW-8,ex-cardW/2));
  const cardY=m.t+54;
  svg.appendChild(ns('rect',{
    x:cardX,y:cardY,width:cardW,height:cardH,rx:6,
    fill:'#120b1b','fill-opacity':'.96',stroke:'#d77ac8','stroke-width':'1.2'
  }));
  const title=txt(cardX+10,cardY+18,`EARLY RESTRUCTURE · ${ctl.progress||'SCENARIO'}`,'t1');
  title.setAttribute('fill','#f29be2');
  const sub=txt(cardX+10,cardY+38,`REMAINING OPTION VALUE ${Number.isFinite(option)?money(option):'—'} · RELOCATION REMAINS COUNTERFACTUAL`,'t2');
  sub.setAttribute('fill','#d8c7df');
}

export {drawRestructure};
