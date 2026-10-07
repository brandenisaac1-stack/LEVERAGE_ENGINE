// SCENARIO CONDITIONS — event-sensitive leverage/timing layer.
// Pure overlay: baseline series/window are never mutated.
// Smartsheet/ArcGIS remains the source of modeled/adjusted/verified X/Y impacts.

const DAY_MS = 86400000;
const PANEL_ID = 'conditionsPanel';
const TAB_ID = 'conditionsTab';

const CONDITION_DEFS = [
  {
    key:'rollover',
    label:'BUILDING ROLLOVER EXPOSURE',
    token:'ROLLOVER EXPOSURE'
  },
  {
    key:'capital',
    label:'CAPITAL / REFINANCING PRESSURE',
    token:'CAPITAL PRESSURE'
  },
  {
    key:'market',
    label:'MARKET COMPETITIVE PRESSURE',
    token:'MARKET PRESSURE'
  },
  {
    key:'alternative',
    label:'ALTERNATIVE EXECUTABILITY',
    token:'ALTERNATIVE EXECUTABILITY'
  },
  {
    key:'requirement',
    label:'REQUIREMENT FLEXIBILITY',
    token:'REQUIREMENT FLEXIBILITY'
  }
];

let state = Object.fromEntries(
  CONDITION_DEFS.map(
    d => [d.key, 0]
  )
);

let collapsed = false;


function clamp(v,a,b){
  return Math.max(
    a,
    Math.min(b,v)
  );
}


function clamp100(v){
  return clamp(
    Number.isFinite(+v)
      ?+v
      :0,
    0,
    100
  );
}


function finite(v,fallback=0){

  const n=+v;

  return Number.isFinite(n)
    ?n
    :fallback;
}


function fmtDate(d){

  return (
    `${String(d.getMonth()+1).padStart(2,'0')}/`+
    `${String(d.getDate()).padStart(2,'0')}/`+
    `${String(d.getFullYear()).slice(-2)}`
  );
}


function dayDiff(a,b){

  return Math.round(
    (+b-+a)/DAY_MS
  );
}


function normText(v){

  return String(v??'')
    .trim()
    .toUpperCase();
}


function hasCondition(row,def){

  return normText(
    row.conditionAdjuster
  ).includes(
    def.token
  );
}


function scenarioActive(){

  return Object.values(state)
    .some(
      v=>Math.abs(v)>1e-9
    );
}


function rowStateValue(row,axis){

  const active=
    finite(
      row[`condition${axis}Active`],
      NaN
    );

  if(Number.isFinite(active)){
    return active;
  }


  const verified=
    finite(
      row[`condition${axis}Verified`],
      NaN
    );

  if(Number.isFinite(verified)){
    return verified;
  }


  const adjusted=
    finite(
      row[`condition${axis}Adjusted`],
      NaN
    );

  if(Number.isFinite(adjusted)){
    return adjusted;
  }


  return finite(
    row[`condition${axis}Modeled`],
    0
  );
}


// Slider is a scenario multiplier around the
// workbook-resolved ACTIVE condition effect.
//
// 0 = exact workbook/model baseline.
// +100 = add one full active condition effect.
// -100 = reverse/remove one full active effect
// for sensitivity testing.
//
// IMPORTANT:
// Smartsheet has ALREADY applied the diminishing
// weighting distribution in CONDITION_X_MODELED
// and CONDITION_Y_MODELED.
// DO NOT reapply diminishing weights here.

function conditionMultiplier(key){

  return clamp(
    finite(state[key],0)/100,
    -1,
    1
  );
}


function rowScenarioImpact(row){

  const matched=
    CONDITION_DEFS.filter(
      def=>hasCondition(row,def)
    );


  if(!matched.length){

    return{
      xDays:0,
      yPoints:0
    };
  }


  const xBase=
    rowStateValue(
      row,
      'X'
    );

  const yBase=
    rowStateValue(
      row,
      'Y'
    );


  const n=
    matched.length;


  let xDays=0;
  let yPoints=0;


  for(const def of matched){

    const m=
      conditionMultiplier(
        def.key
      );


    // The row-level modeled/active impact has
    // already been diminishing-weighted upstream.
    //
    // Equal allocation here exists ONLY so the
    // individual UX controls can perturb the
    // appropriate applicable rows without
    // double-weighting the workbook mathematics.

    xDays+=
      (xBase/n)*m;

    yPoints+=
      (yBase/n)*m;
  }


  return{
    xDays,
    yPoints
  };
}


function interpolateImpact(
  date,
  data,
  axis
){

  const rows=
    data
      .filter(
        r=>
          r.date instanceof Date &&
          Number.isFinite(+r.date)
      )
      .map(
        r=>({
          date:+r.date,
          impact:
            rowScenarioImpact(r)[axis]
        })
      )
      .sort(
        (a,b)=>a.date-b.date
      );


  if(!rows.length){
    return 0;
  }


  const ms=+date;


  if(ms<=rows[0].date){
    return rows[0].impact;
  }


  if(ms>=rows.at(-1).date){
    return rows.at(-1).impact;
  }


  let lo=0;
  let hi=rows.length-1;


  while(hi-lo>1){

    const mid=
      (lo+hi)>>1;


    if(rows[mid].date<=ms){
      lo=mid;
    }else{
      hi=mid;
    }
  }


  const a=rows[lo];
  const b=rows[hi];

  const t=
    (ms-a.date)/
    (
      (b.date-a.date)||
      1
    );


  return(
    a.impact+
    (
      b.impact-a.impact
    )*t
  );
}


function interpolateSeries(
  series,
  ms,
  key
){

  if(ms<=+series[0].date){

    return finite(
      series[0][key]
    );
  }


  if(ms>=+series.at(-1).date){

    return finite(
      series.at(-1)[key]
    );
  }


  let lo=0;
  let hi=series.length-1;


  while(hi-lo>1){

    const mid=
      (lo+hi)>>1;


    if(+series[mid].date<=ms){
      lo=mid;
    }else{
      hi=mid;
    }
  }


  const a=series[lo];
  const b=series[hi];


  const t=
    (
      ms-+a.date
    )/
    (
      (+b.date-+a.date)||
      1
    );


  return(
    finite(a[key])+
    (
      finite(b[key])-
      finite(a[key])
    )*t
  );
}


function deriveWindow(
  series,
  baseWindow
){

  if(!series.length){

    return{
      start:
        new Date(
          +baseWindow.start
        ),

      end:
        new Date(
          +baseWindow.end
        )
    };
  }


  const values=
    series
      .map(
        p=>finite(p.plotTenant)
      )
      .filter(
        Number.isFinite
      );


  const peak=
    Math.max(
      ...values
    );


  const floor=
    Math.min(
      ...values
    );


  // Opportunity threshold.
  //
  // This intentionally derives the scenario window
  // FROM the resulting leverage geometry.
  //
  // Therefore the scenario window is capable of:
  // - shifting earlier
  // - shifting later
  // - compressing
  // - expanding
  //
  // without changing canonical Chart_dates.

  const threshold=
    peak-
    (
      peak-floor
    )*.22;


  const eligible=
    series.filter(
      p=>
        finite(
          p.plotTenant
        )>=threshold
    );


  if(eligible.length<2){

    return{
      start:
        new Date(
          +baseWindow.start
        ),

      end:
        new Date(
          +baseWindow.end
        )
    };
  }


  return{
    start:
      new Date(
        +eligible[0].date
      ),

    end:
      new Date(
        +eligible.at(-1).date
      )
  };
}


function applyConditionScenario({
  baselineP,
  data,
  baseWindow
}){

  // IMMUTABLE COPY.
  //
  // The existing modeled curve is NEVER modified.

  const baseSeries=
    baselineP.map(
      p=>({
        ...p,
        date:
          new Date(
            +p.date
          )
      })
    );


  // No slider movement =
  // EXACT EXISTING MODEL.

  if(!scenarioActive()){

    const peakPoint=
      baseSeries.reduce(
        (a,b)=>
          finite(b.plotTenant)>
          finite(a.plotTenant)
            ?b
            :a
      );


    return{
      active:false,

      series:
        baseSeries,

      window:{
        start:
          new Date(
            +baseWindow.start
          ),

        end:
          new Date(
            +baseWindow.end
          )
      },

      peak:
        clamp100(
          peakPoint.plotTenant
        ),

      peakDate:
        new Date(
          +peakPoint.date
        ),

      shiftDays:0,

      widthDeltaDays:0
    };
  }


  const xMin=
    +baseSeries[0].date;

  const xMax=
    +baseSeries.at(-1).date;


  const series=
    baseSeries.map(
      p=>{

        const xDays=
          interpolateImpact(
            p.date,
            data,
            'xDays'
          );


        const yPoints=
          interpolateImpact(
            p.date,
            data,
            'yPoints'
          );


        // X LOGIC
        // -----------------------------------------
        //
        // Negative X means leverage manifests EARLIER.
        //
        // We DO NOT alter Chart_dates.
        //
        // Instead we sample the immutable baseline
        // at a temporally displaced location.
        //
        // This shifts the leverage influence itself,
        // not the canonical transaction dates.

        const sourceMs=
          clamp(
            +p.date-
            (
              xDays*
              DAY_MS
            ),
            xMin,
            xMax
          );


        const tenantBase=
          interpolateSeries(
            baseSeries,
            sourceMs,
            'plotTenant'
          );


        const landlordBase=
          interpolateSeries(
            baseSeries,
            sourceMs,
            'plotLandlord'
          );


        // Y LOGIC
        // -----------------------------------------
        //
        // ABSOLUTE RULE:
        //
        // Tenant leverage can NEVER exceed 100
        // and can NEVER fall below 0.
        //
        // Same physical boundary is maintained
        // for landlord leverage.

        return{
          ...p,

          plotTenant:
            clamp100(
              tenantBase+
              yPoints
            ),

          plotLandlord:
            clamp100(
              landlordBase-
              yPoints
            )
        };
      }
    );


  // Recalculate the optimal execution window
  // FROM the transformed scenario curve.

  const window=
    deriveWindow(
      series,
      baseWindow
    );


  const peakPoint=
    series.reduce(
      (a,b)=>
        finite(b.plotTenant)>
        finite(a.plotTenant)
          ?b
          :a
    );


  const baseWidth=
    dayDiff(
      baseWindow.start,
      baseWindow.end
    );


  const scenarioWidth=
    dayDiff(
      window.start,
      window.end
    );


  return{
    active:true,

    series,

    window,

    peak:
      clamp100(
        peakPoint.plotTenant
      ),

    peakDate:
      new Date(
        +peakPoint.date
      ),

    shiftDays:
      dayDiff(
        baseWindow.start,
        window.start
      ),

    widthDeltaDays:
      scenarioWidth-
      baseWidth
  };
}


function resetConditionScenario(
  rerender
){

  for(
    const def of CONDITION_DEFS
  ){

    state[def.key]=0;
  }


  syncPanel();


  if(
    typeof rerender==='function'
  ){

    rerender();
  }
}


function syncPanel(){

  for(
    const def of CONDITION_DEFS
  ){

    const input=
      document.getElementById(
        `condition_${def.key}`
      );


    const value=
      document.getElementById(
        `condition_${def.key}_value`
      );


    if(input){

      input.value=
        String(
          state[def.key]
        );
    }


    if(value){

      value.textContent=
        state[def.key]===0
          ?'MODELED'
          :(
              `${state[def.key]>0?'+':''}`+
              `${state[def.key]}%`
            );
    }
  }
}


function ensureConditionsPanel({
  mount,
  rerender,
  getSummary
}={}){

  const host=
    mount||
    document.getElementById(
      'conditionsMount'
    )||
    document.getElementById(
      'wrap'
    );


  if(!host){
    return null;
  }


  let panel=
    document.getElementById(
      PANEL_ID
    );


  if(panel){
    return panel;
  }


  const tab=
    document.createElement(
      'button'
    );


  tab.id=
    TAB_ID;

  tab.className=
    'conditions-tab';

  tab.textContent=
    'CONDITIONS';


  panel=
    document.createElement(
      'aside'
    );


  panel.id=
    PANEL_ID;

  panel.className=
    'conditions-panel';


  panel.innerHTML=
    '<div class="conditions-head">'+
      '<strong>SCENARIO CONDITIONS</strong>'+
      '<button type="button" class="conditions-collapse" aria-label="Collapse conditions">◀</button>'+
    '</div>'+
    '<div class="conditions-body"></div>'+
    '<div class="condition-impact" id="conditionImpact"></div>'+
    '<button type="button" class="conditions-reset">RESET TO MODELED</button>';


  const body=
    panel.querySelector(
      '.conditions-body'
    );


  for(
    const def of CONDITION_DEFS
  ){

    const row=
      document.createElement(
        'div'
      );


    row.className=
      'condition-row';


    row.innerHTML=
      '<div class="condition-row-head">'+
        `<span>${def.label}</span>`+
        `<strong id="condition_${def.key}_value">MODELED</strong>`+
      '</div>'+
      `<input class="condition-slider" id="condition_${def.key}" type="range" min="-100" max="100" step="1" value="0">`;


    const input=
      row.querySelector(
        'input'
      );


    input.addEventListener(
      'input',
      ()=>{

        state[def.key]=
          +input.value;


        syncPanel();


        if(
          typeof rerender==='function'
        ){

          rerender();
        }
      }
    );


    body.appendChild(
      row
    );
  }


  const refreshSummary=
    ()=>{

      const el=
        document.getElementById(
          'conditionImpact'
        );


      if(!el){
        return;
      }


      const s=
        typeof getSummary==='function'
          ?getSummary()
          :null;


      if(!s){

        el.textContent=
          scenarioActive()
            ?'SCENARIO ACTIVE'
            :'BASE MODEL ACTIVE';

        return;
      }


      el.innerHTML=
        '<div>'+
          '<span>PEAK</span>'+
          `<strong>${Number.isFinite(+s.peak)?(+s.peak).toFixed(1):'—'}</strong>`+
        '</div>'+
        '<div>'+
          '<span>WINDOW</span>'+
          `<strong>${s.window?`${fmtDate(s.window.start)} – ${fmtDate(s.window.end)}`:'—'}</strong>`+
        '</div>'+
        '<div>'+
          '<span>WIDTH Δ</span>'+
          `<strong>${Number.isFinite(+s.widthDeltaDays)?`${s.widthDeltaDays>0?'+':''}${s.widthDeltaDays} DAYS`:'—'}</strong>`+
        '</div>';
    };


  panel.refreshSummary=
    refreshSummary;


  panel
    .querySelector(
      '.conditions-reset'
    )
    .addEventListener(
      'click',
      ()=>{

        resetConditionScenario(
          ()=>{

            if(
              typeof rerender==='function'
            ){

              rerender();
            }
          }
        );
      }
    );


  panel
    .querySelector(
      '.conditions-collapse'
    )
    .addEventListener(
      'click',
      ()=>{

        collapsed=true;

        panel.classList.add(
          'collapsed'
        );

        tab.classList.add(
          'visible'
        );
      }
    );


  tab.addEventListener(
    'click',
    ()=>{

      collapsed=false;

      panel.classList.remove(
        'collapsed'
      );

      tab.classList.remove(
        'visible'
      );
    }
  );


  host.append(
    tab,
    panel
  );


  syncPanel();
  refreshSummary();


  return panel;
}


function getConditionScenarioState(){

  return{
    ...state
  };
}


export {
  CONDITION_DEFS,
  ensureConditionsPanel,
  applyConditionScenario,
  resetConditionScenario,
  getConditionScenarioState
};