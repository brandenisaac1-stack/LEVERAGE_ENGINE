export function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
export function money(v){return Number.isFinite(+v)?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(+v):"—"}
export function showPopup(popup,d,sx,sy,W,H,m,enabled=true){
  if(!enabled){popup.hidden=true;return}
  const info=[d.phase,d.action,d.chrono].filter(Boolean).join(" · ");
  popup.innerHTML=`<div class="title">${escapeHtml(d.iteration||"")}</div><div class="phase">${escapeHtml(info)}</div>
  <div class="metric"><span>Tenant leverage</span><strong>${d.tenant.toFixed(1)}</strong></div>
  <div class="metric"><span>Landlord leverage</span><strong>${d.landlord.toFixed(1)}</strong></div>
  ${d.alev!=null?`<div class="metric"><span>Action leverage</span><strong>${(+d.alev).toFixed(1)}</strong></div>`:""}
  ${d.rent!=null?`<div class="metric"><span>Effective rent</span><strong>$${(+d.rent).toFixed(2)}/SF</strong></div>`:""}
  ${d.wait!=null?`<div class="metric"><span>Net wait value</span><strong>${money(d.wait)}/day</strong></div>`:""}
  ${d.read?`<div class="read">${escapeHtml(d.read)}</div>`:""}`;
  popup.hidden=false;
  popup.style.left=Math.max(8,sx<W*.68?sx+15:sx-425)+"px";
  popup.style.top=Math.max(m.t+20,Math.min(H-250,sy-25))+"px";
}
