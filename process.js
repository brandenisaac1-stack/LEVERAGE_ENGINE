export function processStages(x0,x1,win){
  const mid=(a,b)=>new Date((+a + +b)/2);
  return [
    {name:"STRATEGIC PLANNING",start:new Date(x0),end:new Date(2026,11,15),lane:.22,color:"#18d4d7",sub:"2–3 months"},
    {name:"MARKET EVALUATION",start:new Date(2026,11,15),end:new Date(2028,6,1),lane:.34,color:"#388fd0",sub:"through Jul 2028"},
    {name:"TERM SHEET / LOI NEGOTIATIONS",start:new Date(2028,6,1),end:mid(win.start,win.end),lane:.47,color:"#16e6e9",sub:"front half of execution window"},
    {name:"LEASE NEGOTIATIONS",start:mid(win.start,win.end),end:win.end,lane:.59,color:"#49be85",sub:"back half of execution window"},
    {name:"DESIGN · PERMIT · CONSTRUCTION",start:win.end,end:new Date(x1),lane:.70,color:"#d5a536",sub:"through model horizon"}
  ];
}
export function drawProcess(svg,helpers,ctx){
  const {ns,txt}=helpers,{x,m,W,H,x0,x1,win}=ctx;
  const defs=svg.querySelector("defs")||svg.insertBefore(ns("defs"),svg.firstChild);
  processStages(x0,x1,win).forEach((p,i)=>{
    const xa=Math.max(m.l,x(p.start)),xb=Math.min(W-m.r,x(p.end)); if(xb<=xa)return;
    const yy=m.t+(H-m.t-34)*p.lane,id=`processGradient${i}`;
    const g=ns("linearGradient",{id,x1:"0%",y1:"0%",x2:"100%",y2:"0%"});
    g.appendChild(ns("stop",{offset:"0%","stop-color":p.color,"stop-opacity":".12"}));
    g.appendChild(ns("stop",{offset:"45%","stop-color":p.color,"stop-opacity":".46"}));
    g.appendChild(ns("stop",{offset:"100%","stop-color":p.color,"stop-opacity":".13"}));
    defs.appendChild(g);
    svg.appendChild(ns("rect",{x:xa,y:yy-10,width:xb-xa,height:20,rx:6,fill:`url(#${id})`,stroke:p.color,"stroke-width":"1.8","stroke-opacity":".9"}));
    if(xb-xa>105){const t=txt((xa+xb)/2,yy-15,p.name,"procTitle","middle");t.setAttribute("fill",p.color)}
    if(xb-xa>165){const s=txt((xa+xb)/2,yy+28,p.sub,"procSub","middle");s.setAttribute("fill","#d2dce3")}
  });
}
