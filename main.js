/* Minimal 2D habitat planner — Canvas-based */
const GRID = 20;
const HABITAT = { x: 50, y: 50, w: 1000, h: 600, corridor: { x: 300, y: 120, w: 500, h: 80 } };
// Simple catalog with sizes (w,h) in px, and access zones (ax, ay, aw, ah) relative to object (optional)
const CATALOG = {
  // Original objects
  bed:    { w: 160, h: 80,  name: "Bed",    color: "#7aa2f7", access: { x: -10, y: 0, w: 40, h: 80 } },
  panel:  { w: 140, h: 40,  name: "Panel",  color: "#9ece6a", access: { x: 0, y: 40, w: 140, h: 50 } },
  cabinet:{ w: 100, h: 100, name: "Cabinet",color: "#f7768e", access: { x: 0, y: 100, w: 100, h: 50 } },
  cable:  { name: "Cable",  color: "#e0af68" }, // polyline
  
  // Food systems
  kitchen: { w: 200, h: 120, name: "Kitchen", color: "#ff9f43", access: { x: 0, y: 120, w: 200, h: 60 } },
  dining:  { w: 180, h: 100, name: "Dining",  color: "#ff6b6b", access: { x: 0, y: 100, w: 180, h: 80 } },
  storage: { w: 120, h: 80,  name: "Storage", color: "#a55eea", access: { x: 0, y: 80, w: 120, h: 40 } },
  
  // Life support systems
  atmosphere: { w: 160, h: 100, name: "Atmosphere Control", color: "#26de81", access: { x: 0, y: 100, w: 160, h: 60 } },
  monitor:    { w: 140, h: 60,  name: "Monitor", color: "#45aaf2", access: { x: 0, y: 60, w: 140, h: 40 } },
  
  // Exercise and recreation
  exercise: { w: 220, h: 140, name: "Exercise", color: "#fd79a8", access: { x: 0, y: 140, w: 220, h: 80 } },
  recreation: { w: 180, h: 120, name: "Recreation", color: "#fdcb6e", access: { x: 0, y: 120, w: 180, h: 60 } },
  
  // Privacy and psychology
  private: { w: 100, h: 80, name: "Private Space", color: "#6c5ce7", access: { x: 0, y: 80, w: 100, h: 40 } },
  communication: { w: 120, h: 60, name: "Comm Station", color: "#00b894", access: { x: 0, y: 60, w: 120, h: 40 } }
};

let state = {
  modules: [
    {
      id: "module-1",
      name: "Main Habitat",
      x: 50, y: 50, w: 1000, h: 600,
      corridor: { x: 300, y: 120, w: 500, h: 80 },
      objects: []
    }
  ],
  activeModuleId: "module-1",
  selectedId: null,
  tool: "select", // "select" | "cable" | "module"
  cableDraft: null, // {points: [{x,y},...]} while drawing
  aiSource: "local"
};

// Helper functions for module management
function getActiveModule() {
  return state.modules.find(m => m.id === state.activeModuleId);
}

function getActiveObjects() {
  return getActiveModule()?.objects || [];
}

// Auto-save to localStorage
function saveState() {
  localStorage.setItem('habitat-layout', JSON.stringify({
    modules: state.modules,
    activeModuleId: state.activeModuleId,
    aiSource: state.aiSource
  }));
}

function loadState() {
  try {
    const saved = localStorage.getItem('habitat-layout');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.modules) {
        state.modules = data.modules;
        state.activeModuleId = data.activeModuleId || "module-1";
      } else if (data.objects) {
        // Legacy support for old saves
        state.modules[0].objects = data.objects;
      }
      state.aiSource = data.aiSource || "local";
      $("#ai-source").value = state.aiSource;
    }
  } catch (e) {
    console.warn('Failed to load saved state:', e);
  }
}

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function snap(v) { return Math.round(v / GRID) * GRID; }
function genId() { return Math.random().toString(36).slice(2, 9); }

function addObject(type, x, y) {
  if (type === "cable") {
    state.cableDraft = { id: genId(), type: "cable", points: [] };
    state.tool = "cable";
    markToolActive();
    return;
  }
  const t = CATALOG[type];
  const obj = { id: genId(), type, x: snap(x), y: snap(y), w: t.w, h: t.h, rot: 0 };
  const activeModule = getActiveModule();
  if (activeModule) {
    activeModule.objects.push(obj);
    state.selectedId = obj.id;
    saveState();
    render();
  }
}

function objectsAtPoint(x, y) {
  const hits = [];
  const objects = getActiveObjects();
  
  // Check regular objects
  for (const o of objects) {
    if (o.type !== "cable" && pointInRect(x, y, o)) {
      hits.push(o.id);
    }
  }
  
  // Check cables (within 10px of any point)
  for (const o of objects) {
    if (o.type === "cable" && o.points) {
      for (const pt of o.points) {
        const dist = Math.hypot(x - pt.x, y - pt.y);
        if (dist < 10) {
          hits.push(o.id);
          break;
        }
      }
    }
  }
  
  return hits;
}

function pointInRect(px, py, r) {
  return px >= r.x && py >= r.y && px <= r.x + r.w && py <= r.y + r.h;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function drawGrid() {
  const activeModule = getActiveModule();
  if (!activeModule) return;
  
  ctx.strokeStyle = "#12202d";
  ctx.lineWidth = 1;
  for (let x = activeModule.x; x <= activeModule.x + activeModule.w; x += GRID) {
    ctx.beginPath(); ctx.moveTo(x, activeModule.y); ctx.lineTo(x, activeModule.y + activeModule.h); ctx.stroke();
  }
  for (let y = activeModule.y; y <= activeModule.y + activeModule.h; y += GRID) {
    ctx.beginPath(); ctx.moveTo(activeModule.x, y); ctx.lineTo(activeModule.x + activeModule.w, y); ctx.stroke();
  }
}

function drawHabitat() {
  const activeModule = getActiveModule();
  if (!activeModule) return;
  
  // habitat border
  ctx.fillStyle = "#0d1b26";
  ctx.strokeStyle = "#284157";
  ctx.lineWidth = 2;
  roundRect(activeModule.x, activeModule.y, activeModule.w, activeModule.h, 16, true, true);

  // corridor (must be clear)
  const c = activeModule.corridor;
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = "#3a86ff";
  ctx.lineWidth = 2;
  ctx.strokeRect(c.x, c.y, c.w, c.h);
  ctx.setLineDash([]);
  ctx.font = "12px system-ui";
  ctx.fillStyle = "#7aa2f7";
  ctx.fillText("Keep corridor clear", c.x + 8, c.y - 6);
  
  // Module name
  ctx.fillStyle = "#9ad";
  ctx.font = "bold 14px system-ui";
  ctx.fillText(activeModule.name, activeModule.x + 10, activeModule.y - 10);
}

function drawObjects() {
  const objects = getActiveObjects();
  for (const o of objects) {
    if (o.type === "cable") {
      drawCable(o);
      continue;
    }
    const cat = CATALOG[o.type];
    ctx.fillStyle = cat.color;
    ctx.strokeStyle = "#0b0b0b";
    ctx.lineWidth = 1.5;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeRect(o.x, o.y, o.w, o.h);

    // label
    ctx.fillStyle = "#e6e6e6";
    ctx.font = "12px system-ui";
    ctx.fillText(cat.name, o.x + 6, o.y + 16);

    // access zone (transparent)
    if (cat.access) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = "#ffffff";
      const ax = o.x + cat.access.x;
      const ay = o.y + cat.access.y;
      ctx.fillRect(ax, ay, cat.access.w, cat.access.h);
      ctx.restore();
    }

    // selection
    if (state.selectedId === o.id) {
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x - 2, o.y - 2, o.w + 4, o.h + 4);
    }
  }

  // cable draft
  if (state.cableDraft) {
    ctx.strokeStyle = CATALOG.cable.color;
    ctx.lineWidth = 3;
    ctx.setLineDash([4,4]);
    const pts = state.cableDraft.points;
    if (pts.length > 0) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
}

function drawCable(c) {
  ctx.strokeStyle = CATALOG.cable.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  const pts = c.points;
  if (!pts || pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  
  // Draw control points if selected
  if (state.selectedId === c.id) {
    ctx.fillStyle = "#ffd166";
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    for (const pt of pts) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
  }
}

function roundRect(x, y, w, h, r, fill, stroke) {
  if (r === undefined) r = 5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

/* ---------------- Rules (NASA-inspired, simplified) ---------------- */
function validateLayout() {
  const issues = [];
  const activeModule = getActiveModule();
  if (!activeModule) return issues;
  
  const objects = getActiveObjects();
  
  // 1) All objects inside habitat and not overlapping
  for (let i = 0; i < objects.length; i++) {
    const a = objects[i];
    if (a.type === "cable") continue;
    // inside habitat
    const r = activeModule;
    if (a.x < r.x || a.y < r.y || a.x + a.w > r.x + r.w || a.y + a.h > r.y + r.h) {
      issues.push({type:"error", msg:`${CATALOG[a.type].name} is outside habitat bounds.`});
    }
    // overlap
    for (let j = i + 1; j < objects.length; j++) {
      const b = objects[j];
      if (b.type === "cable") continue;
      if (rectsOverlap(a, b)) {
        issues.push({type:"error", msg:`${CATALOG[a.type].name} overlaps with ${CATALOG[b.type].name}.`});
      }
    }
    // corridor clear
    const c = activeModule.corridor;
    if (rectsOverlap(a, c)) {
      issues.push({type:"error", msg:`${CATALOG[a.type].name} blocks the main corridor.`});
    }
    // access zone clear
    const acc = CATALOG[a.type].access;
    if (acc) {
      const az = { x: a.x + acc.x, y: a.y + acc.y, w: acc.w, h: acc.h };
      for (const o of objects) {
        if (o.id === a.id || o.type === "cable") continue;
        if (rectsOverlap(az, o)) {
          issues.push({type:"warn", msg:`${CATALOG[a.type].name} access zone is obstructed by ${CATALOG[o.type].name}.`});
          break;
        }
      }
    }
  }
  // 2) Cable along walls (approx: every cable point must lie near a wall)
  for (const o of objects) {
    if (o.type !== "cable") continue;
    const bad = o.points.some(p => {
      const nearLeft   = Math.abs(p.x - activeModule.x) < GRID;
      const nearRight  = Math.abs(p.x - (activeModule.x + activeModule.w)) < GRID;
      const nearTop    = Math.abs(p.y - activeModule.y) < GRID;
      const nearBottom = Math.abs(p.y - (activeModule.y + activeModule.h)) < GRID;
      return !(nearLeft || nearRight || nearTop || nearBottom);
    });
    if (bad) issues.push({type:"warn", msg:"Cable should be routed along walls/edges for safety."});
  }
  // 3) Bed away from Panel (noise/light) → recommend distance >= 120px
  const beds = objects.filter(o=>o.type==="bed");
  const panels = objects.filter(o=>o.type==="panel");
  for (const b of beds) {
    for (const p of panels) {
      const dx = (b.x + b.w/2) - (p.x + p.w/2);
      const dy = (b.y + b.h/2) - (p.y + p.h/2);
      const dist = Math.hypot(dx, dy);
      if (dist < 120) issues.push({type:"hint", msg:"Consider placing Bed further from Panel to reduce noise/light exposure."});
    }
  }
  
  // 4) Check minimum free space (at least 30% of habitat should be clear)
  const totalArea = activeModule.w * activeModule.h;
  const objectArea = objects
    .filter(o => o.type !== "cable")
    .reduce((sum, o) => sum + (o.w * o.h), 0);
  const freeSpaceRatio = (totalArea - objectArea) / totalArea;
  if (freeSpaceRatio < 0.3) {
    issues.push({type:"warn", msg:`Only ${Math.round(freeSpaceRatio * 100)}% free space. NASA recommends at least 30% for crew movement.`});
  }
  
  // 5) Check for objects too close to habitat walls (minimum 20px clearance)
  for (const o of objects) {
    if (o.type === "cable") continue;
    const clearance = 20;
    if (o.x < activeModule.x + clearance || 
        o.y < activeModule.y + clearance ||
        o.x + o.w > activeModule.x + activeModule.w - clearance ||
        o.y + o.h > activeModule.y + activeModule.h - clearance) {
      issues.push({type:"warn", msg:`${CATALOG[o.type].name} is too close to habitat wall. Maintain ${clearance}px clearance.`});
    }
  }
  
  // 6) New NASA rules for extended systems
  // Kitchen should be near dining area
  const kitchens = objects.filter(o=>o.type==="kitchen");
  const dinings = objects.filter(o=>o.type==="dining");
  if (kitchens.length > 0 && dinings.length > 0) {
    for (const k of kitchens) {
      const minDist = Math.min(...dinings.map(d => {
        const dx = (k.x + k.w/2) - (d.x + d.w/2);
        const dy = (k.y + k.h/2) - (d.y + d.h/2);
        return Math.hypot(dx, dy);
      }));
      if (minDist > 200) {
        issues.push({type:"hint", msg:"Consider placing Kitchen closer to Dining area for efficiency."});
      }
    }
  }
  
  // Exercise area should be away from sleeping areas
  const exercises = objects.filter(o=>o.type==="exercise");
  for (const e of exercises) {
    for (const b of beds) {
      const dx = (e.x + e.w/2) - (b.x + b.w/2);
      const dy = (e.y + e.h/2) - (b.y + b.h/2);
      const dist = Math.hypot(dx, dy);
      if (dist < 150) {
        issues.push({type:"hint", msg:"Consider placing Exercise area further from sleeping areas to reduce noise."});
      }
    }
  }
  
  return issues;
}

/* ---------------- AI Hook ---------------- */
async function analyzeAI() {
  const src = state.aiSource;
  const activeModule = getActiveModule();
  const layout = { 
    modules: state.modules,
    activeModule: activeModule,
    objects: getActiveObjects()
  };
  let suggestions = [];
  if (src === "local") {
    // Combine rule engine + extra heuristics
    suggestions = validateLayout();
    const objects = getActiveObjects();
    if (objects.length === 0) {
      suggestions.push({type:"hint", msg:"Add at least a Bed and a Panel to start a functional layout."});
    }
    if (objects.filter(o=>o.type==="cabinet").length < 1) {
      suggestions.push({type:"hint", msg:"Consider adding a Cabinet for storage along a wall to free central space."});
    }
    if (objects.filter(o=>o.type==="kitchen").length < 1) {
      suggestions.push({type:"hint", msg:"Consider adding a Kitchen for food preparation and crew nutrition."});
    }
    if (objects.filter(o=>o.type==="exercise").length < 1) {
      suggestions.push({type:"hint", msg:"Consider adding an Exercise area for crew physical health."});
    }
    if (objects.filter(o=>o.type==="private").length < 1) {
      suggestions.push({type:"hint", msg:"Consider adding Private Space for crew psychological well-being."});
    }
  } else {
    try {
      const res = await fetch("http://localhost:5000/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout })
      });
      suggestions = await res.json();
    } catch (e) {
      suggestions = [{type:"error", msg:"AI proxy not reachable. Switch source to Local or start server.js"}];
    }
  }
  renderAISuggestions(suggestions);
}

function renderAISuggestions(items) {
  const ul = document.getElementById("ai-suggestions");
  ul.innerHTML = "";
  for (const it of items) {
    const li = document.createElement("li");
    li.textContent = it.msg;
    li.className = `suggestion-${it.type}`;
    ul.appendChild(li);
  }
}

/* ---------------- Input & interactions ---------------- */
let drag = null;

canvas.addEventListener("mousedown", e => {
  const pos = getMouse(e);
  if (state.tool === "cable") {
    if (!state.cableDraft) state.cableDraft = { id: genId(), type: "cable", points: [] };
    state.cableDraft.points.push({ x: snap(pos.x), y: snap(pos.y) });
    render();
    return;
  }
  const hits = objectsAtPoint(pos.x, pos.y);
  if (hits.length) {
    state.selectedId = hits[hits.length-1];
    const objects = getActiveObjects();
    const obj = objects.find(o=>o.id===state.selectedId);
    drag = { id: obj.id, dx: pos.x - obj.x, dy: pos.y - obj.y };
  } else {
    state.selectedId = null;
  }
  render();
});

canvas.addEventListener("mousemove", e => {
  if (!drag) return;
  const pos = getMouse(e);
  const objects = getActiveObjects();
  const obj = objects.find(o=>o.id===drag.id);
  if (obj) {
    obj.x = snap(pos.x - drag.dx);
    obj.y = snap(pos.y - drag.dy);
    render();
  }
});

canvas.addEventListener("mouseup", e => {
  if (drag) {
    saveState();
  }
  drag = null;
});

canvas.addEventListener("dblclick", e => {
  if (state.tool === "cable" && state.cableDraft && state.cableDraft.points.length >= 2) {
    const activeModule = getActiveModule();
    if (activeModule) {
      activeModule.objects.push(state.cableDraft);
      state.selectedId = state.cableDraft.id;
      state.cableDraft = null;
      state.tool = "select";
      markToolActive();
      saveState();
      render();
    }
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Delete") {
    if (state.selectedId) {
      const activeModule = getActiveModule();
      if (activeModule) {
        activeModule.objects = activeModule.objects.filter(o=>o.id!==state.selectedId);
        state.selectedId = null;
        saveState();
        render();
      }
    }
  } else if (e.key.toLowerCase() === "r") {
    // rotation placeholder: swap w/h for axis-aligned rectangles
    const objects = getActiveObjects();
    const obj = objects.find(o=>o.id===state.selectedId);
    if (obj && obj.type !== "cable") {
      const t = obj.w; obj.w = obj.h; obj.h = t;
      saveState();
      render();
    }
  } else if (e.key.toLowerCase() === "v") {
    state.tool = "select"; markToolActive();
  } else if (e.key.toLowerCase() === "c") {
    state.tool = "cable"; state.cableDraft = { id: genId(), type: "cable", points: [] }; markToolActive();
  } else if (e.code === "KeyD" && (e.ctrlKey || e.metaKey)) {
    const objects = getActiveObjects();
    const obj = objects.find(o=>o.id===state.selectedId);
    if (obj) {
      const activeModule = getActiveModule();
      if (activeModule) {
        const clone = JSON.parse(JSON.stringify(obj));
        clone.id = genId();
        clone.x += GRID; clone.y += GRID;
        activeModule.objects.push(clone);
        state.selectedId = clone.id;
        saveState();
        render();
      }
    }
  }
});

function getMouse(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function render() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawHabitat();
  drawGrid();
  drawObjects();
  drawValidationOverlay();
  updateStats();
}

function updateStats() {
  const objects = getActiveObjects();
  const activeModule = getActiveModule();
  const objectCount = objects.length;
  const totalArea = activeModule ? activeModule.w * activeModule.h : 0;
  const objectArea = objects
    .filter(o => o.type !== "cable")
    .reduce((sum, o) => sum + (o.w * o.h), 0);
  const freeSpacePercent = totalArea > 0 ? Math.round(((totalArea - objectArea) / totalArea) * 100) : 100;
  const issues = validateLayout();
  const issueCount = issues.length;
  
  $("#object-count").textContent = objectCount;
  $("#free-space").textContent = `${freeSpacePercent}%`;
  $("#issue-count").textContent = issueCount;
  
  // Update module list
  renderModuleList();
}

function drawValidationOverlay() {
  const issues = validateLayout();
  const errorObjects = new Set();
  const warnObjects = new Set();
  const objects = getActiveObjects();
  
  // Collect objects with issues
  for (const issue of issues) {
    if (issue.type === "error" || issue.type === "warn") {
      // Simple heuristic: if message contains object name, mark it
      for (const obj of objects) {
        if (obj.type === "cable") continue;
        if (issue.msg.includes(CATALOG[obj.type].name)) {
          if (issue.type === "error") errorObjects.add(obj.id);
          else warnObjects.add(obj.id);
        }
      }
    }
  }
  
  // Draw overlay indicators
  for (const obj of objects) {
    if (obj.type === "cable") continue;
    
    if (errorObjects.has(obj.id)) {
      // Red error overlay
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#ff6b6b";
      ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
      ctx.restore();
    } else if (warnObjects.has(obj.id)) {
      // Yellow warning overlay
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = "#ffd93d";
      ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
      ctx.restore();
    }
  }
}

function markToolActive() {
  $("#tool-select").classList.toggle("active", state.tool === "select");
  $("#tool-cable").classList.toggle("active", state.tool === "cable");
}

// Module management functions
function addModule() {
  const moduleCount = state.modules.length;
  const newModule = {
    id: `module-${moduleCount + 1}`,
    name: `Module ${moduleCount + 1}`,
    x: 50 + (moduleCount * 50),
    y: 50 + (moduleCount * 50),
    w: 1000,
    h: 600,
    corridor: { 
      x: 50 + (moduleCount * 50) + 250, 
      y: 50 + (moduleCount * 50) + 120, 
      w: 500, 
      h: 80 
    },
    objects: []
  };
  state.modules.push(newModule);
  state.activeModuleId = newModule.id;
  saveState();
  renderModuleList();
  render();
}

function switchModule(moduleId) {
  state.activeModuleId = moduleId;
  state.selectedId = null;
  saveState();
  renderModuleList();
  render();
}

function renderModuleList() {
  const list = document.getElementById("module-list");
  list.innerHTML = "";
  
  for (const module of state.modules) {
    const div = document.createElement("div");
    div.className = `module-item ${module.id === state.activeModuleId ? 'active' : ''}`;
    div.innerHTML = `
      <span class="module-name">${module.name}</span>
      <span class="module-count">${module.objects.length} objects</span>
    `;
    div.addEventListener("click", () => switchModule(module.id));
    list.appendChild(div);
  }
}

/* ---------------- UI wiring ---------------- */
$$(".catalog .item").forEach(btn => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.type;
    const activeModule = getActiveModule();
    if (activeModule) {
      addObject(type, activeModule.x + GRID, activeModule.y + GRID);
    }
  });
});

$("#btn-rotate").addEventListener("click", () => {
  const objects = getActiveObjects();
  const obj = objects.find(o=>o.id===state.selectedId);
  if (obj && obj.type !== "cable") {
    const t = obj.w; obj.w = obj.h; obj.h = t;
    saveState();
    render();
  }
});

$("#btn-duplicate").addEventListener("click", () => {
  const objects = getActiveObjects();
  const obj = objects.find(o=>o.id===state.selectedId);
  if (obj) {
    const activeModule = getActiveModule();
    if (activeModule) {
      const clone = JSON.parse(JSON.stringify(obj));
      clone.id = genId();
      clone.x += GRID; clone.y += GRID;
      activeModule.objects.push(clone);
      state.selectedId = clone.id;
      saveState();
      render();
    }
  }
});

$("#btn-delete").addEventListener("click", () => {
  if (state.selectedId) {
    const activeModule = getActiveModule();
    if (activeModule) {
      activeModule.objects = activeModule.objects.filter(o=>o.id!==state.selectedId);
      state.selectedId = null;
      saveState();
      render();
    }
  }
});

$("#tool-select").addEventListener("click", () => {
  state.tool = "select";
  state.cableDraft = null;
  markToolActive();
});

$("#tool-cable").addEventListener("click", () => {
  state.tool = "cable";
  state.cableDraft = { id: genId(), type: "cable", points: [] };
  markToolActive();
});

$("#btn-analyze").addEventListener("click", analyzeAI);

$("#ai-source").addEventListener("change", e => {
  state.aiSource = e.target.value;
  saveState();
});

$("#btn-export").addEventListener("click", () => {
  const data = JSON.stringify({ 
    modules: state.modules,
    activeModuleId: state.activeModuleId,
    version: "2.0"
  }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "habitat-layout.json";
  a.click(); URL.revokeObjectURL(url);
});

$("#btn-import").addEventListener("click", () => $("#import-file").click());
$("#import-file").addEventListener("change", async e => {
  const file = e.target.files[0]; if (!file) return;
  const txt = await file.text();
  try {
    const data = JSON.parse(txt);
    if (data.modules) {
      // New format
      state.modules = data.modules;
      state.activeModuleId = data.activeModuleId || "module-1";
    } else if (data.objects) {
      // Legacy format
      state.modules[0].objects = data.objects;
    }
    state.selectedId = null;
    saveState();
    render();
  } catch (err) { alert("Invalid JSON"); }
});

$("#btn-reset").addEventListener("click", () => {
  if (confirm("Clear current layout?")) {
    const activeModule = getActiveModule();
    if (activeModule) {
      activeModule.objects = [];
    }
    state.selectedId = null;
    saveState();
    render();
  }
});

$("#btn-add-module").addEventListener("click", addModule);

// initial draw
loadState();
renderModuleList();
render();
