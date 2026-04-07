const sample = [{ id: "P1", arrival: 0, burst: 3, priority: 5 }, { id: "P2", arrival: 2, burst: 6, priority: 3 }, { id: "P3", arrival: 4, burst: 4, priority: 1 }, { id: "P4", arrival: 6, burst: 5, priority: 4 }, { id: "P5", arrival: 8, burst: 2, priority: 2 }];
const names = { FCFS: "FCFS", SJF: "SJF (Non-Preemptive)", SRTF: "SRTF (Preemptive)", RR: "Round Robin", PRIORITY_NP: "Priority (Non-Preemptive)", PRIORITY_P: "Priority (Preemptive)" };
const el = {
  processCount: document.getElementById("processCount"),
  algorithmSelect: document.getElementById("algorithmSelect"),
  timeQuantum: document.getElementById("timeQuantum"),

  processTableBody: document.getElementById("processTableBody"),

  startBtn: document.getElementById("startBtn"),
  previousBtn: document.getElementById("previousBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  resumeBtn: document.getElementById("resumeBtn"),
  resetBtn: document.getElementById("resetBtn"),

  loadSampleBtn: document.getElementById("loadSampleBtn"),
  applyCountBtn: document.getElementById("applyCountBtn"),
  addRowBtn: document.getElementById("addRowBtn"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  themeToggleIcon: document.getElementById("themeToggleIcon"),
  themeToggleText: document.getElementById("themeToggleText"),

  ganttChart: document.getElementById("ganttChart"),
  readyQueue: document.getElementById("readyQueue"),
  queueCountLabel: document.getElementById("queueCountLabel"),

  currentTimeLabel: document.getElementById("currentTimeLabel"),
  cpuCard: document.getElementById("cpuCard"),
  cpuProcessLabel: document.getElementById("cpuProcessLabel"),
  cpuMetaLabel: document.getElementById("cpuMetaLabel"),

  metricsTableBody: document.getElementById("metricsTableBody"),
  summaryCards: document.getElementById("summaryCards"),

  algorithmBadge: document.getElementById("algorithmBadge"),
  statusBadge: document.getElementById("statusBadge")
};
const state = { timer: null, paused: false, running: false, frame: 0, result: null }, colors = {}, delay = 1400;
const themeStorageKey = "cpu-scheduling-theme";
const cmp = {
  arrival: (a, b) => a.arrival - b.arrival || a.i - b.i,
  burst: (a, b) => a.burst - b.burst || cmp.arrival(a, b),
  remaining: (a, b) => a.remaining - b.remaining || cmp.arrival(a, b),
  priority: (a, b) => a.priority - b.priority || cmp.arrival(a, b),
  priorityRemaining: (a, b) => a.priority - b.priority || a.remaining - b.remaining || cmp.arrival(a, b)
};
const color = (id) => (colors[id] ??= `hsl(${Object.keys(colors).length * 61 % 360}, 68%, 52%)`);
const setStatus = (text) => { el.statusBadge.textContent = text; };
const syncCount = () => { el.processCount.value = el.processTableBody.children.length || 1; };
const stop = () => { clearTimeout(state.timer); state.timer = null; };
const systemTheme = () => window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
function updateThemeButton(theme) {
  const dark = theme === "dark";
  el.themeToggleBtn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  el.themeToggleIcon.textContent = dark ? "☀️" : "🌙";
  el.themeToggleText.textContent = dark ? "Light Mode" : "Dark Mode";
}
function applyTheme(theme, persist = true) {
  document.documentElement.setAttribute("data-theme", theme);
  updateThemeButton(theme);
  if (persist) localStorage.setItem(themeStorageKey, theme);
}
function initTheme() {
  applyTheme(localStorage.getItem(themeStorageKey) || systemTheme(), false);
}
function row(p = {}, n = el.processTableBody.children.length + 1) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td><input type="text" class="pid-input" value="${p.id ?? `P${n}`}"></td>
    <td><input type="number" class="arrival-input" min="0" value="${p.arrival ?? 0}"></td>
    <td><input type="number" class="burst-input" min="1" value="${p.burst ?? 1}"></td>
    <td><input type="number" class="priority-input" min="1" value="${p.priority ?? 1}"></td>
    <td><button type="button" class="remove-row-btn">Remove</button></td>`;
  tr.querySelector("button").onclick = () => { tr.remove(); syncCount(); };
  return tr;
}
const renderTable = (list) => { el.processTableBody.innerHTML = ""; list.forEach((p, i) => el.processTableBody.appendChild(row(p, i + 1))); syncCount(); };
const resizeTable = () => {
  const want = Math.max(1, Number(el.processCount.value) || 1);
  while (el.processTableBody.children.length < want) el.processTableBody.appendChild(row());
  while (el.processTableBody.children.length > want) el.processTableBody.lastElementChild.remove();
  syncCount();
};
const readTable = () => [...el.processTableBody.rows].map((tr, i) => ({ id: tr.querySelector(".pid-input").value.trim() || `P${i + 1}`, arrival: Math.max(0, Number(tr.querySelector(".arrival-input").value) || 0), burst: Math.max(1, Number(tr.querySelector(".burst-input").value) || 1), priority: Math.max(1, Number(tr.querySelector(".priority-input").value) || 1), i }));
const segments = (frames) => {
  const out = [];
  for (const f of frames) {
    const id = f.running?.id || "IDLE", last = out[out.length - 1];
    last?.id === id ? (last.end = f.time + 1) : out.push({ id, start: f.time, end: f.time + 1 });
  }
  return out;
};

function simulate(algorithm, list, quantum) {
  const all = list.map((p) => ({ ...p, remaining: p.burst, completion: 0, waiting: 0, turnaround: 0, inQueue: false })).sort(cmp.arrival);
  const frames = [], done = [], queue = [];
  let time = 0, next = 0, current = null, slice = 0;
  const enqueue = () => {
    while (next < all.length && all[next].arrival <= time) {
      const p = all[next++];
      if (!p.inQueue && p !== current && p.remaining > 0) { p.inQueue = true; queue.push(p); }
    }
  };
  const take = (sorter) => { queue.sort(sorter); current = queue.shift() || null; if (current) current.inQueue = false; };
  while (done.length < all.length) {
    enqueue();
    const sorter = !current && ({ FCFS: cmp.arrival, SJF: cmp.burst, PRIORITY_NP: cmp.priority })[algorithm];
    if (sorter) take(sorter);
    if (algorithm === "RR" && !current) { current = queue.shift() || null; if (current) current.inQueue = false; slice = 0; }
    if (algorithm === "SRTF" || algorithm === "PRIORITY_P") {
      const pool = current ? [...queue, current] : [...queue];
      pool.sort(algorithm === "SRTF" ? cmp.remaining : cmp.priorityRemaining);
      const best = pool[0] || null;
      if (best && best !== current) {
        if (current) { current.inQueue = true; queue.push(current); }
        current = best;
        const at = queue.indexOf(best);
        if (at >= 0) queue.splice(at, 1);
        current.inQueue = false;
      }
    }
    frames.push({ time, running: current ? { id: current.id, remaining: current.remaining, priority: current.priority } : null, queue: queue.filter((p) => p !== current).map(({ id, remaining, priority, arrival }) => ({ id, remaining, priority, arrival })) });
    if (!current) { time += 1; continue; }
    current.remaining -= 1;
    time += 1;
    if (algorithm === "RR") slice += 1;
    enqueue();
    if (current.remaining === 0) {
      current.completion = time;
      current.turnaround = time - current.arrival;
      current.waiting = current.turnaround - current.burst;
      done.push(current);
      current = null;
      slice = 0;
      continue;
    }
    if (algorithm === "RR" && slice >= quantum) { current.inQueue = true; queue.push(current); current = null; slice = 0; }
  }
  done.sort(cmp.arrival);
  return {
    algorithm,
    frames,
    segments: segments(frames),
    processes: done,
    summary: {
      totalCompletion: Math.max(0, ...done.map((p) => p.completion)),
      avgWaiting: done.reduce((s, p) => s + p.waiting, 0) / done.length || 0,
      avgTurnaround: done.reduce((s, p) => s + p.turnaround, 0) / done.length || 0
    }
  };
}

function renderQueue(list) {
  el.readyQueue.innerHTML = "";
  el.queueCountLabel.textContent = `${list.length} process${list.length === 1 ? "" : "es"}`;
  if (!list.length) return (el.readyQueue.className = "queue-strip empty"), (el.readyQueue.textContent = "Ready queue is empty");
  el.readyQueue.className = "queue-strip";
  list.forEach((p) => {
    const pill = document.createElement("div");
    pill.className = "queue-pill";
    pill.style.background = color(p.id);
    pill.textContent = `${p.id} | RT ${p.remaining}`;
    el.readyQueue.appendChild(pill);
  });
}

const renderCpu = (frame) => {
  el.currentTimeLabel.textContent = `Time: ${frame?.time ?? 0}`;
  if (!frame?.running) return (el.cpuCard.className = "cpu-card idle"), (el.cpuProcessLabel.textContent = "Idle"), (el.cpuMetaLabel.textContent = "Waiting for simulation to begin");
  el.cpuCard.className = "cpu-card active";
  el.cpuProcessLabel.textContent = frame.running.id;
  el.cpuMetaLabel.textContent = `Remaining Burst Time: ${frame.running.remaining}`;
};
const renderGantt = (list, active = -1) => {
  el.ganttChart.innerHTML = "";
  let start = 0;
  list.forEach((s) => {
    const block = document.createElement("div");
    block.className = `gantt-block${active >= start && active < start + s.end - s.start ? " active" : ""}`;
    block.style.background = s.id === "IDLE" ? "var(--idle)" : color(s.id);
    block.style.minWidth = `${Math.max(86, (s.end - s.start) * 44)}px`;
    block.innerHTML = `<div class="gantt-process">${s.id === "IDLE" ? "Idle" : s.id}</div>
      <div class="gantt-note">${s.end - s.start} unit${s.end - s.start === 1 ? "" : "s"}</div>
      <div class="gantt-range"><span>${s.start}</span><span>${s.end}</span></div>`;
    el.ganttChart.appendChild(block);
    start += s.end - s.start;
  });
};
const renderMetrics = (result) => {
  el.metricsTableBody.innerHTML = result.processes.map((p) => `<tr><td>${p.id}</td><td>${p.arrival}</td><td>${p.burst}</td><td>${p.priority}</td><td>${p.completion}</td><td>${p.turnaround}</td><td>${p.waiting}</td></tr>`).join("");
  el.summaryCards.innerHTML = [["Average Waiting Time", result.summary.avgWaiting.toFixed(2)], ["Average Turnaround Time", result.summary.avgTurnaround.toFixed(2)], ["Total Completion Time", result.summary.totalCompletion]].map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`).join("");
};

function resetView() {
  stop();
  Object.assign(state, { paused: false, running: false, frame: 0, result: null });
  renderCpu();
  renderQueue([]);
  renderGantt([]);
  el.metricsTableBody.innerHTML = el.summaryCards.innerHTML = "";
  setStatus("Ready");
}

const showFrame = (i) => {
  const frame = state.result?.frames[i];
  if (!frame) return;
  renderCpu(frame);
  renderQueue(frame.queue);
  renderGantt(state.result.segments, i);
};
const tick = () => {
  if (!state.running || state.paused) return;
  if (state.frame >= state.result.frames.length) return (state.running = false), setStatus("Completed");
  showFrame(state.frame++);
  setStatus(`Running - ${state.result.algorithm}`);
  state.timer = setTimeout(tick, delay);
};
const start = () => {
  const list = readTable();
  if (!list.length) return;
  state.result = simulate(el.algorithmSelect.value, list, Math.max(1, Number(el.timeQuantum.value) || 1));
  Object.assign(state, { frame: 0, paused: false, running: true });
  el.algorithmBadge.textContent = `Algorithm: ${names[state.result.algorithm]}`;
  renderMetrics(state.result);
  renderGantt(state.result.segments);
  stop();
  tick();
};

renderTable(sample);
initTheme();
resetView();
el.algorithmBadge.textContent = `Algorithm: ${names[el.algorithmSelect.value]}`;
el.loadSampleBtn.onclick = () => { renderTable(sample); resetView(); };
el.applyCountBtn.onclick = resizeTable;
el.addRowBtn.onclick = () => { el.processTableBody.appendChild(row()); syncCount(); };
el.themeToggleBtn.onclick = () => {
  const nextTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
};
el.startBtn.onclick = start;
el.pauseBtn.onclick = () => { if (state.running) { state.paused = true; stop(); setStatus("Paused"); } };
el.resumeBtn.onclick = () => { if (state.result && state.paused) { state.paused = false; state.running = true; tick(); } };
el.previousBtn.onclick = () => {
  if (!state.result || state.frame === 0) return;
  stop();
  state.running = false;
  state.paused = true;
  const i = Math.max(0, state.frame - 2);
  state.frame = i + 1;
  i ? showFrame(i) : (renderCpu(), renderQueue([]), renderGantt(state.result.segments));
  setStatus(`Paused - ${state.result.algorithm}`);
};
el.resetBtn.onclick = resetView;
el.algorithmSelect.onchange = () => { el.algorithmBadge.textContent = `Algorithm: ${names[el.algorithmSelect.value]}`; resetView(); };
