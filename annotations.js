// CHRONOS recovery compatibility module.
// Production annotation rendering is self-contained in index.html.
export function escapeHtml(v){ return String(v ?? ""); }
export function money(v){ return Number.isFinite(+v) ? String(v) : "—"; }
export function showPopup(){ return undefined; }
