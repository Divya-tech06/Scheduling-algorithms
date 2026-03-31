const sampleProcesses = [
  { id: "P1", arrival: 0, burst: 7, priority: 2 },
  { id: "P2", arrival: 2, burst: 4, priority: 1 },
  { id: "P3", arrival: 4, burst: 1, priority: 4 },
  { id: "P4", arrival: 5, burst: 4, priority: 2 },
  { id: "P5", arrival: 6, burst: 6, priority: 3 }
];

const algorithmLabels = {
  FCFS: "FCFS",
  SJF: "SJF (Non-Preemptive)",
  SRTF: "SRTF (Preemptive)",
  RR: "Round Robin",
  PRIORITY_NP: "Priority (Non-Preemptive)",
  PRIORITY_P: "Priority (Preemptive)"
};

const comparisonAlgorithms = ["FCFS", "SJF", "SRTF", "RR", "PRIORITY_NP", "PRIORITY_P"];
const processColors = {};

const elements = {
  processCount: document.getElementById("processCount"),
  algorithmSelect: document.getElementById("algorithmSelect"),
  timeQuantum: document.getElementById("timeQuantum"),
  processTableBody: document.getElementById("processTableBody"),
  startBtn: document.getElementById("startBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  resumeBtn: document.getElementById("resumeBtn"),
  resetBtn: document.getElementById("resetBtn"),
  loadSampleBtn: document.getElementById("loadSampleBtn"),
  applyCountBtn: document.getElementById("applyCountBtn"),
  addRowBtn: document.getElementById("addRowBtn"),
  randomBtn: document.getElementById("randomBtn"),
  explainMode: document.getElementById("explainMode"),
  comparisonMode: document.getElementById("comparisonMode"),
  speedControl: document.getElementById("speedControl"),
  ganttChart: document.getElementById("ganttChart"),
  readyQueue: document.getElementById("readyQueue"),
  queueCountLabel: document.getElementById("queueCountLabel"),
  currentTimeLabel: document.getElementById("currentTimeLabel"),
  cpuCard: document.getElementById("cpuCard"),
  cpuProcessLabel: document.getElementById("cpuProcessLabel"),
  cpuMetaLabel: document.getElementById("cpuMetaLabel"),
  explanationBox: document.getElementById("explanationBox"),
  metricsTableBody: document.getElementById("metricsTableBody"),
  summaryCards: document.getElementById("summaryCards"),
  algorithmBadge: document.getElementById("algorithmBadge"),
  comparisonResults: document.getElementById("comparisonResults"),
  statusBadge: document.getElementById("statusBadge")
};

const state = {
  timer: null,
  isPaused: false,
  isRunning: false,
  frames: [],
  currentFrameIndex: 0,
  currentResult: null
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function getProcessColor(processId) {
  if (!processColors[processId]) {
    const hue = (Object.keys(processColors).length * 61) % 360;
    processColors[processId] = `hsl(${hue}, 68%, 52%)`;
  }
  return processColors[processId];
}

function cloneProcess(process, index) {
  return {
    ...process,
    sourceIndex: index,
    remaining: process.burst,
    completion: 0,
    turnaround: 0,
    waiting: 0,
    response: null,
    started: false,
    inQueue: false
  };
}

function setStatus(text) {
  elements.statusBadge.textContent = text;
}

function createRow(process = {}) {
  const row = document.createElement("tr");
  row.dataset.rowId = uid();
  row.innerHTML = `
    <td><input type="text" value="${process.id ?? `P${elements.processTableBody.children.length + 1}`}" class="pid-input"></td>
    <td><input type="number" min="0" value="${process.arrival ?? 0}" class="arrival-input"></td>
    <td><input type="number" min="1" value="${process.burst ?? 1}" class="burst-input"></td>
    <td><input type="number" min="1" value="${process.priority ?? 1}" class="priority-input"></td>
    <td><button type="button" class="remove-row-btn">Remove</button></td>
  `;
  row.querySelector(".remove-row-btn").addEventListener("click", () => {
    row.remove();
    syncProcessCount();
  });
  return row;
}

function renderTable(processes) {
  elements.processTableBody.innerHTML = "";
  processes.forEach((process) => {
    elements.processTableBody.appendChild(createRow(process));
  });
  syncProcessCount();
}

function syncProcessCount() {
  elements.processCount.value = elements.processTableBody.children.length || 1;
}

function adjustRowsToCount() {
  const desired = Number(elements.processCount.value);
  const current = elements.processTableBody.children.length;

  if (desired > current) {
    for (let i = current; i < desired; i += 1) {
      elements.processTableBody.appendChild(createRow());
    }
  } else if (desired < current) {
    for (let i = current; i > desired; i -= 1) {
      elements.processTableBody.lastElementChild?.remove();
    }
  }
  syncProcessCount();
}

function getProcessesFromTable() {
  const rows = [...elements.processTableBody.querySelectorAll("tr")];
  return rows.map((row, index) => {
    const id = row.querySelector(".pid-input").value.trim() || `P${index + 1}`;
    return {
      id,
      arrival: Number(row.querySelector(".arrival-input").value),
      burst: Number(row.querySelector(".burst-input").value),
      priority: Number(row.querySelector(".priority-input").value)
    };
  }).map((process, index) => ({
    ...process,
    arrival: Number.isFinite(process.arrival) && process.arrival >= 0 ? process.arrival : 0,
    burst: Number.isFinite(process.burst) && process.burst > 0 ? process.burst : 1,
    priority: Number.isFinite(process.priority) && process.priority > 0 ? process.priority : 1,
    sourceIndex: index
  }));
}

function compareByArrivalFCFS(a, b) {
  if (a.arrival !== b.arrival) return a.arrival - b.arrival;
  return a.sourceIndex - b.sourceIndex;
}

function compareSjf(a, b) {
  if (a.burst !== b.burst) return a.burst - b.burst;
  return compareByArrivalFCFS(a, b);
}

function compareSrtf(a, b) {
  if (a.remaining !== b.remaining) return a.remaining - b.remaining;
  return compareByArrivalFCFS(a, b);
}

function comparePriority(a, b) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return compareByArrivalFCFS(a, b);
}

function comparePriorityRemaining(a, b) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.remaining !== b.remaining) return a.remaining - b.remaining;
  return compareByArrivalFCFS(a, b);
}

function queueSnapshot(queue, currentProcess) {
  return queue
    .filter((process) => !currentProcess || process.id !== currentProcess.id)
    .map((process) => ({
      id: process.id,
      remaining: process.remaining,
      priority: process.priority,
      arrival: process.arrival
    }));
}

function segmentLabel(processId) {
  return processId === "IDLE" ? "Idle" : processId;
}

function explainSelection(algorithm, currentProcess, context = {}) {
  if (!currentProcess) {
    return context.idleReason || "CPU is idle because no process is available right now.";
  }

  switch (algorithm) {
    case "FCFS":
      return `${currentProcess.id} selected because it arrived first among the waiting processes.`;
    case "SJF":
      return `${currentProcess.id} selected because it has the shortest burst time among available processes.`;
    case "SRTF":
      return context.preemptedBy
        ? `${currentProcess.id} preempted ${context.preemptedBy} because it now has the shortest remaining time.`
        : `${currentProcess.id} is running because it has the shortest remaining time right now.`;
    case "RR":
      if (context.quantumExpired) {
        return `${currentProcess.id} gets the CPU next because the previous process used up its time quantum.`;
      }
      return `${currentProcess.id} selected from the front of the ready queue in Round Robin order.`;
    case "PRIORITY_NP":
      return `${currentProcess.id} selected because it has the highest priority among available processes. Lower number means higher priority.`;
    case "PRIORITY_P":
      return context.preemptedBy
        ? `${currentProcess.id} preempted ${context.preemptedBy} because it has a higher priority. Lower number means higher priority.`
        : `${currentProcess.id} is running because it has the highest priority right now.`;
    default:
      return `${currentProcess.id} is selected to run.`;
  }
}

function finalizeMetrics(processes) {
  processes.forEach((process) => {
    process.turnaround = process.completion - process.arrival;
    process.waiting = process.turnaround - process.burst;
    process.response = process.response ?? 0;
  });
}

function buildTimelineSegments(frames) {
  const segments = [];
  frames.forEach((frame) => {
    const processId = frame.running?.id ?? "IDLE";
    const last = segments[segments.length - 1];

    if (last && last.processId === processId) {
      last.end = frame.time + 1;
      if (frame.contextSwitch) {
        last.contextSwitch = true;
      }
    } else {
      segments.push({
        processId,
        start: frame.time,
        end: frame.time + 1,
        contextSwitch: frame.contextSwitch
      });
    }
  });
  return segments;
}

function calculateSummary(processes) {
  const avgWaiting = processes.reduce((sum, p) => sum + p.waiting, 0) / processes.length || 0;
  const avgTurnaround = processes.reduce((sum, p) => sum + p.turnaround, 0) / processes.length || 0;
  const avgResponse = processes.reduce((sum, p) => sum + p.response, 0) / processes.length || 0;
  return {
    avgWaiting,
    avgTurnaround,
    avgResponse,
    totalCompletion: Math.max(...processes.map((p) => p.completion), 0)
  };
}

function recordFrame({ frames, time, running, queue, explanation, contextSwitch = false }) {
  frames.push({
    time,
    running: running
      ? {
          id: running.id,
          remaining: running.remaining,
          priority: running.priority
        }
      : null,
    queue: queueSnapshot(queue, running),
    explanation,
    contextSwitch
  });
}

function simulateAlgorithm(algorithm, inputProcesses, timeQuantum = 2) {
  const processes = inputProcesses
    .map((process, index) => cloneProcess({ ...process, sourceIndex: index }, index))
    .sort(compareByArrivalFCFS);
  const total = processes.length;
  const frames = [];
  const completed = [];
  const readyQueue = [];
  let time = 0;
  let completedCount = 0;
  let incomingIndex = 0;
  let currentProcess = null;
  let previousProcessId = null;
  let rrSlice = 0;
  let pendingContext = {};

  function enqueueArrivals() {
    while (incomingIndex < total && processes[incomingIndex].arrival <= time) {
      const process = processes[incomingIndex];
      if (!process.inQueue && process.remaining > 0 && process !== currentProcess) {
        readyQueue.push(process);
        process.inQueue = true;
      }
      incomingIndex += 1;
    }
  }

  function removeFromQueue(target) {
    const index = readyQueue.findIndex((process) => process.id === target.id && process.sourceIndex === target.sourceIndex);
    if (index >= 0) {
      readyQueue.splice(index, 1);
    }
  }

  function chooseNextNonPreemptive(compareFn) {
    readyQueue.sort(compareFn);
    const next = readyQueue.shift() || null;
    if (next) next.inQueue = false;
    return next;
  }

  function chooseNextRoundRobin() {
    const next = readyQueue.shift() || null;
    if (next) next.inQueue = false;
    return next;
  }

  function chooseCurrent() {
    if (algorithm === "FCFS" && !currentProcess) {
      currentProcess = chooseNextNonPreemptive(compareByArrivalFCFS);
    } else if (algorithm === "SJF" && !currentProcess) {
      currentProcess = chooseNextNonPreemptive(compareSjf);
    } else if (algorithm === "PRIORITY_NP" && !currentProcess) {
      currentProcess = chooseNextNonPreemptive(comparePriority);
    } else if (algorithm === "RR" && !currentProcess) {
      currentProcess = chooseNextRoundRobin();
      rrSlice = 0;
    } else if (algorithm === "SRTF") {
      const candidates = [...readyQueue];
      if (currentProcess) candidates.push(currentProcess);
      candidates.sort(compareSrtf);
      const next = candidates[0] || null;
      if (next && currentProcess && next.id !== currentProcess.id) {
        readyQueue.push(currentProcess);
        currentProcess.inQueue = true;
        pendingContext.preemptedBy = currentProcess.id;
        currentProcess = next;
        removeFromQueue(next);
        currentProcess.inQueue = false;
      } else if (!currentProcess && next) {
        currentProcess = next;
        removeFromQueue(next);
        currentProcess.inQueue = false;
      }
    } else if (algorithm === "PRIORITY_P") {
      const candidates = [...readyQueue];
      if (currentProcess) candidates.push(currentProcess);
      candidates.sort(comparePriorityRemaining);
      const next = candidates[0] || null;
      if (next && currentProcess && next.id !== currentProcess.id) {
        readyQueue.push(currentProcess);
        currentProcess.inQueue = true;
        pendingContext.preemptedBy = currentProcess.id;
        currentProcess = next;
        removeFromQueue(next);
        currentProcess.inQueue = false;
      } else if (!currentProcess && next) {
        currentProcess = next;
        removeFromQueue(next);
        currentProcess.inQueue = false;
      }
    }
  }

  while (completedCount < total) {
    enqueueArrivals();
    chooseCurrent();

    if (!currentProcess) {
      recordFrame({
        frames,
        time,
        running: null,
        queue: readyQueue,
        explanation: "CPU is idle because no process has arrived and entered the ready queue yet.",
        contextSwitch: previousProcessId !== "IDLE"
      });
      previousProcessId = "IDLE";
      time += 1;
      continue;
    }

    if (!currentProcess.started) {
      currentProcess.started = true;
      currentProcess.response = time - currentProcess.arrival;
    }

    const explanation = explainSelection(algorithm, currentProcess, pendingContext);
    const contextSwitch = previousProcessId !== currentProcess.id;

    recordFrame({
      frames,
      time,
      running: currentProcess,
      queue: readyQueue,
      explanation,
      contextSwitch
    });

    previousProcessId = currentProcess.id;
    pendingContext = {};
    currentProcess.remaining -= 1;
    time += 1;
    rrSlice += algorithm === "RR" ? 1 : 0;

    enqueueArrivals();

    if (currentProcess.remaining === 0) {
      currentProcess.completion = time;
      completed.push(currentProcess);
      completedCount += 1;
      currentProcess = null;
      rrSlice = 0;
      continue;
    }

    if (algorithm === "RR" && rrSlice >= timeQuantum) {
      readyQueue.push(currentProcess);
      currentProcess.inQueue = true;
      currentProcess = null;
      rrSlice = 0;
      pendingContext.quantumExpired = true;
    }
  }

  finalizeMetrics(completed);
  completed.sort(compareByArrivalFCFS);
  return {
    algorithm,
    processes: completed,
    frames,
    segments: buildTimelineSegments(frames),
    summary: calculateSummary(completed)
  };
}

function renderQueue(queue) {
  elements.readyQueue.innerHTML = "";
  if (!queue.length) {
    elements.readyQueue.classList.add("empty");
    elements.readyQueue.textContent = "Ready queue is empty";
    elements.queueCountLabel.textContent = "0 processes";
    return;
  }

  elements.readyQueue.classList.remove("empty");
  elements.queueCountLabel.textContent = `${queue.length} process${queue.length === 1 ? "" : "es"}`;
  queue.forEach((process) => {
    const pill = document.createElement("div");
    pill.className = "queue-pill";
    pill.style.background = getProcessColor(process.id);
    pill.textContent = `${process.id} | RT ${process.remaining}`;
    elements.readyQueue.appendChild(pill);
  });
}

function renderCpu(frame) {
  elements.currentTimeLabel.textContent = `Time: ${frame.time}`;
  if (!frame.running) {
    elements.cpuCard.classList.add("idle");
    elements.cpuCard.classList.remove("active");
    elements.cpuProcessLabel.textContent = "Idle";
    elements.cpuMetaLabel.textContent = "No process is ready right now";
    return;
  }

  elements.cpuCard.classList.remove("idle");
  elements.cpuCard.classList.add("active");
  elements.cpuProcessLabel.textContent = frame.running.id;
  elements.cpuMetaLabel.textContent = `Remaining Burst Time: ${frame.running.remaining}`;
}

function renderGantt(segments, activeFrameIndex = null) {
  elements.ganttChart.innerHTML = "";
  let elapsedFrames = 0;

  segments.forEach((segment) => {
    const duration = segment.end - segment.start;
    const block = document.createElement("div");
    block.className = "gantt-block";
    block.style.background = segment.processId === "IDLE" ? "var(--idle)" : getProcessColor(segment.processId);
    block.style.minWidth = `${Math.max(86, duration * 44)}px`;

    const isActive =
      activeFrameIndex !== null &&
      activeFrameIndex >= elapsedFrames &&
      activeFrameIndex < elapsedFrames + duration;
    if (isActive) block.classList.add("active");

    block.innerHTML = `
      <div class="gantt-process">${segmentLabel(segment.processId)}</div>
      ${segment.contextSwitch ? '<div class="context-tag">Switch</div>' : ""}
      <div class="gantt-note">${duration} unit${duration === 1 ? "" : "s"}</div>
      <div class="gantt-range"><span>${segment.start}</span><span>${segment.end}</span></div>
    `;
    elements.ganttChart.appendChild(block);
    elapsedFrames += duration;
  });
}

function renderMetrics(result) {
  elements.metricsTableBody.innerHTML = "";
  result.processes.forEach((process) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${process.id}</td>
      <td>${process.arrival}</td>
      <td>${process.burst}</td>
      <td>${process.priority}</td>
      <td>${process.completion}</td>
      <td>${process.turnaround}</td>
      <td>${process.waiting}</td>
      <td>${process.response}</td>
    `;
    elements.metricsTableBody.appendChild(row);
  });

  const { avgWaiting, avgTurnaround, avgResponse, totalCompletion } = result.summary;
  const cards = [
    ["Average Waiting Time", avgWaiting.toFixed(2)],
    ["Average Turnaround Time", avgTurnaround.toFixed(2)],
    ["Average Response Time", avgResponse.toFixed(2)],
    ["Total Completion Time", totalCompletion.toFixed(0)]
  ];
  elements.summaryCards.innerHTML = cards
    .map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderExplanation(text) {
  elements.explanationBox.textContent = elements.explainMode.checked ? text : "Explain Mode is turned off.";
}

function renderComparison(processes, timeQuantum) {
  if (!elements.comparisonMode.checked) {
    elements.comparisonResults.className = "comparison-results empty-state";
    elements.comparisonResults.textContent = "Enable Comparison Mode and start the simulation to run every algorithm on the same input.";
    return;
  }

  const results = comparisonAlgorithms.map((algorithm) =>
    simulateAlgorithm(algorithm, processes, timeQuantum)
  );

  const bestWaiting = Math.min(...results.map((result) => result.summary.avgWaiting));
  elements.comparisonResults.className = "comparison-results";
  elements.comparisonResults.innerHTML = "";

  results.forEach((result) => {
    const card = document.createElement("div");
    card.className = "comparison-card";
    if (Math.abs(result.summary.avgWaiting - bestWaiting) < 0.0001) {
      card.classList.add("best");
    }

    const miniGantt = result.segments
      .map((segment) => `
        <div class="mini-block" style="background:${segment.processId === "IDLE" ? "var(--idle)" : getProcessColor(segment.processId)}">
          ${segmentLabel(segment.processId)}<br>${segment.start}-${segment.end}
        </div>
      `)
      .join("");

    card.innerHTML = `
      <h3>${algorithmLabels[result.algorithm]}${card.classList.contains("best") ? " • Best WT" : ""}</h3>
      <div class="comparison-metric">Average Waiting Time: ${result.summary.avgWaiting.toFixed(2)}</div>
      <div class="comparison-metric">Average Turnaround Time: ${result.summary.avgTurnaround.toFixed(2)}</div>
      <div class="comparison-metric">Average Response Time: ${result.summary.avgResponse.toFixed(2)}</div>
      <div class="mini-gantt">${miniGantt}</div>
    `;
    elements.comparisonResults.appendChild(card);
  });
}

function playbackDelay() {
  const value = Number(elements.speedControl.value);
  const map = { 1: 1400, 2: 1000, 3: 700, 4: 400, 5: 180 };
  return map[value] || 700;
}

function stopPlayback() {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

function resetLiveView() {
  stopPlayback();
  state.isPaused = false;
  state.isRunning = false;
  state.frames = [];
  state.currentFrameIndex = 0;
  state.currentResult = null;
  elements.currentTimeLabel.textContent = "Time: 0";
  elements.cpuCard.className = "cpu-card idle";
  elements.cpuProcessLabel.textContent = "Idle";
  elements.cpuMetaLabel.textContent = "Waiting for simulation to begin";
  elements.readyQueue.className = "queue-strip empty";
  elements.readyQueue.textContent = "Ready queue is empty";
  elements.queueCountLabel.textContent = "0 processes";
  elements.metricsTableBody.innerHTML = "";
  elements.summaryCards.innerHTML = "";
  elements.comparisonResults.className = "comparison-results empty-state";
  elements.comparisonResults.textContent = "Enable Comparison Mode and start the simulation to run every algorithm on the same input.";
  renderGantt([]);
  renderExplanation("Choose an algorithm and press Start Simulation to see scheduling decisions explained in simple language.");
  setStatus("Ready");
}

function playNextFrame() {
  if (state.isPaused || !state.isRunning) return;
  const frame = state.frames[state.currentFrameIndex];

  if (!frame) {
    setStatus("Completed");
    state.isRunning = false;
    renderExplanation("Simulation complete. Check the metrics table and comparison section to review performance.");
    return;
  }

  renderCpu(frame);
  renderQueue(frame.queue);
  renderGantt(state.currentResult.segments, state.currentFrameIndex);
  renderExplanation(frame.explanation);
  setStatus(`Running • ${state.currentResult.algorithm}`);
  state.currentFrameIndex += 1;
  state.timer = setTimeout(playNextFrame, playbackDelay());
}

function startSimulation() {
  const processes = getProcessesFromTable();
  if (!processes.length) return;

  stopPlayback();
  const algorithm = elements.algorithmSelect.value;
  const timeQuantum = Math.max(1, Number(elements.timeQuantum.value) || 1);
  const result = simulateAlgorithm(algorithm, processes, timeQuantum);

  state.currentResult = result;
  state.frames = result.frames;
  state.currentFrameIndex = 0;
  state.isPaused = false;
  state.isRunning = true;

  elements.algorithmBadge.textContent = `Algorithm: ${algorithmLabels[algorithm]}`;
  renderMetrics(result);
  renderComparison(processes, timeQuantum);
  renderGantt(result.segments, null);
  playNextFrame();
}

function pauseSimulation() {
  if (!state.isRunning) return;
  state.isPaused = true;
  stopPlayback();
  setStatus("Paused");
}

function resumeSimulation() {
  if (!state.currentResult || !state.isPaused) return;
  state.isPaused = false;
  state.isRunning = true;
  playNextFrame();
}

function randomProcesses() {
  const count = Number(elements.processCount.value) || 5;
  const processes = Array.from({ length: count }, (_, index) => ({
    id: `P${index + 1}`,
    arrival: Math.floor(Math.random() * Math.min(count + 2, 8)),
    burst: Math.floor(Math.random() * 8) + 1,
    priority: Math.floor(Math.random() * 5) + 1
  }));
  processes.sort(compareByArrivalFCFS);
  renderTable(processes);
}

function initialize() {
  renderTable(sampleProcesses);
  resetLiveView();

  elements.loadSampleBtn.addEventListener("click", () => {
    renderTable(sampleProcesses);
    resetLiveView();
  });
  elements.applyCountBtn.addEventListener("click", adjustRowsToCount);
  elements.addRowBtn.addEventListener("click", () => {
    elements.processTableBody.appendChild(createRow());
    syncProcessCount();
  });
  elements.randomBtn.addEventListener("click", () => {
    randomProcesses();
    resetLiveView();
  });
  elements.startBtn.addEventListener("click", startSimulation);
  elements.pauseBtn.addEventListener("click", pauseSimulation);
  elements.resumeBtn.addEventListener("click", resumeSimulation);
  elements.resetBtn.addEventListener("click", resetLiveView);
  elements.algorithmSelect.addEventListener("change", () => {
    elements.algorithmBadge.textContent = `Algorithm: ${algorithmLabels[elements.algorithmSelect.value]}`;
    resetLiveView();
  });
  elements.explainMode.addEventListener("change", () => {
    if (state.currentFrameIndex > 0 && state.frames[state.currentFrameIndex - 1]) {
      renderExplanation(state.frames[state.currentFrameIndex - 1].explanation);
    } else if (!elements.explainMode.checked) {
      renderExplanation("");
    }
  });
  elements.comparisonMode.addEventListener("change", () => {
    if (state.currentResult) {
      renderComparison(getProcessesFromTable(), Math.max(1, Number(elements.timeQuantum.value) || 1));
    }
  });
  elements.speedControl.addEventListener("input", () => {
    if (state.isRunning && !state.isPaused) {
      stopPlayback();
      playNextFrame();
    }
  });

  elements.algorithmBadge.textContent = `Algorithm: ${algorithmLabels[elements.algorithmSelect.value]}`;
}

initialize();
