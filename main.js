
/* Habitat Layout Creator — cleaned & consolidated main.js
 * - Deduplicated handlers
 * - Stable zoom/pan with world-space hit-testing
 * - Module move/resize with zoom-aware handles
 * - Object select/move + resize + rotate (90°) + duplicate/delete
 * - Cable tool: draft/add points, move points, move whole cable
 * - Overview mode
 * - Import/Export/Reset + Undo/Redo
 *
 * Tip: Keep index.html IDs in sync with the handlers below.
 */

// --------------------------- Constants ---------------------------
const GRID = 20;
const MIN_MODULE_W = 200, MIN_MODULE_H = 150;
const MIN_OBJECT_W = 20, MIN_OBJECT_H = 20;
const HANDLE_WORLD = 8; // handle half-size in world units
const MAX_ZOOM = 3, MIN_ZOOM = 0.3;
// Units conversion: 1 m = 100 units (world units)
const UNITS_PER_METER = 100;

// --------------------------- Catalog & Templates ---------------------------
const MODULE_TEMPLATES = {
  standard: { name: "Standard", w: 1000, h: 600, corridor: { w: 500, h: 80 } },
  compact:  { name: "Compact",  w: 800,  h: 500, corridor: { w: 400, h: 60 } },
  large:    { name: "Large",    w: 1200, h: 700, corridor: { w: 600, h: 100 } },
  wide:     { name: "Wide",     w: 1400, h: 500, corridor: { w: 700, h: 80 } },
  tall:     { name: "Tall",     w: 800,  h: 900, corridor: { w: 400, h: 120 } }
};

const CATALOG = {
  // Basic
  bed:      { w: 160, h: 80,  name: "Bed",      color: "#7aa2f7" },
  panel:    { w: 140, h: 40,  name: "Panel",    color: "#9ece6a" },
  cabinet:  { w: 100, h: 100, name: "Cabinet",  color: "#f7768e" },
  cable:    {               name: "Cable",     color: "#e0af68" }, // polyline

  // Food
  kitchen:  { w: 200, h: 120, name: "Kitchen",  color: "#ff9f43" },
  dining:   { w: 180, h: 100, name: "Dining",   color: "#ff6b6b" },
  storage:  { w: 120, h: 80,  name: "Storage",  color: "#a55eea" },

  // Life support
  atmosphere: { w: 160, h: 100, name: "Atmosphere Control", color: "#26de81" },
  monitor:    { w: 140, h: 60,  name: "Monitor",             color: "#45aaf2" },

  // Exercise & Recreation
  exercise:  { w: 220, h: 140, name: "Exercise",   color: "#fd79a8" },
  recreation:{ w: 180, h: 120, name: "Recreation", color: "#fdcb6e" },

  // Psychology
  private:      { w: 100, h: 80, name: "Private Space", color: "#6c5ce7" },
  communication:{ w: 120, h: 60, name: "Comm Station",  color: "#00b894" }
};
// === IMAGE PRELOAD (icons for objects) ===
const itemImages = {}; // cache: type -> HTMLImageElement

// Відповідність типів з CATALOG → PNG-файлів у /images
const imageMap = {
  // Basic
  bed: "bed.png",
  panel: "panel.png",
  cabinet: "cabinet.png",
  cable: null, // для cable малюємо лінії — іконка не потрібна

  // Food
  kitchen: "kitchen.png",
  dining: "dining.png",
  storage: "storage.png",

  // Life support
  atmosphere: "atmosphere.png",
  monitor: "monitor.png",

  // Exercise & Recreation
  exercise: "exercise.png",
  recreation: "recreation.png",

  // Psychology
  private: "private.png",
  communication: "communication.png"
};

// Препроад усіх іконок, ререндер після загрузки
Object.keys(imageMap).forEach(type => {
  const file = imageMap[type];
  if (!file) return;              // пропускаємо типи без картинки
  const img = new Image();
  img.src = `images/${file}`;     // поклади PNG у /images поряд із index.html
  img.addEventListener("load",  () => { try { render(); } catch (_) {} });
  img.addEventListener("error", () => console.warn(`⚠️ Image not found: ${file}`));
  itemImages[type] = img;
});


// --------------------------- Helpers ---------------------------
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const snap  = (v, g = GRID) => Math.round(v / g) * g;
const genId = () => Math.random().toString(36).slice(2, 9);
const unitsToMeters = (u) => u / UNITS_PER_METER;
const metersToUnits = (m) => m * UNITS_PER_METER;
const areaUnitsToM2 = (u2) => (u2 / (UNITS_PER_METER * UNITS_PER_METER));

function roundRect(x, y, w, h, r, fill = true, stroke = false) {
  const rr = Math.min(r, w * .5, h * .5);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function distanceToLineSegment(px, py, x1, y1, x2, y2) {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
  const dot = A*C + B*D;
  const lenSq = C*C + D*D || 1;
  let t = dot / lenSq;
  t = clamp(t, 0, 1);
  const lx = x1 + t*C, ly = y1 + t*D;
  const dx = px - lx, dy = py - ly;
  return Math.hypot(dx, dy);
}

// --------------------------- Canvas & View ---------------------------
const canvas = $("#canvas");
const ctx = canvas.getContext("2d");

const view = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0
};

function resizeCanvasToContainer() {
  const wrap = document.querySelector(".canvas-wrap");
  if (!wrap) return;
  // Make canvas fill the working area (minus some padding)
  const w = wrap.clientWidth - 24;
  const h = wrap.clientHeight - 24;
  canvas.width = Math.max(600, w);
  canvas.height = Math.max(400, h);
}
window.addEventListener("resize", () => { resizeCanvasToContainer(); render(); });
resizeCanvasToContainer();

function getMouse(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  // invert current transform
  const x = (sx - view.offsetX) / view.zoom;
  const y = (sy - view.offsetY) / view.zoom;
  return { x, y };
}

// --------------------------- State ---------------------------
let state = {
  modules: [
    {
      id: "module-1",
      name: "Main Habitat",
      x: 50, y: 50, w: 1000, h: 600,
      corridor: { x: 300, y: 120, w: 500, h: 80 },
      objects: [],
      color: "#0d1b26",
      type: "habitat"
    }
  ],
  connections: [],
  activeModuleId: "module-1",
  selectedId: null,
  selectedModuleId: null,
  editingModuleId: null,
  tool: "select",    // "select" | "cable" | "module"
  cableDraft: null,  // {id, type:'cable', points:[{x,y},...] } in module-relative coords
  viewMode: "single",
  overviewScale: 0.3,

  // history
  history: [],
  future: []
};

// --------------------------- Mission & Specs ---------------------------
const FUNC_VOLUMES = {
  perCapita: {
    Sleep: 10.76,
    Private: 6.0
  },
  shared: {
    Dining: 10.09,
    Exercise: 20.0,
    Kitchen: 10.0,
    Storage: 12.0,
    Recreation: 10.0,
    Communication: 6.0,
    LifeSupport: 12.0
  }
};

const PHYS_SPECS = {
  bed: { func: "Sleep", minWm: 0.8, minDm: 2.0 },
  private: { func: "Private", minWm: 1.2, minDm: 1.8 },
  dining: { func: "Dining", minWm: 1.6, minDm: 1.6 },
  kitchen: { func: "Kitchen", minWm: 1.6, minDm: 1.0 },
  storage: { func: "Storage", minWm: 1.0, minDm: 1.0 },
  exercise: { func: "Exercise", minWm: 2.0, minDm: 1.5 },
  recreation: { func: "Recreation", minWm: 1.8, minDm: 1.4 },
  communication: { func: "Communication", minWm: 1.2, minDm: 1.0 },
  panel: { func: "LifeSupport", minWm: 1.0, minDm: 0.8 },
  atmosphere: { func: "LifeSupport", minWm: 1.2, minDm: 1.0 },
  monitor: { func: "LifeSupport", minWm: 1.2, minDm: 0.8 }
};

// Recommend size from function volume and deck height (meters)
function recommendSizeMetersFor(type, deckHeightM) {
  const spec = PHYS_SPECS[type];
  if (!spec) return null;
  const func = spec.func;
  // use per-capita for Sleep/Private, shared otherwise; pick a reasonable share
  const vol = (FUNC_VOLUMES.perCapita[func] || FUNC_VOLUMES.shared[func] || 0);
  if (!vol || !deckHeightM) return null;
  const areaM2 = Math.max(vol / deckHeightM, (spec.minWm||0.8) * (spec.minDm||1.0));
  // aspect preference: honor minimums, try to keep close to minW:minD ratio
  const wM = Math.max(spec.minWm || 1.0, Math.sqrt(areaM2));
  const dM = Math.max(spec.minDm || 1.0, areaM2 / wM);
  return { wM, dM };
}

state.mission = state.mission || { crewSize: 4, deckHeightM: 2.4, sizingMode: "manual" };
state.measure = state.measure || { points: [] };

// --------------------------- Persistence ---------------------------
function saveState() {
  localStorage.setItem("habitat-state", JSON.stringify(state));
}
function loadState() {
  try {
    const raw = localStorage.getItem("habitat-state");
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && s.modules) state = Object.assign(state, s);
  } catch (e) { /* ignore */ }
}
loadState();

function saveToHistory() {
  state.history.push(JSON.stringify({ modules: state.modules, activeModuleId: state.activeModuleId }));
  if (state.history.length > 100) state.history.shift();
  state.future = [];
  saveState();
}
function undo() {
  if (!state.history.length) return;
  state.future.push(JSON.stringify({ modules: state.modules, activeModuleId: state.activeModuleId }));
  const prev = JSON.parse(state.history.pop());
  state.modules = prev.modules;
  state.activeModuleId = prev.activeModuleId;
  state.selectedId = null;
  state.cableDraft = null;
  saveState();
  renderModuleList();
  render();
}
function redo() {
  if (!state.future.length) return;
  state.history.push(JSON.stringify({ modules: state.modules, activeModuleId: state.activeModuleId }));
  const next = JSON.parse(state.future.pop());
  state.modules = next.modules;
  state.activeModuleId = next.activeModuleId;
  state.selectedId = null;
  state.cableDraft = null;
  saveState();
  renderModuleList();
  render();
}

// --------------------------- Module helpers ---------------------------
function getActiveModule() {
  return state.modules.find(m => m.id === state.activeModuleId) || null;
}
function getActiveObjects() {
  return getActiveModule()?.objects || [];
}
function modulesAtPoint(x, y) {
  const arr = [];
  for (const m of state.modules) {
    if (x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) {
      arr.push(m.id);
    }
  }
  return arr;
}

function addModule(templateKey = "standard", customConfig = null) {
  saveToHistory();
  const moduleCount = state.modules.length;
  let template, moduleName, moduleColor, moduleType, corridorWidth;

  if (customConfig) {
    ({ template, name: moduleName, color: moduleColor, type: moduleType } = customConfig);
    corridorWidth = customConfig.corridorWidth ?? template.corridor.w;
  } else {
    template = MODULE_TEMPLATES[templateKey];
    moduleName = `${template.name} Module ${moduleCount + 1}`;
    moduleColor = "#0d1b26";
    moduleType = "habitat";
    corridorWidth = template.corridor.w;
  }

  const offsetX = 50 + moduleCount * 30;
  const offsetY = 50 + moduleCount * 30;

  const newModule = {
    id: `module-${moduleCount + 1}`,
    name: moduleName,
    x: offsetX, y: offsetY,
    w: template.w, h: template.h,
    corridor: {
      x: offsetX + (template.w - corridorWidth) / 2,
      y: offsetY + (template.h - template.corridor.h) / 2,
      w: corridorWidth,
      h: template.corridor.h
    },
    objects: [],
    color: moduleColor,
    type: moduleType
  };
  state.modules.push(newModule);
  state.activeModuleId = newModule.id;
  state.selectedId = null;
  state.cableDraft = null;

  // simple auto-connection
  if (moduleCount > 0) {
    const prev = state.modules[moduleCount - 1];
    state.connections.push({ id: `conn-${state.connections.length + 1}`, from: prev.id, to: newModule.id, type: "Habitat Link" });
  }

  saveState();
  renderModuleList();
  render();
}

function switchModule(id) {
  state.activeModuleId = id;
  state.selectedId = null;
  state.cableDraft = null;
  saveState();
  renderModuleList();
  render();
}
function deleteModule(id) {
  if (state.modules.length <= 1) return alert("Cannot delete the last module!");
  saveToHistory();
  state.modules = state.modules.filter(m => m.id !== id);
  state.connections = state.connections.filter(c => c.from !== id && c.to !== id);
  if (state.activeModuleId === id) state.activeModuleId = state.modules[0]?.id;
  state.selectedId = null;
  state.selectedModuleId = null;
  state.cableDraft = null;
  saveState();
  renderModuleList();
  render();
}
function resizeModule(id, newW, newH) {
  const m = state.modules.find(x => x.id === id);
  if (!m) return;
  m.w = Math.max(MIN_MODULE_W, snap(newW));
  m.h = Math.max(MIN_MODULE_H, snap(newH));
  // keep corridor centered
  m.corridor.x = m.x + (m.w - m.corridor.w) / 2;
  m.corridor.y = m.y + (m.h - m.corridor.h) / 2;
}

// --------------------------- Object helpers ---------------------------
function addObject(type, x, y) {
  const m = getActiveModule(); if (!m) return;
  const cat = CATALOG[type]; if (!cat) return;
  // sizing: use NASA recommendation if sizingMode === 'nasa'
  let wUnits = cat.w ?? 40, hUnits = cat.h ?? 40;
  if (state.mission.sizingMode === "nasa") {
    const rec = recommendSizeMetersFor(type, state.mission.deckHeightM || 2.4);
    if (rec) { wUnits = metersToUnits(rec.wM); hUnits = metersToUnits(rec.dM); }
  }
  const obj = { id: genId(), type, x: snap(x - m.x), y: snap(y - m.y), w: wUnits, h: hUnits };
  let tries = 0;
  while (overlapsAny(obj, obj.id) && tries < 500) {
    // спіраль/зміщення по GRID
    obj.x += GRID;
    if (obj.x + obj.w > m.w) { obj.x = 0; obj.y += GRID; }
    if (obj.y + obj.h > m.h) { obj.y = 0; } // зациклюємося 
    tries++;
  }
  clampObjectToModule(obj);
  if (!overlapsAny(obj, obj.id)) {
    m.objects.push(obj);
    saveState(); render();
  } else {
    alert("Немає вільного місця для цього елемента без перекриття.");
  }
}

function findObjectById(id) {
  const m = getActiveModule(); if (!m) return null;
  return m.objects.find(o => o.id === id) || null;
}

function clampObjectToModule(obj) {
  const m = getActiveModule(); if (!m) return;
  obj.w = clamp(obj.w, MIN_OBJECT_W, m.w);
  obj.h = clamp(obj.h, MIN_OBJECT_H, m.h);
  obj.x = clamp(obj.x, 0, m.w - obj.w);
  obj.y = clamp(obj.y, 0, m.h - obj.h);
}

// --- Collision helpers ---
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function overlapsAny(candidate, ignoreId) {
  const objs = getActiveObjects();
  for (const o of objs) {
    if (o.id === ignoreId || o.type === "cable") continue;
    if (rectsOverlap(candidate, o)) return true;
  }
  return false;
}


// --------------------------- UI wiring (sidebar/catalog) ---------------------------
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".category-btn");
  if (btn) {
    const cat = btn.dataset.category;
    const menu = document.getElementById(`${cat}-menu`);
    if (menu) {
      const isOpen = menu.style.display !== "none";
      $$(".category-menu").forEach(m => (m.style.display = "none"));
      $$(".category-btn").forEach(b => b.classList.remove("active"));
      if (!isOpen) { menu.style.display = "block"; btn.classList.add("active"); }
    }
  } else if (!e.target.closest(".category-group")) {
    $$(".category-menu").forEach(m => (m.style.display = "none"));
    $$(".category-btn").forEach(b => b.classList.remove("active"));
  }
});

// catalog item click
$$(".catalog .item").forEach(b => {
  b.addEventListener("click", () => {
    const type = b.dataset.type;
    const m = getActiveModule();
    if (m) addObject(type, m.x + GRID, m.y + GRID);
  });
});

// --------------------------- Buttons / Tools ---------------------------
function markToolActive() {
  $("#tool-select")?.classList.toggle("active", state.tool === "select");
  $("#tool-cable")?.classList.toggle("active", state.tool === "cable");
  $("#tool-module")?.classList.toggle("active", state.tool === "module");
  $("#tool-measure")?.classList.toggle("active", state.tool === "measure");
}

$("#tool-select")?.addEventListener("click", () => {
  state.tool = "select";
  state.cableDraft = null;
  markToolActive(); render();
});

$("#tool-cable")?.addEventListener("click", () => {
  state.tool = "cable";
  state.cableDraft = { id: genId(), type: "cable", points: [] };
  markToolActive(); render();
});

$("#tool-module")?.addEventListener("click", () => {
  state.tool = "module";
  state.selectedModuleId = state.activeModuleId;
  markToolActive(); render();
});

$("#tool-measure")?.addEventListener("click", () => {
  state.tool = "measure";
  state.measure.points = [];
  markToolActive(); render();
});

$("#btn-rotate")?.addEventListener("click", () => {
  const m = getActiveModule(); if (!m) return;
  const o = findObjectById(state.selectedId); if (!o || o.type === "cable") return;

  saveToHistory();

  // кандидат після ротації
  const cand = { x: o.x, y: o.y, w: o.h, h: o.w }; // swap w/h
  // вписати у модуль
  cand.w = clamp(cand.w, MIN_OBJECT_W, m.w);
  cand.h = clamp(cand.h, MIN_OBJECT_H, m.h);
  cand.x = clamp(cand.x, 0, m.w - cand.w);
  cand.y = clamp(cand.y, 0, m.h - cand.h);

  if (!overlapsAny(cand, o.id)) {
    // ок, застосовуємо
    o.x = cand.x; o.y = cand.y; [o.w, o.h] = [cand.w, cand.h];
  } else {
    // спробуємо знайти найближчу вільну клітину по сітці
    const start = { x: cand.x, y: cand.y };
    let tries = 0;
    while (overlapsAny(cand, o.id) && tries < 400) {
      cand.x += GRID;
      if (cand.x + cand.w > m.w) { cand.x = 0; cand.y += GRID; }
      if (cand.y + cand.h > m.h) { cand.y = 0; }
      tries++;
    }
    if (!overlapsAny(cand, o.id)) {
      o.x = cand.x; o.y = cand.y; [o.w, o.h] = [cand.w, cand.h];
    } else {
      // немає місця — відхиляємо
      // (не змінюємо розміри, залишаємо як було)
    }
  }

  saveState(); render();
});


$("#btn-duplicate")?.addEventListener("click", () => {
  const m = getActiveModule(); if (!m) return;
  const src = findObjectById(state.selectedId); if (!src || src.type === "cable") return;

  saveToHistory();

  const clone = JSON.parse(JSON.stringify(src));
  clone.id = genId();
  // стартова пропозиція — зі зсувом по GRID
  clone.x = clamp(snap(src.x + GRID), 0, m.w - src.w);
  clone.y = clamp(snap(src.y + GRID), 0, m.h - src.h);

  // шукаємо першу вільну комірку
  let tries = 0;
  while (overlapsAny(clone, clone.id) && tries < 600) {
    clone.x += GRID;
    if (clone.x + clone.w > m.w) { clone.x = 0; clone.y += GRID; }
    if (clone.y + clone.h > m.h) { clone.y = 0; } // обхід по сітці
    tries++;
  }

  if (overlapsAny(clone, clone.id)) {
    alert("Немає вільного місця для дубліката без перекриття.");
    return;
  }

  m.objects.push(clone);
  state.selectedId = clone.id;
  saveState(); render();
});


$("#btn-delete")?.addEventListener("click", () => {
  const m = getActiveModule(); if (!m) return;
  if (!state.selectedId) return;
  saveToHistory();
  m.objects = m.objects.filter(o => o.id !== state.selectedId);
  state.selectedId = null;
  saveState(); render();
});

$("#btn-export")?.addEventListener("click", () => {
  const data = JSON.stringify({ modules: state.modules, activeModuleId: state.activeModuleId, version: "2.0" }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "habitat-layout.json"; a.click();
  URL.revokeObjectURL(url);
});

$("#btn-import")?.addEventListener("click", () => $("#import-file")?.click());
$("#import-file")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  const txt = await file.text();
  try {
    const data = JSON.parse(txt);
    saveToHistory();
    if (data.modules) {
      state.modules = data.modules;
      state.activeModuleId = data.activeModuleId || state.modules[0]?.id || "module-1";
    } else if (data.objects) {
      // legacy
      state.modules[0].objects = data.objects;
    }
    state.selectedId = null; state.cableDraft = null;
    saveState(); renderModuleList(); render();
  } catch { alert("Invalid JSON"); }
});

$("#btn-reset")?.addEventListener("click", () => {
  if (!confirm("Clear current layout?")) return;
  const m = getActiveModule(); if (!m) return;
  saveToHistory();
  m.objects = [];
  state.selectedId = null; state.cableDraft = null;
  saveState(); render();
});

$("#btn-add-module")?.addEventListener("click", () => showModuleModal());
$("#btn-overview")?.addEventListener("click", () => toggleOverviewMode());
$("#btn-edit-module")?.addEventListener("click", () => state.selectedModuleId && editModule(state.selectedModuleId));
$("#btn-delete-module")?.addEventListener("click", () => {
  if (!state.selectedModuleId) return;
  if (confirm("Delete this module?")) deleteModule(state.selectedModuleId);
});

$("#btn-undo")?.addEventListener("click", undo);
$("#btn-redo")?.addEventListener("click", redo);

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.key === "v" || e.key === "V") { state.tool = "select"; markToolActive(); }
  if (e.key === "c" || e.key === "C") { state.tool = "cable";  markToolActive(); }
  if (e.key === "m" || e.key === "M") { state.tool = "module"; state.selectedModuleId = state.activeModuleId; markToolActive(); }
  if (e.key === "r" || e.key === "R") { $("#btn-rotate")?.click(); }
  if (e.key === "Delete")           { $("#btn-delete")?.click(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); $("#btn-duplicate")?.click(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
    e.preventDefault(); redo();
  }
});

// --------------------------- Modals (create/edit) ---------------------------
function showModuleModal() {
  const modal = $("#module-modal"); if (!modal) return;
  modal.style.display = "block";
  $("#module-name").value = `Module ${state.modules.length + 1}`;
  $("#module-template-select").value = "standard";
  $("#module-color").value = "#0d1b26";
  $("#module-type").value = "habitat";
  $("#custom-size-group").style.display = "none";
}

function hideModuleModal(){ $("#module-modal")?.style && ($("#module-modal").style.display = "none"); }
function hideEditModal(){ $("#edit-modal")?.style && ($("#edit-modal").style.display = "none"); state.editingModuleId = null; }

$("#btn-create-module")?.addEventListener("click", () => {
  const name = $("#module-name").value.trim();
  const templateKey = $("#module-template-select").value;
  const color = $("#module-color").value;
  const type = $("#module-type").value;
  if (!name) return alert("Please enter a module name!");

  let templateData = MODULE_TEMPLATES[templateKey];
  if (templateKey === "custom") {
    const width = parseInt($("#module-width").value, 10);
    const height = parseInt($("#module-height").value, 10);
    if (width < MIN_MODULE_W || height < MIN_MODULE_H) return alert(`Minimum size is ${MIN_MODULE_W}x${MIN_MODULE_H}px`);
    templateData = { w: width, h: height, corridor: { w: Math.max(80, Math.min(width - 160, 600)), h: 80 } };
  }
  addModule(null, { template: templateData, name, color, type, corridorWidth: templateData.corridor.w });
  hideModuleModal();
});
$("#btn-cancel-module")?.addEventListener("click", hideModuleModal);
$(".close")?.addEventListener("click", hideModuleModal);

$("#btn-save-module")?.addEventListener("click", () => {
  const id = state.editingModuleId; if (!id) return;
  const m = state.modules.find(mm => mm.id === id); if (!m) return;
  const name = $("#edit-module-name").value.trim();
  const width = parseInt($("#edit-module-width").value, 10);
  const height = parseInt($("#edit-module-height").value, 10);
  const color = $("#edit-module-color").value;
  const type = $("#edit-module-type").value;
  if (!name) return alert("Please enter a module name!");
  if (width < MIN_MODULE_W || height < MIN_MODULE_H) return alert(`Minimum size is ${MIN_MODULE_W}x${MIN_MODULE_H}px`);
  saveToHistory();
  m.name = name; m.color = color; m.type = type;
  resizeModule(id, width, height);
  saveState(); renderModuleList(); render(); hideEditModal();
});
$("#btn-cancel-edit")?.addEventListener("click", hideEditModal);
$(".close-edit")?.addEventListener("click", hideEditModal);

$("#module-template-select")?.addEventListener("change", () => {
  const key = $("#module-template-select").value;
  $("#custom-size-group").style.display = key === "custom" ? "block" : "none";
  if (MODULE_TEMPLATES[key]) {
    $("#module-width").value = MODULE_TEMPLATES[key].w;
    $("#module-height").value = MODULE_TEMPLATES[key].h;
  }
});

// --------------------------- Rendering ---------------------------
function drawGrid() {
  const m = getActiveModule(); if (!m) return;
  ctx.save();
  ctx.strokeStyle = "#11202c";
  ctx.lineWidth = 1;
  for (let x = m.x; x <= m.x + m.w; x += GRID) {
    ctx.beginPath(); ctx.moveTo(x, m.y); ctx.lineTo(x, m.y + m.h); ctx.stroke();
  }
  for (let y = m.y; y <= m.y + m.h; y += GRID) {
    ctx.beginPath(); ctx.moveTo(m.x, y); ctx.lineTo(m.x + m.w, y); ctx.stroke();
  }
  ctx.restore();
}

function drawResizeHandlesForRect(rx, ry, rw, rh) {
  const s = HANDLE_WORLD;
  const pts = [
    {k:"nw", x:rx,        y:ry       },
    {k:"n",  x:rx+rw/2,   y:ry       },
    {k:"ne", x:rx+rw,     y:ry       },
    {k:"w",  x:rx,        y:ry+rh/2  },
    {k:"e",  x:rx+rw,     y:ry+rh/2  },
    {k:"sw", x:rx,        y:ry+rh    },
    {k:"s",  x:rx+rw/2,   y:ry+rh    },
    {k:"se", x:rx+rw,     y:ry+rh    }
  ];
  ctx.save();
  ctx.fillStyle = "#ffd166";
  for (const p of pts) ctx.fillRect(p.x - s, p.y - s, s*2, s*2);
  ctx.restore();
}

function getResizeHandleAtPointRect(px, py, rx, ry, rw, rh) {
  const s = HANDLE_WORLD * 1.5; // bit easier to hit
  const spots = [
    {k:"nw", x:rx,        y:ry       },
    {k:"n",  x:rx+rw/2,   y:ry       },
    {k:"ne", x:rx+rw,     y:ry       },
    {k:"w",  x:rx,        y:ry+rh/2  },
    {k:"e",  x:rx+rw,     y:ry+rh/2  },
    {k:"sw", x:rx,        y:ry+rh    },
    {k:"s",  x:rx+rw/2,   y:ry+rh    },
    {k:"se", x:rx+rw,     y:ry+rh    }
  ];
  for (const p of spots) {
    if (Math.abs(px - p.x) <= s && Math.abs(py - p.y) <= s) return p.k;
  }
  return null;
}

function drawHabitat() {
  const m = getActiveModule(); if (!m) return;

  // module body
  ctx.fillStyle = m.color || "#0d1b26";
  ctx.strokeStyle = "#284157"; ctx.lineWidth = 2;
  roundRect(m.x, m.y, m.w, m.h, 16, true, true);

  // selected frame + handles (module tool)
  if (state.tool === "module" && state.selectedModuleId === m.id) {
    ctx.save();
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    roundRect(m.x - 2, m.y - 2, m.w + 4, m.h + 4, 18, false, true);
    drawResizeHandlesForRect(m.x, m.y, m.w, m.h);
    ctx.restore();
  }

  // label
  ctx.fillStyle = "#9ad";
  ctx.font = "bold 14px system-ui";
  ctx.fillText(m.name, m.x + 8, m.y - 10);
}

function drawObjects() {
  const m = getActiveModule(); if (!m) return;
  const objs = m.objects;

  for (const o of objs) {
    if (o.type === "cable") {
      drawCable(o, m);
      continue;
    }

    const cat = CATALOG[o.type] || { name: o.type, color: "#999" };
    const gx = m.x + o.x, gy = m.y + o.y;

    // 1) базова підкладка (як було)
    ctx.fillStyle = cat.color;
    ctx.strokeStyle = "#0b0b0b";
    ctx.lineWidth = 1.5;
    ctx.fillRect(gx, gy, o.w, o.h);
    ctx.strokeRect(gx, gy, o.w, o.h);

    // 2) іконка, якщо є
    const img = itemImages[o.type];
    if (img && img.complete && img.naturalWidth) {
      // Вписуємо в область об'єкта; за бажанням додай відступи
      // const pad = 6; ctx.drawImage(img, gx+pad, gy+pad, o.w-2*pad, o.h-2*pad);
      ctx.drawImage(img, gx, gy, o.w, o.h);
    }

    // 3) напис (залишив як було; якщо хочеш мінімалістично — просто прибери ці три рядки)
    ctx.fillStyle = "#e6e6e6";
    ctx.font = "12px system-ui";
    ctx.fillText(cat.name, gx + 6, gy + 16);

    // 4) рамка виділення + хендли
    if (state.selectedId === o.id) {
      ctx.save();
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 2;
      ctx.strokeRect(gx - 2, gy - 2, o.w + 4, o.h + 4);
      drawResizeHandlesForRect(gx, gy, o.w, o.h);
      ctx.restore();
    }
  }

  // пунктир для чернетки кабелю (без змін)
  if (state.cableDraft?.points?.length) {
    const pts = state.cableDraft.points;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = CATALOG.cable.color;
    ctx.beginPath();
    const p0 = { x: getActiveModule().x + pts[0].x, y: getActiveModule().y + pts[0].y };
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const pg = { x: getActiveModule().x + pts[i].x, y: getActiveModule().y + pts[i].y };
      ctx.lineTo(pg.x, pg.y);
    }
    ctx.stroke();
    ctx.restore();
  }
}


function drawCable(cable, m) {
  const pts = cable.points || [];
  if (pts.length < 2) return;
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#e0af68";
  ctx.beginPath();
  ctx.moveTo(m.x + pts[0].x, m.y + pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(m.x + pts[i].x, m.y + pts[i].y);
  ctx.stroke();

  // points if cable selected
  if (state.selectedId === cable.id) {
    ctx.fillStyle = "#ffd166";
    for (const p of pts) ctx.fillRect(m.x + p.x - 4, m.y + p.y - 4, 8, 8);
  }
  ctx.restore();
}

function computeFunctionVolumes(m) {
  const map = {};
  const deck = state.mission.deckHeightM;
  for (const o of (m.objects || [])) {
    if (o.type === "cable") continue;
    const spec = PHYS_SPECS[o.type];
    if (!spec) continue;
    const func = spec.func;
    const areaM2 = areaUnitsToM2(o.w * o.h);
    const vol = areaM2 * deck;
    map[func] = (map[func] || 0) + vol;
  }
  return map;
}

function getRequiredVolumes() {
  const req = {};
  const crew = Number(state.mission.crewSize || 4);
  for (const k of Object.keys(FUNC_VOLUMES.perCapita)) req[k] = FUNC_VOLUMES.perCapita[k] * crew;
  for (const k of Object.keys(FUNC_VOLUMES.shared)) req[k] = (req[k] || 0) + FUNC_VOLUMES.shared[k];
  return req;
}

function drawValidationOverlay(){
  const m = getActiveModule(); if (!m) return;
  const funcVols = computeFunctionVolumes(m);
  const req = getRequiredVolumes();
  const okFunc = {};
  for (const k of Object.keys(req)) okFunc[k] = (funcVols[k] || 0) >= (req[k] || 0);

  for (const o of m.objects) {
    if (o.type === "cable") continue;
    const func = PHYS_SPECS[o.type]?.func;
    if (!func) continue;
    // Object-level ergonomics: respect min width/depth
    const wM = unitsToMeters(o.w), dM = unitsToMeters(o.h);
    const spec = PHYS_SPECS[o.type];
    const dimsOk = (wM >= (spec?.minWm||0)) && (dM >= (spec?.minDm||0));
    const ok = okFunc[func] && dimsOk;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = ok ? "#22c55e" : "#ef4444";
    ctx.strokeRect(m.x + o.x, m.y + o.y, o.w, o.h);
    ctx.restore();
  }

  // Zoning violations visualization (min 2m between noisy/dirty and sleep/private)
  const noisy = state.mission.zoningNoisy || ["exercise", "kitchen", "storage"];
  const sleep = state.mission.zoningSleep || ["bed", "private"];
  const minDistUnits = (state.mission.zoningMinDistM || 2) * UNITS_PER_METER;
  const objs = (m.objects || []).filter(o=>o.type !== "cable");
  for (const a of objs) {
    for (const b of objs) {
      if (a.id === b.id) continue;
      if (!(noisy.includes(a.type) && sleep.includes(b.type))) continue;
      const ax = m.x + a.x + a.w/2, ay = m.y + a.y + a.h/2;
      const bx = m.x + b.x + b.w/2, by = m.y + b.y + b.h/2;
      const d = Math.hypot(ax - bx, ay - by);
      if (d < minDistUnits) {
        ctx.save();
        ctx.setLineDash([6,4]);
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.restore();
      }
    }
  }
}

function drawScaleBar() {
  // draw in screen space at bottom-left
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  const margin = 16;
  const pxPerUnit = view.zoom; // because world unit scaled by view.zoom
  const meters = 2; // 2 m bar
  const units = meters * UNITS_PER_METER;
  const px = units * pxPerUnit;
  const y = canvas.height - margin - 10;
  const x = margin;
  ctx.fillStyle = "#e6e6e6";
  ctx.strokeStyle = "#e6e6e6";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + px, y);
  ctx.stroke();
  ctx.font = "12px system-ui";
  ctx.fillText(`${meters} m`, x + px + 8, y + 4);
  ctx.restore();
}

function drawMeasureOverlay() {
  const pts = state.measure?.points || [];
  if (pts.length === 0) return;
  ctx.save();
  ctx.setLineDash([6,4]);
  ctx.strokeStyle = "#93c5fd";
  ctx.lineWidth = 2;
  if (pts.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
    const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
    const distUnits = Math.hypot(dx, dy);
    const distM = unitsToMeters(distUnits);
    ctx.setLineDash([]);
    ctx.fillStyle = "#e6e6e6";
    ctx.font = "12px system-ui";
    ctx.fillText(`${distM.toFixed(2)} m`, (pts[0].x + pts[1].x)/2 + 8, (pts[0].y + pts[1].y)/2 - 8);
  }
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.setTransform(view.zoom, 0, 0, view.zoom, view.offsetX, view.offsetY);

  if (state.viewMode === "overview") {
    drawOverviewMode();
  } else {
    drawStarryBackground();
    drawHabitat();
    drawGrid();
    drawObjects();
    drawValidationOverlay();
    drawMeasureOverlay();
  }

  ctx.restore();
  drawRulers();
  updateStats();
  updateOverviewButton();
  updateInspector();
  drawScaleBar();
}

// --------------------------- Overview Mode ---------------------------
function toggleOverviewMode() {
  state.viewMode = state.viewMode === "single" ? "overview" : "single";
  state.selectedId = null; state.cableDraft = null;
  saveState(); render();
}

function drawOverviewMode() {
  // simple scaled preview of modules
  const scale = state.overviewScale;
  for (const m of state.modules) {
    const x = m.x * scale, y = m.y * scale, w = m.w * scale, h = m.h * scale;
    ctx.fillStyle = m.color || "#0d1b26";
    ctx.strokeStyle = m.id === state.activeModuleId ? "#3b82f6" : "#284157";
    ctx.lineWidth = m.id === state.activeModuleId ? 3 : 2;
    roundRect(x, y, w, h, 8, true, true);
    ctx.fillStyle = "#9ad"; ctx.font = "bold 10px system-ui";
    ctx.fillText(m.name, x + 5, y - 5);
  }
  // connections
  ctx.strokeStyle = "#666"; ctx.lineWidth = 2;
  for (const c of state.connections) {
    const m1 = state.modules.find(mm => mm.id === c.from);
    const m2 = state.modules.find(mm => mm.id === c.to);
    if (!m1 || !m2) continue;
    const x1 = (m1.x + m1.w/2) * scale, y1 = (m1.y + m1.h/2) * scale;
    const x2 = (m2.x + m2.w/2) * scale, y2 = (m2.y + m2.h/2) * scale;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
}

// --------------------------- Stats / UI ---------------------------
function updateStats() {
  const m = getActiveModule(); if (!m) return;
  $("#object-count") && ($("#object-count").textContent = m.objects.filter(o=>o.type!=="cable").length);
  const occArea = m.objects.filter(o=>o.type!=="cable").reduce((a,o)=>a+o.w*o.h,0);
  const free = Math.max(0, 100 - Math.round(occArea/(m.w*m.h)*100));
  $("#free-space") && ($("#free-space").textContent = free + "%");
  // count zoning violations
  const objs = (m.objects||[]).filter(o=>o.type!=="cable");
  const noisy = state.mission.zoningNoisy || ["exercise", "kitchen", "storage"];
  const sleep = state.mission.zoningSleep || ["bed", "private"];
  const minDistUnits = (state.mission.zoningMinDistM || 2) * UNITS_PER_METER;
  let violations = 0;
  for (let i=0;i<objs.length;i++){
    for (let j=i+1;j<objs.length;j++){
      const a = objs[i], b = objs[j];
      const pair = (noisy.includes(a.type) && sleep.includes(b.type)) || (noisy.includes(b.type) && sleep.includes(a.type));
      if (!pair) continue;
      const ax = a.x + a.w/2, ay = a.y + a.h/2;
      const bx = b.x + b.w/2, by = b.y + b.h/2;
      const d = Math.hypot(ax - bx, ay - by);
      if (d < minDistUnits) violations++;
    }
  }
  $("#issue-count") && ($("#issue-count").textContent = String(violations));

  // Area/Volume totals
  const areaM2 = areaUnitsToM2(m.w * m.h);
  const volM3 = areaM2 * (state.mission.deckHeightM || 2.4);
  $("#total-area-m2") && ($("#total-area-m2").textContent = areaM2.toFixed(2));
  $("#total-vol-m3") && ($("#total-vol-m3").textContent = volM3.toFixed(2));

  // NASA compliance percent (aggregate across functions)
  const got = computeFunctionVolumes(m);
  const req = getRequiredVolumes();
  const funcs = Object.keys(req);
  let sumGot = 0, sumReq = 0;
  for (const k of funcs) { sumGot += (got[k]||0); sumReq += (req[k]||0); }
  const pct = sumReq > 0 ? Math.min(100, Math.round((sumGot/sumReq)*100)) : 0;
  $("#nasa-compliance") && ($("#nasa-compliance").textContent = pct + "%");
}
function updateOverviewButton() {
  const btn = $("#btn-overview"); if (!btn) return;
  if (state.viewMode === "overview") {
    btn.textContent = "👁️ Single Mode";
    btn.style.background = "#dc2626";
  } else {
    btn.textContent = "👁️ Overview Mode";
    btn.style.background = "#7c3aed";
  }
  const editBtn = $("#btn-edit-module");
  const delBtn  = $("#btn-delete-module");
  if (editBtn && delBtn) {
    const show = state.tool === "module" && !!state.selectedModuleId;
    editBtn.style.display = show ? "block" : "none";
    delBtn.style.display  = show ? "block" : "none";
  }
}

function renderModuleList() {
  const list = $("#module-list"); if (!list) return;
  list.innerHTML = "";
  for (const m of state.modules) {
    const div = document.createElement("div");
    div.className = `module-item ${m.id === state.activeModuleId ? "active" : ""}`;
    div.innerHTML = `<span class="module-name">${m.name}</span><span class="module-count">${m.objects.length} objects</span>`;
    div.addEventListener("click", () => switchModule(m.id));
    list.appendChild(div);
  }
}
renderModuleList();

// --------------------------- Mouse & Tools ---------------------------
let drag = null; // {type, ...}

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const old = view.zoom;
  const intensity = 0.1;
  view.zoom = clamp(view.zoom - e.deltaY * intensity / 100, MIN_ZOOM, MAX_ZOOM);

  // zoom towards cursor
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const ratio = view.zoom / old;
  view.offsetX = mx - (mx - view.offsetX) * ratio;
  view.offsetY = my - (my - view.offsetY) * ratio;
  render();
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("mousedown", (e) => {
  const pos = getMouse(e);
  if (state.viewMode === "overview") {
    // pick module to focus
    const hits = modulesAtPoint(pos.x, pos.y);
    if (hits.length) { switchModule(hits[hits.length-1]); state.viewMode = "single"; render(); }
    return;
  }

  // right button => pan
  if (e.button === 2) {
    view.isPanning = true;
    view.panStartX = e.clientX - view.offsetX;
    view.panStartY = e.clientY - view.offsetY;
    return;
  }
  if (e.button !== 0) return;

  if (state.tool === "module") {
    const m = getActiveModule(); if (!m) return;
    state.selectedModuleId = m.id;
    // handles first
    const handle = getResizeHandleAtPointRect(pos.x, pos.y, m.x, m.y, m.w, m.h);
    if (handle) {
      drag = { type: "resize-module", id: m.id, handle, startX: m.x, startY: m.y, startW: m.w, startH: m.h };
      return;
    }
    // inside => move
    if (pos.x >= m.x && pos.x <= m.x + m.w && pos.y >= m.y && pos.y <= m.y + m.h) {
      drag = { type: "move-module", id: m.id, dx: pos.x - m.x, dy: pos.y - m.y };
    }
    return;
  }

  if (state.tool === "select") {
    const m = getActiveModule(); if (!m) return;
    const rx = pos.x - m.x, ry = pos.y - m.y;
    const objs = getActiveObjects();

    // try resize handles first
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.type === "cable") continue;
      const h = getResizeHandleAtPointRect(pos.x, pos.y, m.x + o.x, m.y + o.y, o.w, o.h);
      if (h) {
        state.selectedId = o.id;
        drag = { type: "resize-object", id: o.id, handle: h, startX: o.x, startY: o.y, startW: o.w, startH: o.h };
        render();
        return;
      }
    }

    // then object body
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.type === "cable") continue;
      if (rx >= o.x && rx <= o.x + o.w && ry >= o.y && ry <= o.y + o.h) {
        state.selectedId = o.id;
        drag = { type: "move-object", id: o.id, dx: rx - o.x, dy: ry - o.y };
        render();
        return;
      }
    }

    // click empty
    state.selectedId = null; render();
    return;
  }

  if (state.tool === "cable") {
    const m = getActiveModule(); if (!m) return;
    const objs = getActiveObjects();

    // hit test cable points
    const r = 8;
    for (const c of objs) {
      if (c.type !== "cable" || !c.points) continue;
      for (let i = 0; i < c.points.length; i++) {
        const p = c.points[i]; const gx = m.x + p.x, gy = m.y + p.y;
        if (Math.abs(pos.x - gx) <= r && Math.abs(pos.y - gy) <= r) {
          state.selectedId = c.id;
          drag = { type: "move-cable-point", id: c.id, pointIndex: i, dx: pos.x - gx, dy: pos.y - gy };
          return;
        }
      }
    }

    // hit test cable segments -> drag whole cable
    for (const c of objs) {
      if (c.type !== "cable" || !c.points || c.points.length < 2) continue;
      for (let i = 0; i < c.points.length - 1; i++) {
        const p1 = c.points[i], p2 = c.points[i+1];
        const d = distanceToLineSegment(pos.x, pos.y, m.x + p1.x, m.y + p1.y, m.x + p2.x, m.y + p2.y);
        if (d < 8) {
          state.selectedId = c.id;
          drag = { type: "move-cable", id: c.id, lastX: pos.x, lastY: pos.y };
          return;
        }
      }
    }

    // else: extend draft (module-relative)
    if (!state.cableDraft) state.cableDraft = { id: genId(), type: "cable", points: [] };
    state.cableDraft.points.push({ x: snap(pos.x - m.x), y: snap(pos.y - m.y) });
    render();
    return;
  }

  if (state.tool === "measure") {
    const m = getActiveModule(); if (!m) return;
    const pt = { x: pos.x, y: pos.y };
    state.measure.points.push(pt);
    if (state.measure.points.length > 2) state.measure.points = [pt];
    render();
    return;
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (view.isPanning) {
    view.offsetX = e.clientX - view.panStartX;
    view.offsetY = e.clientY - view.panStartY;
    render(); return;
  }

  const pos = getMouse(e);
  if (!drag) {
    // cursor feedback
    if (state.tool === "module") {
      const m = getActiveModule();
      const handle = m ? getResizeHandleAtPointRect(pos.x, pos.y, m.x, m.y, m.w, m.h) : null;
      canvas.style.cursor = handle ? (["n","s"].includes(handle) ? "ns-resize" :
                                      ["e","w"].includes(handle) ? "ew-resize" :
                                      (handle==="ne"||handle==="sw") ? "nesw-resize" : "nwse-resize")
                                   : "default";
    } else if (state.tool === "select") {
      const m = getActiveModule(); if (!m) return;
      const objs = getActiveObjects();
      let c = "default";
      for (let i = objs.length-1; i>=0; i--) {
        const o = objs[i];
        if (o.type === "cable") continue;
        const h = getResizeHandleAtPointRect(pos.x, pos.y, m.x + o.x, m.y + o.y, o.w, o.h);
        if (h) { c = (["n","s"].includes(h) ? "ns-resize" : ["e","w"].includes(h) ? "ew-resize" : (h==="ne"||h==="sw")?"nesw-resize":"nwse-resize"); break; }
        const rx = pos.x - m.x, ry = pos.y - m.y;
        if (rx >= o.x && rx <= o.x+o.w && ry >= o.y && ry <= o.y+o.h) { c = "move"; break; }
      }
      canvas.style.cursor = c;
    } else {
      canvas.style.cursor = "default";
    }
    return;
  }

  // dragging
  if (drag.type === "move-module") {
    const m = getActiveModule(); if (!m) return;
    m.x = snap(pos.x - drag.dx); m.y = snap(pos.y - drag.dy);
    m.corridor.x = m.x + (m.w - m.corridor.w)/2;
    m.corridor.y = m.y + (m.h - m.corridor.h)/2;
    render();
  }
  else if (drag.type === "resize-module") {
    const m = getActiveModule(); if (!m) return;
    let nx = drag.startX, ny = drag.startY, nw = drag.startW, nh = drag.startH;
    const dx = pos.x - drag.startX, dy = pos.y - drag.startY;
    switch(drag.handle){
      case "nw": nx = drag.startX + dx; ny = drag.startY + dy; nw = drag.startW - dx; nh = drag.startH - dy; break;
      case "ne": ny = drag.startY + dy; nw = drag.startW + dx; nh = drag.startH - dy; break;
      case "sw": nx = drag.startX + dx; nw = drag.startW - dx; nh = drag.startH + dy; break;
      case "se": nw = drag.startW + dx; nh = drag.startH + dy; break;
      case "n":  ny = drag.startY + dy; nh = drag.startH - dy; break;
      case "s":  nh = drag.startH + dy; break;
      case "w":  nx = drag.startX + dx; nw = drag.startW - dx; break;
      case "e":  nw = drag.startW + dx; break;
    }
    if (nw >= MIN_MODULE_W && nh >= MIN_MODULE_H) {
      m.x = snap(nx); m.y = snap(ny); m.w = snap(nw); m.h = snap(nh);
      m.corridor.x = m.x + (m.w - m.corridor.w)/2;
      m.corridor.y = m.y + (m.h - m.corridor.h)/2;
      render();
    }
  }
  else if (drag.type === "move-object") {
  const m = getActiveModule(); if (!m) return;
  const o = findObjectById(drag.id); if (!o) return;

  // пропонуємо нову позицію
  const tryX = snap(pos.x - m.x - drag.dx);
  const tryY = snap(pos.y - m.y - drag.dy);

  // спроба по X
  const candX = { x: tryX, y: o.y, w: o.w, h: o.h };
  if (!overlapsAny(candX, o.id)) o.x = tryX;

  // спроба по Y
  const candY = { x: o.x, y: tryY, w: o.w, h: o.h };
  if (!overlapsAny(candY, o.id)) o.y = tryY;

  clampObjectToModule(o);
  render();
}

  else if (drag.type === "resize-object") {
  const m = getActiveModule(); if (!m) return;
  const o = findObjectById(drag.id); if (!o) return;
  let nx = drag.startX, ny = drag.startY, nw = drag.startW, nh = drag.startH;

  const rx = pos.x - m.x, ry = pos.y - m.y;
  const dx = rx - drag.startX, dy = ry - drag.startY;
  switch (drag.handle) {
    case "nw": nx = drag.startX + dx; ny = drag.startY + dy; nw = drag.startW - dx; nh = drag.startH - dy; break;
    case "ne": ny = drag.startY + dy; nw = drag.startW + dx; nh = drag.startH - dy; break;
    case "sw": nx = drag.startX + dx; nw = drag.startW - dx; nh = drag.startH + dy; break;
    case "se": nw = drag.startW + dx; nh = drag.startH + dy; break;
    case "n":  ny = drag.startY + dy; nh = drag.startH - dy; break;
    case "s":  nh = drag.startH + dy; break;
    case "w":  nx = drag.startX + dx; nw = drag.startW - dx; break;
    case "e":  nw = drag.startW + dx; break;
  }

  // канд. прямокутник після ресайзу
  const candidate = { x: snap(nx), y: snap(ny), w: snap(nw), h: snap(nh) };
  // обмеження мін-розмірів та меж модуля
  candidate.w = clamp(candidate.w, MIN_OBJECT_W, m.w);
  candidate.h = clamp(candidate.h, MIN_OBJECT_H, m.h);
  candidate.x = clamp(candidate.x, 0, m.w - candidate.w);
  candidate.y = clamp(candidate.y, 0, m.h - candidate.h);

  // якщо НЕ перекриває — приймаємо
  if (!overlapsAny(candidate, o.id)) {
    o.x = candidate.x; o.y = candidate.y; o.w = candidate.w; o.h = candidate.h;
  }
  // інакше просто ігноруємо крок ресайзу (залишаємо попередні)

  render();
}

  else if (drag.type === "move-cable-point") {
    const m = getActiveModule(); if (!m) return;
    const c = findObjectById(drag.id); if (!c || !c.points) return;
    const rx = pos.x - m.x - drag.dx, ry = pos.y - m.y - drag.dy;
    c.points[drag.pointIndex].x = snap(rx);
    c.points[drag.pointIndex].y = snap(ry);
    render();
  }
  else if (drag.type === "move-cable") {
    const m = getActiveModule(); if (!m) return;
    const c = findObjectById(drag.id); if (!c || !c.points) return;
    const dx = pos.x - drag.lastX, dy = pos.y - drag.lastY;
    for (const p of c.points) { p.x = snap(p.x + dx); p.y = snap(p.y + dy); }
    drag.lastX = pos.x; drag.lastY = pos.y;
    render();
  }
  // Update measure preview
  if (state.tool === "measure" && state.measure.points.length === 1) {
    state.measure.points[1] = { x: pos.x, y: pos.y };
    render();
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (view.isPanning && e.button === 2) { view.isPanning = false; return; }
  if (drag) { saveState(); drag = null; }
});


// --------------------------- Cable tools buttons (optional in UI) ---------------------------
$("#btn-add-cable-point")?.addEventListener("click", () => {
  const m = getActiveModule(); if (!m) return;
  const c = findObjectById(state.selectedId);
  if (!c || c.type !== "cable") return;
  saveToHistory();
  // add a point near the center of last segment or default center
  if (c.points.length >= 2) {
    const p1 = c.points[c.points.length - 2], p2 = c.points[c.points.length - 1];
    c.points.push({ x: snap((p1.x + p2.x)/2), y: snap((p1.y + p2.y)/2) });
  } else {
    c.points.push({ x: snap(m.w/2), y: snap(m.h/2) });
  }
  saveState(); render();
});

$("#btn-remove-cable-point")?.addEventListener("click", () => {
  const c = findObjectById(state.selectedId);
  if (!c || c.type !== "cable" || !c.points?.length) return;
  saveToHistory();
  c.points.pop();
  saveState(); render();
});

$("#btn-delete-cable")?.addEventListener("click", () => {
  const m = getActiveModule(); if (!m) return;
  const c = findObjectById(state.selectedId);
  if (!c || c.type !== "cable") return;
  saveToHistory();
  m.objects = m.objects.filter(o => o.id !== c.id);
  state.selectedId = null;
  saveState(); render();
});

// --------------------------- Init ---------------------------
render();
// Initialize Mission Params UI from saved state
document.getElementById("crew-size") && (document.getElementById("crew-size").value = String(state.mission.crewSize));
document.getElementById("deck-height") && (document.getElementById("deck-height").value = String(state.mission.deckHeightM));
document.getElementById("sizing-mode") && (document.getElementById("sizing-mode").value = String(state.mission.sizingMode));
// ========================= AI PANEL HOOKS ========================= //
// DOM вузли
const btnAI = document.getElementById("btn-ai");
const aiPanel = document.getElementById("ai-floating-panel");
const btnCloseAI = document.getElementById("btn-close-ai");
const btnAnalyze = document.getElementById("btn-analyze");
const aiSourceSel = document.getElementById("ai-source");
const aiList = document.getElementById("ai-suggestions");

// Відкрити/закрити панель
btnAI?.addEventListener("click", () => aiPanel?.classList.add("visible"));
btnCloseAI?.addEventListener("click", () => aiPanel?.classList.remove("visible"));

// Рендер підказок у списку
function renderAISuggestions(list) {
  if (!aiList) return;
  aiList.innerHTML = "";
  for (const it of list) {
    const li = document.createElement("li");
    li.textContent = it.msg || String(it);
    li.className = `suggestion-${it.type || "hint"}`; // error|warn|hint
    aiList.appendChild(li);
  }
}

// Локальна простенька “евристична” перевірка — без зовнішнього бекенда
function validateLayoutLocal() {
  const m = getActiveModule();
  if (!m) return [{ type: "error", msg: "No active module." }];

  const objects = (m.objects || []).filter(o => o.type !== "cable");
  const out = [];

  // 1) Мінімальна «стартова» рекомендація
  if (objects.length === 0) {
    out.push({ type: "hint", msg: "Add at least a Bed and a Panel to start a functional layout." });
  }

  // 2) Вільний простір ≥ 30%
  const total = m.w * m.h;
  const occ = objects.reduce((s, o) => s + (o.w * o.h), 0);
  const freeRatio = (total - occ) / total;
  if (freeRatio < 0.30) {
    out.push({ type: "warn", msg: `Only ${Math.round(freeRatio*100)}% free space. Keep ≥ 30% for crew movement.` });
  }

  // 3) Не торкатися стін (кліренс 20 px)
  const clearance = 20;
  for (const o of objects) {
    if (o.x < clearance || o.y < clearance || (o.x + o.w) > (m.w - clearance) || (o.y + o.h) > (m.h - clearance)) {
      out.push({ type: "warn", msg: `${(CATALOG[o.type]?.name || o.type)} is too close to walls. Keep ${clearance}px.` });
    }
  }

  // 4) Набір «обов’язкових» зон (кабінет/кухня/приватний простір/фітнес)
  const need = [
    ["cabinet", "Cabinet for storage"],
    ["kitchen", "Kitchen for food preparation"],
    ["private", "Private Space for well-being"],
    ["exercise", "Exercise area for physical health"]
  ];
  for (const [key, text] of need) {
    if (!objects.some(o => o.type === key)) {
      out.push({ type: "hint", msg: `Consider adding ${text}.` });
    }
  }

  // 5) Кухня ближче до Dining (за наявності)
  const kitchens = objects.filter(o => o.type === "kitchen");
  const dinings = objects.filter(o => o.type === "dining");
  if (kitchens.length && dinings.length) {
    for (const k of kitchens) {
      const cx = k.x + k.w/2, cy = k.y + k.h/2;
      const dmin = Math.min(...dinings.map(d => Math.hypot(cx - (d.x + d.w/2), cy - (d.y + d.h/2))));
      if (dmin > 200) out.push({ type: "hint", msg: "Place Kitchen closer to Dining for efficiency." });
    }
  }

  // 6) Ліжко подалі від панелей (шум/світло)
  const beds = objects.filter(o => o.type === "bed");
  const panels = objects.filter(o => o.type === "panel");
  for (const b of beds) {
    const bx = b.x + b.w/2, by = b.y + b.h/2;
    for (const p of panels) {
      const d = Math.hypot(bx - (p.x + p.w/2), by - (p.y + p.h/2));
      if (d < 120) out.push({ type: "hint", msg: "Place Bed farther from Panel to reduce noise/light." });
    }
  }

  // 7) Зонування: exercise/kitchen/storage не ближче 2м до sleep/private
  const noisy = objects.filter(o => ["exercise","kitchen","storage"].includes(o.type));
  const sleep = objects.filter(o => ["bed","private"].includes(o.type));
  const minDistUnits = 2 * UNITS_PER_METER;
  for (const a of noisy) {
    const ax = a.x + a.w/2, ay = a.y + a.h/2;
    for (const b of sleep) {
      const d = Math.hypot(ax - (b.x + b.w/2), ay - (b.y + b.h/2));
      if (d < minDistUnits) out.push({ type: "warn", msg: `Keep ${a.type} at least 2 m away from ${b.type}.` });
    }
  }

  return out;
}

// Кнопка «Analyze with AI»
btnAnalyze?.addEventListener("click", async () => {
  const src = aiSourceSel?.value || "local";
  try {
    if (src === "local") {
      const suggestions = validateLayoutLocal();
      renderAISuggestions(suggestions);
    } else {
        const active_module = getActiveModule();
      const layout = {
        modules: state.modules,
        activeModule: active_module,
        objects: getActiveObjects(),
        moduleName: active_module.name
      };
      const res = await fetch("http://localhost:5000/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout })
      });
      const suggestions = await res.json();
      renderAISuggestions(suggestions);
    }
  } catch (e) {
    renderAISuggestions([{ type: "error", msg: "AI proxy not reachable. Use Local or start your server." }]);
  }
});

function drawStarryBackground() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // скидаємо масштаб і панорамування

  // малюємо чорний фон на всю канву
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // додаємо прості “зірки”
  const starsCount = 200;
  for (let i = 0; i < starsCount; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = Math.random() * 1.5;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore(); // повертаємо трансформацію
}

function drawRulers(){
  // thin guides on canvas edges
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#283241";
  ctx.fillRect(0, 0, canvas.width, 2); // top
  ctx.fillRect(0, canvas.height-2, canvas.width, 2); // bottom
  ctx.fillRect(0, 0, 2, canvas.height); // left
  ctx.fillRect(canvas.width-2, 0, 2, canvas.height); // right
  ctx.restore();
}

// --------------------------- Inspector & Mission Params Wiring ---------------------------
function updateInspector() {
  const m = getActiveModule(); if (!m) return;
  const o = findObjectById(state.selectedId);
  const inspType = document.getElementById("insp-type");
  const inspSize = document.getElementById("insp-size");
  const inspArea = document.getElementById("insp-area");
  const inspVol = document.getElementById("insp-volume");
  const inspFunc = document.getElementById("insp-function");
  const inspNASA = document.getElementById("insp-nasa");
  if (!o || o.type === "cable") {
    if (inspType) inspType.textContent = "—";
    if (inspSize) inspSize.textContent = "—";
    if (inspArea) inspArea.textContent = "—";
    if (inspVol) inspVol.textContent = "—";
    if (inspFunc) inspFunc.textContent = "—";
    if (inspNASA) inspNASA.textContent = "—";
    return;
  }
  const wM = unitsToMeters(o.w);
  const dM = unitsToMeters(o.h);
  const hM = state.mission.deckHeightM || 2.4;
  const area = areaUnitsToM2(o.w * o.h);
  const vol = area * hM;
  const func = PHYS_SPECS[o.type]?.func || "—";
  const perCap = FUNC_VOLUMES.perCapita[func] || 0;
  const shared = FUNC_VOLUMES.shared[func] || 0;
  const totalReq = (perCap ? perCap * (state.mission.crewSize || 4) : 0) + shared;
  if (inspType) inspType.textContent = CATALOG[o.type]?.name || o.type;
  if (inspSize) inspSize.textContent = `${wM.toFixed(2)} × ${dM.toFixed(2)} × ${hM.toFixed(2)}`;
  if (inspArea) inspArea.textContent = area.toFixed(2);
  if (inspVol) inspVol.textContent = vol.toFixed(2);
  if (inspFunc) inspFunc.textContent = func;
  if (inspNASA) inspNASA.textContent = totalReq ? (vol >= totalReq ? "Yes" : "No") : "—";
}

document.getElementById("crew-size")?.addEventListener("change", (e) => {
  state.mission.crewSize = Number(e.target.value);
  saveState(); render();
});
document.getElementById("deck-height")?.addEventListener("change", (e) => {
  state.mission.deckHeightM = Number(e.target.value);
  saveState(); render();
});
document.getElementById("sizing-mode")?.addEventListener("change", (e) => {
  state.mission.sizingMode = String(e.target.value);
  saveState(); render();
});
document.getElementById("zoning-dist")?.addEventListener("change", (e) => {
  state.mission.zoningMinDistM = Number(e.target.value);
  saveState(); render();
});

function showToast(msg){
  const el = document.getElementById("toast"); if (!el) return;
  el.textContent = msg; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"), 1500);
}
document.getElementById("btn-save-params")?.addEventListener("click", () => {
  saveState(); showToast("Mission parameters saved");
});

// Presets
document.getElementById("preset-crew4-lunar")?.addEventListener("click", () => {
  const m = getActiveModule(); if (!m) return;
  state.mission.crewSize = 4; state.mission.deckHeightM = 2.4; state.mission.sizingMode = "nasa";
  document.getElementById("crew-size").value = "4";
  document.getElementById("deck-height").value = "2.4";
  document.getElementById("sizing-mode").value = "nasa";
  m.objects = [];
  addObject("bed", m.x + GRID, m.y + GRID);
  addObject("private", m.x + GRID*3, m.y + GRID);
  addObject("kitchen", m.x + GRID, m.y + GRID*6);
  addObject("dining", m.x + GRID*6, m.y + GRID*6);
  addObject("exercise", m.x + GRID*10, m.y + GRID*2);
  saveState(); render();
});
document.getElementById("preset-crew6-mars")?.addEventListener("click", () => {
  const m = getActiveModule(); if (!m) return;
  state.mission.crewSize = 6; state.mission.deckHeightM = 2.7; state.mission.sizingMode = "nasa";
  document.getElementById("crew-size").value = "6";
  document.getElementById("deck-height").value = "2.7";
  document.getElementById("sizing-mode").value = "nasa";
  m.objects = [];
  addObject("bed", m.x + GRID, m.y + GRID);
  addObject("bed", m.x + GRID*4, m.y + GRID);
  addObject("private", m.x + GRID*8, m.y + GRID);
  addObject("kitchen", m.x + GRID, m.y + GRID*8);
  addObject("dining", m.x + GRID*7, m.y + GRID*8);
  addObject("exercise", m.x + GRID*12, m.y + GRID*2);
  addObject("storage", m.x + GRID*12, m.y + GRID*8);
  saveState(); render();
});
