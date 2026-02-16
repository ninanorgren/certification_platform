const els = {
  title: document.querySelector("#title"),
  desc: document.querySelector("#desc"),
  form: document.querySelector("#quiz"),
  result: document.querySelector("#result"),
  download: document.querySelector("#download")
};

let quizConfig = null;
let lastScore = null;
let lastThreshold = null;


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
      <div class="section-header mb-3">
        <h3 class="fw-bold mb-1">${section.title}</h3>
        ${section.description ? `<p class="text-muted small mb-0">${section.description}</p>` : ""}
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
    <button type="submit" class="btn btn-custom mt-2"><b>See result</b></button>
  `);
}

function getAnswerTexts(question) {
  const inputs = Array.from(
    document.querySelectorAll(`input[name="${question.id}"]`)
  );

  const selectedTexts = [];

  inputs.forEach((input, index) => {
    if (input.checked) {
      selectedTexts.push(question.answers[index].text);
    }
  });

  return selectedTexts;
}




function buildResultsSummary(score, threshold) {
  const sections = quizConfig.sections.map((section) => ({
    title: section.title,
    description: section.description || "",
    questions: section.questions.map((q) => ({
      prompt: q.prompt,
      selectedAnswers: getAnswerTexts(q),
      points: getSelectedScore(q)
    }))
  }));

  return {
    title: quizConfig.title,
    date: fmtDate(),
    score,
    level: threshold ? (threshold.label) : null,
    sections
  };
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

function downloadResultsPdf(summary) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;

  let y = margin;

  const addLine = (text, fontSize = 11, bold = false, extraSpace = 6) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(fontSize);

    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += fontSize + 4;
    }
    y += extraSpace;
  };

  addLine(summary.title, 16, true, 10);
  addLine(`Date: ${summary.date}`, 11, false, 2);
  addLine(`Total score: ${summary.score}`, 11, false, 2);
  addLine(`Badge level: ${summary.level ?? "Not earned"}`, 11, false, 10);

  summary.sections.forEach((section) => {
    addLine(section.title, 13, true, 4);
    if (section.description) addLine(section.description, 10, false, 6);

    section.questions.forEach((q, idx) => {
      addLine(`${idx + 1}. ${q.prompt}`, 11, true, 2);
      const answers = q.selectedAnswers.length ? q.selectedAnswers.join(", ") : "No selection";
      addLine(`Answer(s): ${answers}`, 11, false, 1);
      addLine(`Points: ${q.points}`, 10, false, 6);
    });

    y += 6;
  });

  const safeTitle = summary.title.replace(/[^\w\-]+/g, "_");
  doc.save(`${safeTitle}_results_${summary.date}.pdf`);
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

    lastScore = score;
    lastThreshold = th;

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
        // 1) Download the badge SVG (unchanged)
        const svg = await generateBadgeSvg({
            title: quizConfig.title,
            level: th.badgeText ?? th.label,
            dateStr,
            color: th.badgeColor
        });

        const safeTitle = quizConfig.title.replace(/[^\w\-]+/g, "_");
        downloadFile(
            `${safeTitle}_${th.label}_${dateStr}.svg`,
            svg,
            "image/svg+xml"
        );

        // 2) Build results summary for PDF
        const summary = buildResultsSummary(lastScore, lastThreshold);


        // 3) Download the PDF with answers + score
        downloadResultsPdf(summary);
        };

    });
}

main();
