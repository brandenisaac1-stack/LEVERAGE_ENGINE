// Live Decision Intelligence renderer.
// Presentation only.
// All analytical logic is resolved upstream in Smartsheet / ArcGIS.

const MODULES = [
  {
    key: "workforce",
    number: "01",
    category: "WORKFORCE",
    question: "Are our people pulling the decision forward?",
    pct: "ldiWorkforcePct",
    explanation: "ldiWorkforceExplanation"
  },
  {
    key: "counterparty",
    number: "02",
    category: "COUNTERPARTY ECONOMICS",
    question: "Is the landlord becoming more motivated?",
    pct: "ldiCounterpartyPct",
    explanation: "ldiCounterpartyExplanation"
  },
  {
    key: "enterprise",
    number: "03",
    category: "ENTERPRISE ECONOMICS",
    question: "What is waiting costing us?",
    pct: "ldiEnterprisePct",
    explanation: "ldiEnterpriseExplanation"
  },
  {
    key: "optionality",
    number: "04",
    category: "OPTIONALITY",
    question: "Are our choices getting better or worse?",
    pct: "ldiOptionalityPct",
    explanation: "ldiOptionalityExplanation"
  }
];

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function pctDisplay(value) {
  const number = finiteNumber(value);

  if (number === null) {
    return {
      text: "—",
      direction: "neutral"
    };
  }

  const absolutePercent = Math.abs(number * 100);

  if (absolutePercent < 0.05) {
    return {
      text: "0.0%",
      direction: "neutral"
    };
  }

  return {
    text:
      (number > 0 ? "↑ " : "↓ ") +
      absolutePercent.toFixed(1) +
      "%",
    direction:
      number > 0
        ? "up"
        : "down"
  };
}

function cleanText(
  value,
  fallback = "No material change identified."
) {
  const text = String(value ?? "").trim();

  return text || fallback;
}

function alignmentDisplay(value) {
  const number = finiteNumber(value);

  if (number === null) {
    return "—";
  }

  return (
    Math.max(
      0,
      Math.min(100, number)
    ).toFixed(0) + "%"
  );
}

function make(
  tag,
  className,
  text
) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

function driverModule(
  definition,
  data
) {
  const percentage = pctDisplay(
    data?.[definition.pct]
  );

  const module = make(
    "section",
    "ldi-module ldi-" + definition.key
  );

  module.dataset.direction =
    percentage.direction;

  const eyebrow = make(
    "div",
    "ldi-eyebrow"
  );

  eyebrow.append(
    make(
      "span",
      "ldi-number",
      definition.number
    ),
    make(
      "span",
      "ldi-category",
      definition.category
    )
  );

  const question = make(
    "div",
    "ldi-question",
    definition.question
  );

  const movement = make(
    "div",
    "ldi-movement " +
      percentage.direction,
    percentage.text
  );

  const explanation = make(
    "div",
    "ldi-explanation",
    cleanText(
      data?.[definition.explanation]
    )
  );

  module.append(
    eyebrow,
    question,
    movement,
    explanation
  );

  return module;
}

function captureModule(data) {
  const percentage = pctDisplay(
    data?.ldiCapturePct
  );

  const rawState = String(
    data?.ldiCaptureState ?? ""
  )
    .trim()
    .toUpperCase();

  const state =
    rawState || "STABLE";

  const module = make(
    "section",
    "ldi-module ldi-capture"
  );

  module.dataset.direction =
    percentage.direction;

  const eyebrow = make(
    "div",
    "ldi-eyebrow"
  );

  eyebrow.append(
    make(
      "span",
      "ldi-number",
      "05"
    ),
    make(
      "span",
      "ldi-category",
      "EXPECTED LEVERAGE CAPTURE"
    )
  );

  const movementWrap = make(
    "div",
    "ldi-capture-movement"
  );

  movementWrap.append(
    make(
      "div",
      "ldi-movement " +
        "ldi-movement-primary " +
        percentage.direction,
      percentage.text
    ),
    make(
      "div",
      "ldi-vs-base",
      "VS. BASE STATE"
    )
  );

  const stateClass =
    state
      .toLowerCase()
      .replace(/[^a-z]+/g, "-");

  const stateElement = make(
    "div",
    "ldi-state ldi-state-" +
      stateClass,
    "POSITION " + state
  );

  const explanation = make(
    "div",
    "ldi-explanation " +
      "ldi-capture-explanation",
    cleanText(
      data?.ldiCaptureExplanation
    )
  );

  const alignment = make(
    "div",
    "ldi-alignment"
  );

  alignment.append(
    make(
      "span",
      "ldi-alignment-label",
      "MODEL ALIGNMENT"
    ),
    make(
      "strong",
      "ldi-alignment-value",
      alignmentDisplay(
        data?.ldiModelAlignment
      )
    )
  );

  module.append(
    eyebrow,
    movementWrap,
    stateElement,
    explanation,
    alignment
  );

  return module;
}

function renderIntelligence(
  container,
  data = {}
) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  container.classList.add(
    "live-intelligence"
  );

  const header = make(
    "div",
    "ldi-header"
  );

  const heading = make(
    "div",
    "ldi-heading",
    "LIVE DECISION INTELLIGENCE"
  );

    const basis = make(
    "div",
    "ldi-basis",
    "LIVE MOVEMENT VS. BASE STATE"
  );

  header.append(
    heading,
    basis
  );

  const sequence = make(
    "div",
    "ldi-sequence"
  );

  MODULES.forEach(
    (definition, index) => {
      sequence.appendChild(
        driverModule(
          definition,
          data
        )
      );

      if (
        index <
        MODULES.length - 1
      ) {
        const connector = make(
          "div",
          "ldi-connector",
          "›"
        );

        connector.setAttribute(
          "aria-hidden",
          "true"
        );

        sequence.appendChild(
          connector
        );
      }
    }
  );

  const finalConnector = make(
    "div",
    "ldi-connector " +
      "ldi-connector-final",
    "›"
  );

  finalConnector.setAttribute(
    "aria-hidden",
    "true"
  );

  sequence.appendChild(
    finalConnector
  );

  sequence.appendChild(
    captureModule(data)
  );

  container.append(
    header,
    sequence
  );
}

export {
  renderIntelligence
};