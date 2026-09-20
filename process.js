// Process timing and overlay renderer.
function drawProcess({x,m,W,H,x0,x1,win,svg,ns,txt}){
  const midpoint=(a,b)=>new Date((+a + +b)/2);
  const marketEnd=new Date('2028-07-01T00:00:00');
  const windowMid=midpoint(win.start,win.end);
  const strategicEnd=new Date(x0+(+marketEnd-x0)*0.20);
  const stages=[
    ['STRATEGIC PLANNING',new Date(x0),strategicEnd,.25,'#4ec6d2','2–3 months'],
    ['MARKET EVALUATION',strategicEnd,marketEnd,.36,'#7f98ad','through mid-2028'],
    ['TERM SHEET / LOI NEGOTIATIONS',marketEnd,windowMid,.48,'#16e6e9','through front half of window'],
    ['LEASE NEGOTIATIONS',windowMid,win.end,.58,'#57c3c1','back half of execution window'],
    ['DESIGN · PERMIT · CONSTRUCTION',win.end,new Date(x1),.68,'#d5a536','through model horizon']
  ];
  const defs=svg.querySelector('defs')||svg.insertBefore(ns('defs'),svg.firstChild);
  stages.forEach((p,i)=>{
    const a=Math.max(m.l,x(p[1])),b=Math.min(W-m.r,x(p[2]));if(b<=a)return;
    const yy=m.t+(H-m.t-32)*p[3],id='pg'+i,g=ns('linearGradient',{id,x1:'0%',y1:'0%',x2:'100%',y2:'0%'});
    g.appendChild(ns('stop',{offset:'0%','stop-color':p[4],'stop-opacity':'.10'}));
    g.appendChild(ns('stop',{offset:'50%','stop-color':p[4],'stop-opacity':'.34'}));
    g.appendChild(ns('stop',{offset:'100%','stop-color':p[4],'stop-opacity':'.10'}));defs.appendChild(g);
    svg.appendChild(ns('rect',{x:a,y:yy-8,width:b-a,height:16,rx:6,fill:`url(#${id})`,stroke:p[4],'stroke-width':'1.6','stroke-opacity':'.78'}));
    if(b-a>95){const t=txt((a+b)/2,yy-13,p[0],'proc','middle');t.setAttribute('fill',p[4])}
    if(b-a>180){const st=txt((a+b)/2,yy+21,p[5],'axis','middle');st.setAttribute('fill','#8ba0b0')}
  });
}

export { drawProcess };
