export function processStages(x0,x1,win){
  const mid=(a,b)=>new Date((+a + +b)/2);
  return [
    {name:"STRATEGIC PLANNING",start:new Date(x0),end:new Date(2026,11,15),lane:.20,color:"#18d4d7",sub:"2–3 months"},
    {name:"MARKET EVALUATION",start:new Date(2026,11,15),end:new Date(2028,6,1),lane:.32,color:"#2e91ee",sub:"through Jul 2028"},
    {name:"TERM SHEET / LOI NEGOTIATIONS",start:new Date(2028,6,1),end:mid(win.start,win.end),lane:.45,color:"#16e6e9",sub:"front half of execution window"},
    {name:"LEASE NEGOTIATIONS",start:mid(win.start,win.end),end:win.end,lane:.58,color:"#50d37f",sub:"back half of execution window"},
    {name:"DESIGN · PERMIT · CONSTRUCTION",start:win.end,end:new Date(x1),lane:.70,color:"#f0b51c",sub:"through model horizon"}
  ];
}
export function drawProcess(svg,helpers,ctx){
  const {ns,txt}=helpers,{x,m,W,H,x0,x1,win}=ctx;
  const defs=svg.querySelector("defs")||svg.insertBefore(ns("defs"),svg.firstChild);
  processStages(x0,x1,win).forEach((p,i)=>{
    const xa=Math.max(m.l,x(p.start)),xb=Math.min(W-m.r,x(p.end));if(xb<=xa)return;
    const yy=m.t+(H-m.t-38)*p.lane,id=`processGradient${i}`;
    const g=ns("linearGradient",{id,x1:"0%",y1:"0%",x2:"100%",y2:"0%"});
    g.appendChild(ns("stop",{offset:"0%","stop-color":p.color,"stop-opacity":".18"}));
    g.appendChild(ns("stop",{offset:"50%","stop-color":p.color,"stop-opacity":".64"}));
    g.appendChild(ns("stop",{offset:"100%","stop-color":p.color,"stop-opacity":".20"}));
    defs.appendChild(g);

    svg.appendChild(ns("rect",{x:xa,y:yy-11,width:xb-xa,height:22,rx:8,fill:`url(#${id})`,stroke:p.color,"stroke-width":"2.2","stroke-opacity":".96"}));

    // subtle luminous inner line
    svg.appendChild(ns("line",{x1:xa+8,y1:yy,x2:xb-8,y2:yy,stroke:p.color,"stroke-width":"1.2","stroke-opacity":".85"}));

    if(xb-xa>95){const t=txt((xa+xb)/2,yy-17,p.name,"procTitle","middle");t.setAttribute("fill",p.color)}
    if(xb-xa>155){const s=txt((xa+xb)/2,yy+31,p.sub,"procSub","middle");s.setAttribute("fill","#e0e7ec")}
  });
}
