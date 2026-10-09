// EARLY RESTRUCTURE — dependent scenario layer.
// Receives the already-adjusted tenant/landlord environment from app.js.

// SAVILLS PRESENTATION SYSTEM
const RESTRUCTURE='#097CE8';
const RESTRUCTURE_TEXT='#5DA5EE';
const SAVILLS_NAVY='#25273A';
const SAVILLS_NAVY_DEEP='#1B1D2C';
const SAVILLS_YELLOW='#FFDF00';
const SAVILLS_WHITE='#FFFFFF';
const SAVILLS_STEEL='#D7DADE';

let commitmentOverride=null;
const PANEL_ID='restructureCommitmentPanel';

function vd(v){
  if(v instanceof Date)return Number.isFinite(+v)?new Date(+v):null;
  if(v==null||v==='')return null;
  const d=new Date(v);
  return Number.isFinite(+d)?d:null
}

function cash(v){
  return Number.isFinite(+v)
    ?new Intl.NumberFormat('en-US',{
        style:'currency',
        currency:'USD',
        maximumFractionDigits:0
      }).format(+v)
    :'—'
}

function clamp(v,a=0,b=1){
  return Math.max(a,Math.min(b,v))
}

function smooth(v){
  v=clamp(v);
  return v*v*(3-2*v)
}

function pct(raw){
  const m=String(raw??'').match(/(\d+(?:\.\d+)?)\s*%/);
  return m?clamp(+m[1],0,100):0
}

function label(raw){
  const s=String(raw??'').trim(),i=s.indexOf('-');
  return (i>=0?s.slice(i+1):s||'TEST').trim().toUpperCase()
}

function interp(P,ms){
  if(!P.length)return null;
  if(ms<=+P[0].date)return +P[0].plotTenant;
  if(ms>=+P.at(-1).date)return +P.at(-1).plotTenant;

  let a=0,b=P.length-1;

  while(b-a>1){
    const n=(a+b)>>1;
    if(+P[n].date<=ms)a=n;
    else b=n
  }

  const p=P[a],q=P[b];
  const t=(ms-+p.date)/((+q.date-+p.date)||1);

  return +p.plotTenant+(+q.plotTenant-+p.plotTenant)*t
}

function path(pts){
  if(pts.length<2)return'';

  let d=`M ${pts[0][0]} ${pts[0][1]}`;

  for(let i=0;i<pts.length-1;i++){
    const p0=pts[Math.max(0,i-1)];
    const p1=pts[i];
    const p2=pts[i+1];
    const p3=pts[Math.min(pts.length-1,i+2)];

    d+=` C ${p1[0]+(p2[0]-p0[0])/6} ${p1[1]+(p2[1]-p0[1])/6}, ${p2[0]-(p3[0]-p1[0])/6} ${p2[1]-(p3[1]-p1[1])/6}, ${p2[0]} ${p2[1]}`
  }

  return d
}

function controls(data){
  const progress=String(
    data.find(d=>String(d.restructureProgress??'').trim())
      ?.restructureProgress??'0% - TEST'
  ).trim();

  const explicit=data
    .map(d=>vd(d.restructureEffectiveDate))
    .find(Boolean);

  const fallback=vd(
    data.find(
      d=>String(d.processStage??'')
        .toUpperCase()
        .includes('RESTRUCTURE')
    )?.date
  );

  return {
    progress,
    effective:explicit||fallback
  }
}

function removePanel(){
  document.getElementById(PANEL_ID)?.remove();
  commitmentOverride=null
}

function retainedForCommitment(pct){
  const p=Math.max(0,Math.min(100,+pct));

  const a=[
    [0,1],
    [25,.95],
    [50,.75],
    [75,.35],
    [100,0]
  ];

  for(let i=0;i<a.length-1;i++){
    const [p0,r0]=a[i];
    const [p1,r1]=a[i+1];

    if(p<=p1){
      const t=(p-p0)/(p1-p0);
      return r0+(r1-r0)*t
    }
  }

  return 0
}

function focusedMilestones({
  data,
  x,
  m,
  W,
  svg,
  ns,
  txt,
  focusBounds
}){
  if(!focusBounds)return;

  const start=new Date(+focusBounds.start);
  const end=new Date(+focusBounds.end);

  if(
    !Number.isFinite(+start)||
    !Number.isFinite(+end)||
    +end<=+start
  )return;

  // The two restructure columns are independent ordered milestone inputs.
  // Do NOT require date + phase to survive on the same chart-data row.
  const dates=[];

  for(const d of data){
    const dt=d.restructureDateBreakout;

    if(
      dt instanceof Date&&
      Number.isFinite(+dt)&&
      +dt>=+start&&
      +dt<=+end
    ){
      if(!dates.some(v=>+v===+dt)){
        dates.push(new Date(+dt))
      }
    }
  }

  dates.sort((a,b)=>a-b);

  const phases=[];
  const seen=new Set();

  for(const d of data){
    const phase=String(
      d.restructureActionPhase??''
    ).trim();

    if(!phase)continue;

    const key=phase.toUpperCase();

    if(seen.has(key))continue;

    seen.add(key);
    phases.push(phase)
  }

  // Parent bar always renders. Internal phases render only when the two new
  // columns provide enough ordered information to define real intervals.
  const masterY=m.t+118;
  const masterH=14;
  const phaseY=masterY+38;
  const phaseH=30;

  const left=x(start);
  const right=x(end);
  const width=Math.max(2,right-left);

  svg.appendChild(
    ns('rect',{
      x:left,
      y:masterY,
      width,
      height:masterH,
      rx:7,
      fill:SAVILLS_NAVY,
      'fill-opacity':'.88',
      stroke:RESTRUCTURE,
      'stroke-width':'1.6'
    })
  );

  const master=txt(
    (left+right)/2,
    masterY-9,
    'EARLY RESTRUCTURE EXPLORATION',
    '',
    'middle'
  );

  master.setAttribute('fill',RESTRUCTURE_TEXT);
  master.setAttribute('font-size','18');
  master.setAttribute('font-weight','700');

  const dateLine=txt(
    (left+right)/2,
    masterY+masterH+15,
    `${fmtDate(start)} – ${fmtDate(end)}`,
    '',
    'middle'
  );

  dateLine.setAttribute('fill',SAVILLS_STEEL);
  dateLine.setAttribute('font-size','14');
  dateLine.setAttribute('font-weight','600');

  if(!dates.length||!phases.length)return;

  // Each action phase starts at its ordered breakout date. The final phase
  // closes at the focused end boundary, so no extra label row is required.
  const starts=dates.filter(d=>+d<+end);
  const count=Math.min(phases.length,starts.length);

  if(!count)return;

  const colors=[
  '#097CE8',
  '#5DA5EE',
  '#6CA7B1',
  '#238291',
  '#A1A7AD'
];

  for(let i=0;i<count;i++){
    const a=starts[i];
    const b=i+1<starts.length
      ?starts[i+1]
      :end;

    if(+b<=+a)continue;

    const x1=x(a);
    const x2=x(b);
    const w=Math.max(2,x2-x1);
    const c=colors[i%colors.length];

    svg.appendChild(
      ns('rect',{
        x:x1+1,
        y:phaseY,
        width:Math.max(2,w-2),
        height:phaseH,
        rx:5,
        fill:c,
        'fill-opacity':'.13',
        stroke:c,
        'stroke-width':'1.5'
      })
    );

    const phase=phases[i];

    const title=txt(
      (x1+x2)/2,
      phaseY+12,
      phase,
      '',
      'middle'
    );

    title.setAttribute('fill',c);
    title.setAttribute(
      'font-size',
      w<210?'9':w<320?'14':'16'
    );
    title.setAttribute('font-weight','700');

    const datesText=txt(
      (x1+x2)/2,
      phaseY+25,
      `${fmtDate(a)} – ${fmtDate(new Date(+b-86400000))}`,
      '',
      'middle'
    );

    datesText.setAttribute('fill',SAVILLS_STEEL);
    datesText.setAttribute('font-size','12');
    datesText.setAttribute('font-weight','600');

    svg.appendChild(
      ns('line',{
        x1:x1,
        y1:masterY-4,
        x2:x1,
        y2:phaseY+phaseH+5,
        stroke:c,
        'stroke-width':'1',
        'stroke-dasharray':'3 3',
        opacity:'.60'
      })
    )
  }

  svg.appendChild(
    ns('line',{
      x1:right,
      y1:masterY-4,
      x2:right,
      y2:phaseY+phaseH+5,
      stroke:colors[(count-1)%colors.length],
      'stroke-width':'1',
      'stroke-dasharray':'3 3',
      opacity:'.60'
    })
  )
}

function fmtDate(d){
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`
}

function drawRestructure({
  enabled,
  data,
  plottedSeries,
  x,
  y,
  m,
  W,
  H,
  base,
  svg,
  ns,
  txt,
  selected=-1,
  scenarioEconomics,
  focused=false,
  focusBounds=null
}){
  if(!enabled){
    removePanel();
    return
  }

  if(
    !Array.isArray(data)||
    !data.length||
    !Array.isArray(plottedSeries)||
    !plottedSeries.length
  )return;

  const P=plottedSeries;
  const ctl=controls(data);

  if(!ctl.effective)return;

  if(focused){
    focusedMilestones({
      data,
      x,
      m,
      W,
      svg,
      ns,
      txt,
      focusBounds
    })
  }

  const sourcePct=pct(ctl.progress);

    // No interactive commitment override.
  // Preserve the workbook's modeled commitment.
  removePanel();

    const commitment=clamp(sourcePct,0,100);

  const retained=retainedForCommitment(commitment);
  const start=+ctl.effective;
  const end=+P.at(-1).date;
  const baseline0=interp(P,start);

  if(!Number.isFinite(baseline0))return;

  const scenario=[];

  if(commitment<100){
    for(let i=0;i<320;i++){
      const t=i/319;
      const ms=start+(end-start)*t;
      const b=interp(P,ms);
      const fade=smooth(Math.min(1,t/.22));
      const ret=1-(1-retained)*fade;
      const up=Math.max(0,b-baseline0);

      scenario.push({
        date:new Date(ms),
        value:Math.min(b,b-up*(1-ret))
      })
    }
  }

  if(scenario.length>1){
    svg.appendChild(
      ns('path',{
        d:path(
          scenario.map(
            p=>[x(p.date),y(p.value)]
          )
        ),
        fill:'none',
        stroke:RESTRUCTURE,
        'stroke-width':'2.5',
        'stroke-dasharray':'8 5',
        opacity:'.98'
      })
    )
  }

  const ex=x(ctl.effective);

  svg.appendChild(
    ns('line',{
      x1:ex,
      y1:m.t+52,
      x2:ex,
      y2:base,
      stroke:RESTRUCTURE,
      'stroke-width':'1.5',
      'stroke-dasharray':'4 4'
    })
  );

  svg.appendChild(
    ns('circle',{
      cx:ex,
      cy:y(baseline0),
      r:5,
      fill:RESTRUCTURE,
      stroke:SAVILLS_WHITE,
      'stroke-width':'1.5'
    })
  );
}

export {drawRestructure};