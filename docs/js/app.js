const els = {
  title: document.querySelector("#title"),
  desc: document.querySelector("#desc"),
  form: document.querySelector("#quiz"),
  result: document.querySelector("#result"),
  download: document.querySelector("#download")
};

let quizConfig = null;

function fmtDate(d = new Date()) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getSelectedScore(question) {
  if (question.type === "multi") {
    const checked = document.querySelectorAll(`input[name="${question.id}"]:checked`);
    let sum = 0;
    checked.forEach((el) => { sum += Number(el.value); });

    if (typeof question.maxScore === "number") {
      sum = Math.min(sum, question.maxScore);
    }
    return sum;
  }

  // default: single
  const checked = document.querySelector(`input[name="${question.id}"]:checked`);
  return checked ? Number(checked.value) : 0;
}


function computeScore() {
  return quizConfig.sections.reduce((sum, section) => {
    return sum + section.questions.reduce((s2, q) => s2 + getSelectedScore(q), 0);
  }, 0);
}


function pickThresholdOrNull(score) {
  const sorted = [...quizConfig.thresholds].sort((a, b) => a.minScore - b.minScore);

  // If they didn't reach the lowest threshold, no badge
  if (sorted.length === 0 || score < sorted[0].minScore) return null;

  // Otherwise pick the highest threshold they reached
  let chosen = sorted[0];
  for (const t of sorted) {
    if (score >= t.minScore) chosen = t;
  }
  return chosen;
}


function renderQuiz(cfg) {
  els.title.textContent = cfg.title;
  els.desc.textContent = cfg.description;

  let qNumber = 1;

  els.form.innerHTML = cfg.sections.map((section) => {
    const sectionHeader = `
      <div class="card section-card shadow-sm mb-3 mt-5">
        <div class="card-body">
          <h2 class="h5 mb-1">${section.title}</h2>
          ${section.description ? `<p class="text-muted mb-0">${section.description}</p>` : ""}
        </div>
      </div>
    `;

    const sectionQuestions = section.questions.map((q) => {
      const inputType = (q.type === "multi") ? "checkbox" : "radio";

      const answers = q.answers.map((a, i) => `
        <div class="form-check">
          <input
            class="form-check-input"
            type="${inputType}"
            name="${q.id}"
            id="${q.id}_${i}"
            value="${a.score}"
            ${(q.type !== "multi" && i === 0) ? "checked" : ""}>
          <label class="form-check-label" for="${q.id}_${i}">${a.text}</label>
        </div>
      `).join("");

      const block = `
        <div class="card mb-3">
          <div class="card-body">
            <div class="fw-semibold mb-2">${qNumber++}. ${q.prompt}</div>
            ${answers}
          </div>
        </div>
      `;
      return block;
    }).join("");

    return sectionHeader + sectionQuestions;
  }).join("");

  els.form.insertAdjacentHTML("beforeend", `
    <button type="submit" class="btn btn-primary mt-2">See result</button>
  `);
}



async function generateBadgeSvg({ title, level, dateStr, color }) {
  const res = await fetch("./badges/template.svg");
  const svgText = await res.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");

  const setText = (id, value) => {
    const node = doc.getElementById(id);
    if (node) node.textContent = value;
  };

  const circle = doc.getElementById("badgeCircle");
    if (circle && color) {
    circle.setAttribute("fill", color);
    }

  setText("badgeTitle", "Certified");
  setText("badgeLevel", level);
  setText("badgeDate", dateStr);

  const serialized = new XMLSerializer().serializeToString(doc);
  return serialized;
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function main() {
  const res = await fetch("./data/quiz.json");
  quizConfig = await res.json();

  renderQuiz(quizConfig);

  document.querySelector("#container").addEventListener("submit", async (e) => {
    if (e.target !== els.form) return;
    e.preventDefault();

    const score = computeScore();
    const th = pickThresholdOrNull(score);

    if (!th) {
        const min = Math.min(...quizConfig.thresholds.map(t => t.minScore));
        els.result.textContent = `Score: ${score}. You need ${min} to earn a badge.`;
        els.download.hidden = true;
        els.download.onclick = null; // clear any previous click handler
        return;
    }

    const dateStr = fmtDate();
    els.result.textContent = `Score: ${score} — Level: ${th.label}`;
    els.download.hidden = false;

    els.download.onclick = async () => {
        const svg = await generateBadgeSvg({
        title: quizConfig.title,
        level: th.badgeText ?? th.label,
        dateStr,
        color: th.badgeColor
        });

        const safeTitle = quizConfig.title.replace(/[^\w\-]+/g, "_");
        downloadFile(`${safeTitle}_${th.label}_${dateStr}.svg`, svg, "image/svg+xml");
    };
    });


}

main();
