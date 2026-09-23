// EARLY RESTRUCTURE scenario overlay — additive drop-in module.
// Toggle OFF => draws nothing. Toggle ON => begins exactly at RESTRUCTURE_EFFECTIVE_DATE.

const BLUE='#3e91d7';
const BLUE_TEXT='#79baf0';

function validDate(v){
  if(v instanceof Date)return Number.isFinite(+v)?new Date(+v):null;
  if(v==null||v==='')return null;
  const d=new Date(v);
  return Number.isFinite(+d)?d:null;
}

function fmtMoney(v){
  return Number.isFinite(+v)
    ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(+v)
    : '—';
}

function curvePath(pts){
  if(!pts.length)return '';
  if(pts.length===1)return `M ${pts[0][0]} ${pts[0][1]}`;
  let d=`M ${pts[0][0]} ${pts[0][1]}`;
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
    d+=` C ${p1[0]+(p2[0]-p0[0])/6} ${p1[1]+(p2[1]-p0[1])/6}, ${p2[0]-(p3[0]-p1[0])/6} ${p2[1]-(p3[1]-p1[1])/6}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function control(data){
  const row=data.find(d=>String(d.restructureProgress??'').trim()||validDate(d.restructureEffectiveDate));
  return {
    progress:String(row?.restructureProgress??'').trim(),
    effective:validDate(row?.restructureEffectiveDate)||data.map(d=>validDate(d.restructureEffectiveDate)).find(Boolean)||null
  };
}

function scenarioValue(v){
  const n=+v;
  if(!Number.isFinite(n))return null;
  return n<=1.5?n*100:n;
}

function tenantAtDate(P,date){
  if(!Array.isArray(P)||!P.length||!date)return null;
  let best=P[0],dist=Math.abs(+P[0].date-+date);
  for(const p of P){
    const d=Math.abs(+p.date-+date);
    if(d<dist){best=p;dist=d;}
  }
  return Number.isFinite(+best.plotTenant)?+best.plotTenant:null;
}

function drawRestructure({enabled,data,plottedSeries,x,y,m,W,base,svg,ns,txt,selected=-1}){
  if(!enabled)return;

  const ctl=control(data);
  if(!ctl.effective)return;

  // Never draw a restructure scenario before the actual restructure effective date.
  const rows=data.map(d=>({
    source:d,
    date:validDate(d.date),
    value:scenarioValue(d.restructureTenantCurve)
  }))
  .filter(d=>d.date&&+d.date>=+ctl.effective&&Number.isFinite(d.value))
  .sort((a,b)=>+a.date-+b.date);

  if(!rows.length)return;

  // The branch begins exactly on the existing teal relocation curve.
  const baselineStart=tenantAtDate(plottedSeries,ctl.effective);
  if(Number.isFinite(baselineStart)){
    if(+rows[0].date===+ctl.effective)rows[0].value=baselineStart;
    else rows.unshift({source:null,date:new Date(+ctl.effective),value:baselineStart});
  }

  const pts=rows.map(d=>[x(d.date),y(d.value)]);
  svg.appendChild(ns('path',{
    d:curvePath(pts),fill:'none',stroke:BLUE,'stroke-width':'2.25',
    'stroke-dasharray':'8 5',opacity:'.98'
  }));

  const ex=x(ctl.effective);
  if(Number.isFinite(ex)){
    svg.appendChild(ns('line',{
      x1:ex,y1:m.t+52,x2:ex,y2:base,stroke:BLUE,'stroke-width':'1.5',
      'stroke-dasharray':'4 4',opacity:'.8'
    }));
    if(Number.isFinite(baselineStart))svg.appendChild(ns('circle',{
      cx:ex,cy:y(baselineStart),r:5,fill:BLUE,stroke:'#fff','stroke-width':'1.5'
    }));
  }

  // Use the engine's existing timing delta as the economic hurdle for acting early.
  let econRow=null;
  if(selected>=0&&data[selected]&&+data[selected].date>=+ctl.effective&&Number.isFinite(+data[selected].npvDelta))econRow=data[selected];
  if(!econRow)econRow=data.find(d=>+d.date>=+ctl.effective&&Number.isFinite(+d.npvDelta))||null;
  const hurdle=econRow?+econRow.npvDelta:NaN;

  const cardW=Math.min(410,Math.max(330,(W-m.l-m.r)*.25));
  const cardH=78;
  const cardX=Math.max(m.l+10,Math.min(W-m.r-cardW-10,ex-cardW*.45));
  const cardY=m.t+52;

  svg.appendChild(ns('rect',{
    x:cardX,y:cardY,width:cardW,height:cardH,rx:7,
    fill:'#071321','fill-opacity':'.97',stroke:BLUE,'stroke-width':'1.4'
  }));

  const title=txt(cardX+12,cardY+20,`EARLY RESTRUCTURE · ${ctl.progress||'SCENARIO'}`,'','start');
  title.setAttribute('fill',BLUE_TEXT);title.setAttribute('font-size','12');title.setAttribute('font-weight','700');

  const state=txt(cardX+12,cardY+42,'RELOCATION ALTERNATIVE REMAINS ACTIVE','','start');
  state.setAttribute('fill','#c7d7e4');state.setAttribute('font-size','10');state.setAttribute('font-weight','700');

  const econ=txt(cardX+12,cardY+63,`MODELED VALUE OF CONTINUING · ${fmtMoney(hurdle)}`,'','start');
  econ.setAttribute('fill','#c7d7e4');econ.setAttribute('font-size','10');econ.setAttribute('font-weight','700');
}

export {drawRestructure};
