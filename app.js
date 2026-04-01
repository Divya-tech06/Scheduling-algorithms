const sample = [
  { id: "P1", arrival: 0, burst: 7, priority: 2 },
  { id: "P2", arrival: 2, burst: 4, priority: 1 },
  { id: "P3", arrival: 4, burst: 1, priority: 4 },
  { id: "P4", arrival: 5, burst: 4, priority: 2 },
  { id: "P5", arrival: 6, burst: 6, priority: 3 }
];

const names = {
  FCFS: "FCFS",
  SJF: "SJF (Non-Preemptive)",
  SRTF: "SRTF (Preemptive)",
  RR: "Round Robin",
  PRIORITY_NP: "Priority (Non-Preemptive)",
  PRIORITY_P: "Priority (Preemptive)"
};

const $ = (id) => document.getElementById(id);
const el = {
  processCount: $("processCount"),
  algorithmSelect: $("algorithmSelect"),
  timeQuantum: $("timeQuantum"),
  processTableBody: $("processTableBody"),
  startBtn: $("startBtn"),
  previousBtn: $("previousBtn"),
  pauseBtn: $("pauseBtn"),
  resumeBtn: $("resumeBtn"),
  resetBtn: $("resetBtn"),
  loadSampleBtn: $("loadSampleBtn"),
  applyCountBtn: $("applyCountBtn"),
  addRowBtn: $("addRowBtn"),
  randomBtn: $("randomBtn"),
  speedControl: $("speedControl"),
  ganttChart: $("ganttChart"),
  readyQueue: $("readyQueue"),
  queueCountLabel: $("queueCountLabel"),
  currentTimeLabel: $("currentTimeLabel"),
  cpuCard: $("cpuCard"),
  cpuProcessLabel: $("cpuProcessLabel"),
  cpuMetaLabel: $("cpuMetaLabel"),
  metricsTableBody: $("metricsTableBody"),
  summaryCards: $("summaryCards"),
  algorithmBadge: $("algorithmBadge"),
  statusBadge: $("statusBadge")
};

const state = { timer: null, paused: false, running: false, frame: 0, result: null };
const colors = {};

const byArrival = (a, b) => a.arrival - b.arrival || a.i - b.i;
const byBurst = (a, b) => a.burst - b.burst || byArrival(a, b);
const byRemaining = (a, b) => a.remaining - b.remaining || byArrival(a, b);
const byPriority = (a, b) => a.priority - b.priority || byArrival(a, b);
const byPriorityRemaining = (a, b) => a.priority - b.priority || a.remaining - b.remaining || byArrival(a, b);

function color(id) {
  colors[id] ??= `hsl(${Object.keys(colors).length * 61 % 360}, 68%, 52%)`;
  return colors[id];
}

function status(text) {
  el.statusBadge.textContent = text;
}

function syncCount() {
  el.processCount.value = el.processTableBody.children.length || 1;
}

function row(p = {}, n = el.processTableBody.children.length + 1) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="pid-input" value="${p.id ?? `P${n}`}"></td>
    <td><input type="number" class="arrival-input" min="0" value="${p.arrival ?? 0}"></td>
    <td><input type="number" class="burst-input" min="1" value="${p.burst ?? 1}"></td>
    <td><input type="number" class="priority-input" min="1" value="${p.priority ?? 1}"></td>
    <td><button type="button" class="remove-row-btn">Remove</button></td>
  `;
  tr.querySelector("button").onclick = () => {
    tr.remove();
    syncCount();
  };
  return tr;
}

function renderTable(list) {
  el.processTableBody.innerHTML = "";
  list.forEach((p, i) => el.processTableBody.appendChild(row(p, i + 1)));
  syncCount();
}

function resizeTable() {
  const want = Math.max(1, Number(el.processCount.value) || 1);
  while (el.processTableBody.children.length < want) el.processTableBody.appendChild(row());
  while (el.processTableBody.children.length > want) el.processTableBody.lastElementChild.remove();
  syncCount();
}

function readTable() {
  return [...el.processTableBody.rows].map((tr, i) => ({
    id: tr.querySelector(".pid-input").value.trim() || `P${i + 1}`,
    arrival: Math.max(0, Number(tr.querySelector(".arrival-input").value) || 0),
    burst: Math.max(1, Number(tr.querySelector(".burst-input").value) || 1),
    priority: Math.max(1, Number(tr.querySelector(".priority-input").value) || 1),
    i
  }));
}

function clone(list) {
  return list.map((p) => ({ ...p, remaining: p.burst, completion: 0, waiting: 0, turnaround: 0, inQueue: false }));
}

function snapshot(queue, running) {
  return queue.filter((p) => p !== running).map(({ id, remaining, priority, arrival }) => ({ id, remaining, priority, arrival }));
}

function segments(frames) {
  const out = [];
  for (const f of frames) {
    const id = f.running?.id || "IDLE";
    const last = out[out.length - 1];
    if (last?.id === id) last.end = f.time + 1;
    else out.push({ id, start: f.time, end: f.time + 1 });
  }
  return out;
}

function simulate(algorithm, list, quantum) {
  const all = clone(list).sort(byArrival);
  const frames = [];
  const done = [];
  const queue = [];
  let time = 0;
  let next = 0;
  let current = null;
  let slice = 0;

  const pushArrivals = () => {
    while (next < all.length && all[next].arrival <= time) {
      if (!all[next].inQueue && all[next] !== current && all[next].remaining > 0) {
        all[next].inQueue = true;
        queue.push(all[next]);
      }
      next += 1;
    }
  };

  const take = (sorter) => {
    queue.sort(sorter);
    current = queue.shift() || null;
    if (current) current.inQueue = false;
  };

  while (done.length < all.length) {
    pushArrivals();

    if (algorithm === "FCFS" && !current) take(byArrival);
    if (algorithm === "SJF" && !current) take(byBurst);
    if (algorithm === "PRIORITY_NP" && !current) take(byPriority);
    if (algorithm === "RR" && !current) {
      current = queue.shift() || null;
      if (current) current.inQueue = false;
      slice = 0;
    }
    if (algorithm === "SRTF" || algorithm === "PRIORITY_P") {
      const pool = current ? [...queue, current] : [...queue];
      pool.sort(algorithm === "SRTF" ? byRemaining : byPriorityRemaining);
      const best = pool[0] || null;
      if (best && best !== current) {
        if (current) {
          current.inQueue = true;
          queue.push(current);
        }
        current = best;
        const at = queue.indexOf(best);
        if (at >= 0) queue.splice(at, 1);
        current.inQueue = false;
      }
    }

    frames.push({
      time,
      running: current ? { id: current.id, remaining: current.remaining, priority: current.priority } : null,
      queue: snapshot(queue, current)
    });

    if (!current) {
      time += 1;
      continue;
    }

    current.remaining -= 1;
    time += 1;
    if (algorithm === "RR") slice += 1;
    pushArrivals();

    if (current.remaining === 0) {
      current.completion = time;
      current.turnaround = current.completion - current.arrival;
      current.waiting = current.turnaround - current.burst;
      done.push(current);
      current = null;
      slice = 0;
      continue;
    }

    if (algorithm === "RR" && slice >= quantum) {
      current.inQueue = true;
      queue.push(current);
      current = null;
      slice = 0;
    }
  }

  done.sort(byArrival);
  const totalCompletion = Math.max(0, ...done.map((p) => p.completion));
  const avgWaiting = done.reduce((s, p) => s + p.waiting, 0) / done.length || 0;
  const avgTurnaround = done.reduce((s, p) => s + p.turnaround, 0) / done.length || 0;
  return { algorithm, frames, segments: segments(frames), processes: done, summary: { totalCompletion, avgWaiting, avgTurnaround } };
}

function renderQueue(list) {
  el.readyQueue.innerHTML = "";
  el.queueCountLabel.textContent = `${list.length} process${list.length === 1 ? "" : "es"}`;
  if (!list.length) {
    el.readyQueue.className = "queue-strip empty";
    el.readyQueue.textContent = "Ready queue is empty";
    return;
  }
  el.readyQueue.className = "queue-strip";
  list.forEach((p) => {
    const pill = document.createElement("div");
    pill.className = "queue-pill";
    pill.style.background = color(p.id);
    pill.textContent = `${p.id} | RT ${p.remaining}`;
    el.readyQueue.appendChild(pill);
  });
}

function renderCpu(frame) {
  el.currentTimeLabel.textContent = `Time: ${frame?.time ?? 0}`;
  if (!frame?.running) {
    el.cpuCard.className = "cpu-card idle";
    el.cpuProcessLabel.textContent = "Idle";
    el.cpuMetaLabel.textContent = "Waiting for simulation to begin";
    return;
  }
  el.cpuCard.className = "cpu-card active";
  el.cpuProcessLabel.textContent = frame.running.id;
  el.cpuMetaLabel.textContent = `Remaining Burst Time: ${frame.running.remaining}`;
}

function renderGantt(list, active = -1) {
  el.ganttChart.innerHTML = "";
  let start = 0;
  list.forEach((s) => {
    const block = document.createElement("div");
    block.className = "gantt-block";
    if (active >= start && active < start + s.end - s.start) block.classList.add("active");
    block.style.background = s.id === "IDLE" ? "var(--idle)" : color(s.id);
    block.style.minWidth = `${Math.max(86, (s.end - s.start) * 44)}px`;
    block.innerHTML = `
      <div class="gantt-process">${s.id === "IDLE" ? "Idle" : s.id}</div>
      <div class="gantt-note">${s.end - s.start} unit${s.end - s.start === 1 ? "" : "s"}</div>
      <div class="gantt-range"><span>${s.start}</span><span>${s.end}</span></div>
    `;
    el.ganttChart.appendChild(block);
    start += s.end - s.start;
  });
}

function renderMetrics(result) {
  el.metricsTableBody.innerHTML = result.processes.map((p) => `
    <tr>
      <td>${p.id}</td>
      <td>${p.arrival}</td>
      <td>${p.burst}</td>
      <td>${p.priority}</td>
      <td>${p.completion}</td>
      <td>${p.turnaround}</td>
      <td>${p.waiting}</td>
    </tr>
  `).join("");
  el.summaryCards.innerHTML = [
    ["Average Waiting Time", result.summary.avgWaiting.toFixed(2)],
    ["Average Turnaround Time", result.summary.avgTurnaround.toFixed(2)],
    ["Total Completion Time", result.summary.totalCompletion]
  ].map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function delay() {
  return ({ 1: 1400, 2: 1000, 3: 700, 4: 400, 5: 180 })[Number(el.speedControl.value)] || 700;
}

function stop() {
  clearTimeout(state.timer);
  state.timer = null;
}

function resetView() {
  stop();
  state.paused = false;
  state.running = false;
  state.frame = 0;
  state.result = null;
  renderCpu();
  renderQueue([]);
  renderGantt([]);
  el.metricsTableBody.innerHTML = "";
  el.summaryCards.innerHTML = "";
  status("Ready");
}

function showFrame(i) {
  const frame = state.result?.frames[i];
  if (!frame) return;
  renderCpu(frame);
  renderQueue(frame.queue);
  renderGantt(state.result.segments, i);
}

function tick() {
  if (!state.running || state.paused) return;
  if (state.frame >= state.result.frames.length) {
    state.running = false;
    status("Completed");
    return;
  }
  showFrame(state.frame++);
  status(`Running - ${state.result.algorithm}`);
  state.timer = setTimeout(tick, delay());
}

function start() {
  const list = readTable();
  if (!list.length) return;
  state.result = simulate(el.algorithmSelect.value, list, Math.max(1, Number(el.timeQuantum.value) || 1));
  state.frame = 0;
  state.paused = false;
  state.running = true;
  el.algorithmBadge.textContent = `Algorithm: ${names[state.result.algorithm]}`;
  renderMetrics(state.result);
  renderGantt(state.result.segments);
  stop();
  tick();
}

function randomize() {
  const n = Math.max(1, Number(el.processCount.value) || 5);
  const priorities = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = priorities.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [priorities[i], priorities[j]] = [priorities[j], priorities[i]];
  }
  const list = Array.from({ length: n }, (_, i) => ({
    id: `P${i + 1}`,
    arrival: Math.floor(Math.random() * Math.min(n + 2, 8)),
    burst: Math.floor(Math.random() * 8) + 1,
    priority: priorities[i],
    i
  })).sort(byArrival);
  renderTable(list);
}

renderTable(sample);
resetView();
el.algorithmBadge.textContent = `Algorithm: ${names[el.algorithmSelect.value]}`;

el.loadSampleBtn.onclick = () => { renderTable(sample); resetView(); };
el.applyCountBtn.onclick = resizeTable;
el.addRowBtn.onclick = () => { el.processTableBody.appendChild(row()); syncCount(); };
el.randomBtn.onclick = () => { randomize(); resetView(); };
el.startBtn.onclick = start;
el.pauseBtn.onclick = () => { if (state.running) { state.paused = true; stop(); status("Paused"); } };
el.resumeBtn.onclick = () => { if (state.result && state.paused) { state.paused = false; state.running = true; tick(); } };
el.previousBtn.onclick = () => {
  if (!state.result || state.frame === 0) return;
  stop();
  state.running = false;
  state.paused = true;
  const i = Math.max(0, state.frame - 2);
  state.frame = i + 1;
  i ? showFrame(i) : (renderCpu(), renderQueue([]), renderGantt(state.result.segments));
  status(`Paused - ${state.result.algorithm}`);
};
el.resetBtn.onclick = resetView;
el.algorithmSelect.onchange = () => {
  el.algorithmBadge.textContent = `Algorithm: ${names[el.algorithmSelect.value]}`;
  resetView();
};
el.speedControl.oninput = () => {
  if (state.running && !state.paused) {
    stop();
    tick();
  }
};
