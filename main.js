/* Minimal 2D habitat planner — Canvas-based */
const GRID = 20;
const HABITAT = { x: 50, y: 50, w: 1000, h: 600, corridor: { x: 300, y: 120, w: 500, h: 80 } };

// Module templates with different shapes and sizes
const MODULE_TEMPLATES = {
  standard: { name: "Standard", w: 1000, h: 600, corridor: { w: 500, h: 80 } },
  compact: { name: "Compact", w: 800, h: 500, corridor: { w: 400, h: 60 } },
  large: { name: "Large", w: 1200, h: 700, corridor: { w: 600, h: 100 } },
  wide: { name: "Wide", w: 1400, h: 500, corridor: { w: 700, h: 80 } },
  tall: { name: "Tall", w: 800, h: 900, corridor: { w: 400, h: 120 } }
};
// Simple catalog with sizes (w,h) in px, and access zones (ax, ay, aw, ah) relative to object (optional)
const CATALOG = {
  // Original objects
  bed: { w: 160, h: 80, name: "Bed", color: "#7aa2f7", access: { x: -10, y: 0, w: 40, h: 80 } },
  panel: { w: 140, h: 40, name: "Panel", color: "#9ece6a", access: { x: 0, y: 40, w: 140, h: 50 } },
  cabinet: { w: 100, h: 100, name: "Cabinet", color: "#f7768e", access: { x: 0, y: 100, w: 100, h: 50 } },
  cable: { name: "Cable", color: "#e0af68" }, // polyline

  // Food systems
  kitchen: { w: 200, h: 120, name: "Kitchen", color: "#ff9f43", access: { x: 0, y: 120, w: 200, h: 60 } },
  dining: { w: 180, h: 100, name: "Dining", color: "#ff6b6b", access: { x: 0, y: 100, w: 180, h: 80 } },
  storage: { w: 120, h: 80, name: "Storage", color: "#a55eea", access: { x: 0, y: 80, w: 120, h: 40 } },

  // Life support systems
  atmosphere: { w: 160, h: 100, name: "Atmosphere Control", color: "#26de81", access: { x: 0, y: 100, w: 160, h: 60 } },
  monitor: { w: 140, h: 60, name: "Monitor", color: "#45aaf2", access: { x: 0, y: 60, w: 140, h: 40 } },

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
      objects: [],
      color: "#0d1b26",
      type: "habitat"
    }
  ],
  activeModuleId: "module-1",
  selectedId: null,
  selectedModuleId: null,
  editingModuleId: null,
  tool: "select", // "select" | "cable" | "module"
  cableDraft: null, // {points: [{x,y},...]} while drawing
  aiSource: "local",
  viewMode: "single", // "single" | "overview"
  overviewScale: 0.5,
  connections: [], // Array of connections between modules
  history: [], // Undo history
  historyIndex: -1, // Current position in history
  maxHistorySize: 50 // Maximum number of undo states
};
// zoom and pan
let view = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0
};

// --- RESIZE & GEOM HELPERS ---
const MIN_MODULE_W = 200;
const MIN_MODULE_H = 150;
const HANDLE_SCREEN_PX = 10; // ~10px на екрані
const HIT_SCREEN_PX    = 12; // ~12px хітбокс
// --- OBJECT RESIZE/ROTATE HELPERS ---
const MIN_OBJ_W = 40;
const MIN_OBJ_H = 40;

function keepCenterAfterResize(o, oldW, oldH) {
  // зберігаємо центр при зміні w/h (використаємо для rotate 90°)
  o.x += (oldW - o.w) / 2;
  o.y += (oldH - o.h) / 2;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function spx(px) { return px / view.zoom; } // екранно-стабільний розмір

function toLocal(module, gx, gy)  { return { x: snap(gx - module.x), y: snap(gy - module.y) }; }
function toGlobal(module, lx, ly) { return { x: module.x + lx,       y: module.y + ly       }; }

function clampPointToModule(pt, m) {
  pt.x = clamp(pt.x, 0, m.w);
  pt.y = clamp(pt.y, 0, m.h);
}


// Helper functions for module management
function getActiveModule() {
  return state.modules.find(m => m.id === state.activeModuleId);
}

function getActiveObjects() {
  return getActiveModule()?.objects || [];
}

// Undo/Redo functionality
function saveToHistory() {
  // Remove any history after current index (when new action is performed after undo)
  if (state.historyIndex < state.history.length - 1) {
    state.history = state.history.slice(0, state.historyIndex + 1);
  }

  // Create deep copy of current state
  const historyState = {
    modules: JSON.parse(JSON.stringify(state.modules)),
    activeModuleId: state.activeModuleId,
    connections: JSON.parse(JSON.stringify(state.connections)),
    timestamp: Date.now()
  };

  // Add to history
  state.history.push(historyState);
  state.historyIndex = state.history.length - 1;

  // Limit history size
  if (state.history.length > state.maxHistorySize) {
    state.history.shift();
    state.historyIndex--;
  }
}

function undo() {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    const historyState = state.history[state.historyIndex];

    // Restore state
    state.modules = JSON.parse(JSON.stringify(historyState.modules));
    state.activeModuleId = historyState.activeModuleId;
    state.connections = JSON.parse(JSON.stringify(historyState.connections));

    // Clear selections
    state.selectedId = null;
    state.selectedModuleId = null;
    state.cableDraft = null;

    // Update UI
    renderModuleList();
    render();
    saveState();
  }
}

function redo() {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++;
    const historyState = state.history[state.historyIndex];
    state.modules = JSON.parse(JSON.stringify(historyState.modules));
    state.activeModuleId = historyState.activeModuleId;
    state.connections = JSON.parse(JSON.stringify(historyState.connections));
    state.selectedId = null;
    state.selectedModuleId = null;
    state.cableDraft = null;
    renderModuleList();
    render();
    saveState();
  }
}

// Auto-save to localStorage
function saveState() {
  localStorage.setItem('habitat-layout', JSON.stringify({
    modules: state.modules,
    activeModuleId: state.activeModuleId,
    aiSource: state.aiSource,
    connections: state.connections,
    viewMode: state.viewMode,
    history: state.history,
    historyIndex: state.historyIndex
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
      state.connections = data.connections || [];
      state.viewMode = data.viewMode || "single";
      state.history = data.history || [];
      state.historyIndex = data.historyIndex !== undefined ? data.historyIndex : -1;
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

function resizeCanvas() {
  canvas.width = window.innerWidth - document.querySelector('.sidebar').offsetWidth;
  canvas.height = window.innerHeight;
  render();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function snap(v) { return Math.round(v / GRID) * GRID; }
function genId() { return Math.random().toString(36).slice(2, 9); }
// duplicate clamp removed (defined above)

function clampObjectToModule(o, module) {
  // o.x/y — відносно модуля; module.w/h — розмір модуля
  o.x = clamp(o.x, 0, Math.max(0, module.w - o.w));
  o.y = clamp(o.y, 0, Math.max(0, module.h - o.h));
}

// Для кабелів (поліліній), точки всередині модуля
function clampPointToModule(pt, module) {
  pt.x = clamp(pt.x, 0, module.w);
  pt.y = clamp(pt.y, 0, module.h);
}

function addObject(type, x, y) {
  if (type === "cable") {
    state.cableDraft = { id: genId(), type: "cable", points: [] };
    state.tool = "cable";
    markToolActive();
    return;
  }
  const t = CATALOG[type];
  const activeModule = getActiveModule();
  if (activeModule) {
    saveToHistory(); // Save state before adding object
    // Convert global coordinates to module-relative coordinates
    const moduleX = x - activeModule.x;
    const moduleY = y - activeModule.y;
    const obj = { id: genId(), type, x: snap(moduleX), y: snap(moduleY), w: t.w, h: t.h, rot: 0 };
    clampObjectToModule(obj, activeModule);
    activeModule.objects.push(obj);
    state.selectedId = obj.id;
    saveState();
    render();
  }
}

function objectsAtPoint(x, y) {
  const hits = [];
  const objects = getActiveObjects();
  const activeModule = getActiveModule();

  // Check regular objects
  // (cable selection handled below)



  // Check cables (improved selection logic)
  for (const o of objects) {
    if (o.type === "cable" && o.points && o.points.length >= 2) {
      // Check if point is near any cable segment
      for (let i = 0; i < o.points.length - 1; i++) {
        const p1 = o.points[i];
        const p2 = o.points[i + 1];
        const p1g = { x: activeModule.x + p1.x, y: activeModule.y + p1.y };
        const p2g = { x: activeModule.x + p2.x, y: activeModule.y + p2.y };
        const dist = distanceToLineSegment(x, y, p1g.x, p1g.y, p2g.x, p2g.y);
        if (dist < 8) { // Reduced tolerance for better precision
          hits.push(o.id);
          break;
        }
      }
    }
  }

  return hits;
}

function getCablePointAtPoint(x, y, cableId) {
  const objects = getActiveObjects();
  const activeModule = getActiveModule();
  const cable = objects.find(o => o.id === cableId && o.type === "cable");

  if (!cable || !cable.points) return null;

  // Check if clicking on a control point
  for (let i = 0; i < cable.points.length; i++) {
    const pt = cable.points[i];
    const ptX = activeModule.x + pt.x;
    const ptY = activeModule.y + pt.y;
    const dist = Math.sqrt((x - ptX) ** 2 + (y - ptY) ** 2);

    if (dist < 10) { // Click tolerance for control points
      return { pointIndex: i, point: pt };
    }
  }

  return null;
}

function modulesAtPoint(x, y) {
  const hits = [];
  for (const module of state.modules) {
    if (pointInRect(x, y, module)) {
      hits.push(module.id);
    }
  }
  return hits;
}

function getResizeHandleAtPoint(x, y, module) {
  const hit = spx(HIT_SCREEN_PX);
  const tests = [
    { name: "nw", x: module.x,              y: module.y              },
    { name: "ne", x: module.x + module.w,   y: module.y              },
    { name: "sw", x: module.x,              y: module.y + module.h   },
    { name: "se", x: module.x + module.w,   y: module.y + module.h   },
    { name: "n",  x: module.x + module.w/2, y: module.y              },
    { name: "s",  x: module.x + module.w/2, y: module.y + module.h   },
    { name: "w",  x: module.x,              y: module.y + module.h/2 },
    { name: "e",  x: module.x + module.w,   y: module.y + module.h/2 },
  ];
  for (const t of tests) {
    if (Math.abs(x - t.x) <= hit/2 && Math.abs(y - t.y) <= hit/2) return t.name;
  }
  return null;
}


function pointInRect(px, py, r) {
  return px >= r.x && py >= r.y && px <= r.x + r.w && py <= r.y + r.h;
}

function distanceToLineSegment(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
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

  // 👇 додано: коефіцієнт компенсації масштабу (щоб лінії не “товстіли/тоншали” при zoom)
  const s = 1 / view.zoom;

  // habitat border with custom color
  ctx.fillStyle = activeModule.color || "#0d1b26";
  ctx.strokeStyle = "#284157";
  ctx.lineWidth = 2 * s; // 👈 було 2; зробили стабільним відносно екрана
  roundRect(activeModule.x, activeModule.y, activeModule.w, activeModule.h, 16, true, true);

  // Highlight selected module if in module tool
  if (state.tool === "module" && state.selectedModuleId === activeModule.id) {
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 3 * s; // 👈 було 3; теж стабілізуємо
    roundRect(activeModule.x - 2, activeModule.y - 2, activeModule.w + 4, activeModule.h + 4, 18, false, true);

    // Resize handles всередині render-графіки (враховують zoom)
    drawResizeHandles(activeModule);
  }

  // Module name with type icon
  ctx.fillStyle = "#9ad";
  ctx.font = "bold 14px system-ui"; // (шрифт масштабуватиметься разом зі сценою — це ок)
  const typeIcon = getModuleTypeIcon(activeModule.type);
  ctx.fillText(typeIcon + " " + activeModule.name, activeModule.x + 10, activeModule.y - 10);
}


function getModuleTypeIcon(type) {
  const icons = {
    habitat: "🏠",
    laboratory: "🔬",
    storage: "📦",
    greenhouse: "🌱",
    gym: "💪",
    medical: "🏥"
  };
  return icons[type] || "🏠";
}

function drawResizeHandles(module) {
  const handle = spx(HANDLE_SCREEN_PX);
  const lw     = spx(2);

  const handles = [
    { x: module.x,              y: module.y,               type: "nw" },
    { x: module.x + module.w,   y: module.y,               type: "ne" },
    { x: module.x,              y: module.y + module.h,    type: "sw" },
    { x: module.x + module.w,   y: module.y + module.h,    type: "se" },
    { x: module.x + module.w/2, y: module.y,               type: "n"  },
    { x: module.x + module.w/2, y: module.y + module.h,    type: "s"  },
    { x: module.x,              y: module.y + module.h/2,  type: "w"  },
    { x: module.x + module.w,   y: module.y + module.h/2,  type: "e"  },
  ];

  // рамка
  ctx.save();
  ctx.lineWidth = spx(3);
  ctx.setLineDash([spx(6), spx(4)]);
  ctx.strokeStyle = "#3b82f6";
  ctx.strokeRect(module.x, module.y, module.w, module.h);
  ctx.restore();

  // хендли
  ctx.save();
  ctx.lineWidth = lw;
  ctx.fillStyle = "#0c1116";
  ctx.strokeStyle = "#ffd166";
  for (const h of handles) {
    ctx.beginPath();
    ctx.rect(h.x - handle/2, h.y - handle/2, handle, handle);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}





function updateCursor(x, y) {
  // Під час панорамування правою кнопкою
  if (view.isPanning) {
    canvas.style.cursor = "grabbing";
    return;
  }

  if (state.tool === "module") {
    // беремо активний модуль; якщо нема — пробуємо за selectedModuleId
    const module =
      (typeof getActiveModule === "function" && getActiveModule()) ||
      state.modules.find(m => m.id === state.selectedModuleId);

    if (module) {
      // якщо над хендлом — курсор ресайзу
      const handle = getResizeHandleAtPoint(x, y, module);
      if (handle) {
        const CURSORS = {
          nw: "nwse-resize",
          se: "nwse-resize",
          ne: "nesw-resize",
          sw: "nesw-resize",
          n:  "ns-resize",
          s:  "ns-resize",
          w:  "ew-resize",
          e:  "ew-resize"
        };
        canvas.style.cursor = CURSORS[handle] || "default";
        return;
      }

      // якщо всередині модуля — курсор переміщення
      if (x >= module.x && x <= module.x + module.w &&
          y >= module.y && y <= module.y + module.h) {
        canvas.style.cursor = "move";
        return;
      }
    }
  }
  if (state.tool === "select") {
  const m = getActiveModule?.();
  if (m && state.selectedId) {
    const o = getActiveObjects().find(it => it.id === state.selectedId && it.type !== "cable");
    if (o) {
      const h = getObjectHandleAtPoint(x, y, o, m);
      if (h) {
        if (h === "rot") { canvas.style.cursor = "crosshair"; return; }
        const CURS = { nw:"nwse-resize", se:"nwse-resize", ne:"nesw-resize", sw:"nesw-resize", n:"ns-resize", s:"ns-resize", w:"ew-resize", e:"ew-resize" };
        canvas.style.cursor = CURS[h] || "default";
        return;
      }
      // усередині — курсор переміщення
      const rx = x - m.x, ry = y - m.y;
      if (rx >= o.x && rx <= o.x + o.w && ry >= o.y && ry <= o.y + o.h) {
        canvas.style.cursor = "move"; return;
      }
    }
  }
}

  // за замовчуванням
  canvas.style.cursor = "default";
}

// 🔹 Хелпер для підсвітки вибраного прямокутного об’єкта (стабільна товщина при zoom)
function drawObjectSelection(o, module) {
  const s   = (typeof spx === "function") ? spx(1) : (1 / view.zoom);
  const pad = (typeof spx === "function") ? spx(2) : (2 / view.zoom);

  ctx.save();
  ctx.lineWidth = 2 * s;
  ctx.strokeStyle = "#60a5fa";
  ctx.setLineDash([6 * s, 4 * s]);
  ctx.strokeRect(module.x + o.x - pad, module.y + o.y - pad, o.w + pad * 2, o.h + pad * 2);
  ctx.restore();
}

function getObjectHandleAtPoint(x, y, o, m) {
  // координати об'єкта у сцені
  const x0 = m.x + o.x, y0 = m.y + o.y;
  const x1 = x0 + o.w,  y1 = y0 + o.h;

  const hit   = spx(HIT_SCREEN_PX);
  const midX  = (x0 + x1) / 2;
  const topCn = { x: midX, y: y0 };             // верхній центр
  const rotY  = y0 - spx(18);                   // ручка обертання вище об'єкта
  const rotR  = spx(7);                          // радіус ручки обертання

  // rotate-ручка (коло)
  if (Math.hypot(x - midX, y - rotY) <= rotR) return "rot";

  // resize-ручки (квадратики)
  const tests = [
    { name:"nw", x:x0,   y:y0 },
    { name:"ne", x:x1,   y:y0 },
    { name:"sw", x:x0,   y:y1 },
    { name:"se", x:x1,   y:y1 },
    { name:"n",  x:midX, y:y0 },
    { name:"s",  x:midX, y:y1 },
    { name:"w",  x:x0,   y:(y0+y1)/2 },
    { name:"e",  x:x1,   y:(y0+y1)/2 },
  ];
  for (const t of tests) {
    if (Math.abs(x - t.x) <= hit/2 && Math.abs(y - t.y) <= hit/2) return t.name;
  }
  return null;
}

function drawObjectHandles(o, m) {
  const s = (typeof spx === "function") ? spx(1) : (1 / view.zoom);
  const pad = (typeof spx === "function") ? spx(2) : (2 / view.zoom);
  const handle = spx(HANDLE_SCREEN_PX);

  const x0 = m.x + o.x, y0 = m.y + o.y;
  const x1 = x0 + o.w,  y1 = y0 + o.h;
  const midX = (x0 + x1) / 2;
  const rotY = y0 - spx(18);

  // рамка
  ctx.save();
  ctx.lineWidth = 2 * s;
  ctx.strokeStyle = "#60a5fa";
  ctx.setLineDash([6 * s, 4 * s]);
  ctx.strokeRect(x0 - pad, y0 - pad, o.w + pad * 2, o.h + pad * 2);
  ctx.restore();

  // лінія до ручки обертання + саме коло
  ctx.save();
  ctx.lineWidth = 1.5 * s;
  ctx.strokeStyle = "#60a5fa";
  ctx.beginPath();
  ctx.moveTo(midX, y0 - pad);
  ctx.lineTo(midX, rotY);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(midX, rotY, spx(7), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // квадратики-ручки ресайзу
  const boxes = [
    { x:x0, y:y0 }, { x:x1, y:y0 }, { x:x0, y:y1 }, { x:x1, y:y1 },
    { x:midX, y:y0 }, { x:midX, y:y1 }, { x:x0, y:(y0+y1)/2 }, { x:x1, y:(y0+y1)/2 },
  ];
  ctx.save();
  ctx.fillStyle = "#0c1116";
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 2 * s;
  for (const b of boxes) {
    ctx.beginPath();
    ctx.rect(b.x - handle/2, b.y - handle/2, handle, handle);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawObjects() {
  const objects = getActiveObjects();
  const activeModule = getActiveModule();
  if (!activeModule) return;

  for (const o of objects) {
    if (o.type === "cable") {
      drawCable(o);
      continue;
    }

    const cat = CATALOG[o.type];
    ctx.fillStyle = cat.color;
    ctx.strokeStyle = "#0b0b0b";
    ctx.lineWidth = 1.5;

    // малюємо відносно позиції модуля
    const objX = activeModule.x + o.x;
    const objY = activeModule.y + o.y;
    ctx.fillRect(objX, objY, o.w, o.h);
    ctx.strokeRect(objX, objY, o.w, o.h);

    // підпис
    ctx.fillStyle = "#e6e6e6";
    ctx.font = "12px system-ui";
    ctx.fillText(cat.name, objX + 6, objY + 16);

  

  }

  // ✅ ПІДСВІТКА ПІСЛЯ РЕНДЕРУ (стабільна при zoom)
  (() => {
  if (!state.selectedId) return;
  const sel = objects.find(x => x.id === state.selectedId);
  if (sel && sel.type !== "cable") {
    // було: drawObjectSelection(sel, activeModule);
    drawObjectHandles(sel, activeModule); // <-- ось це
  }
})();

  // cable draft (чернетка кабелю малюється з урахуванням зсуву модуля)
  if (state.cableDraft) {
    const m = activeModule;
    const pts = state.cableDraft.points || [];
    if (m && pts.length) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = CATALOG.cable.color;
      ctx.beginPath();

      const p0 = toGlobal(m, pts[0].x, pts[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < pts.length; i++) {
        const pg = toGlobal(m, pts[i].x, pts[i].y);
        ctx.lineTo(pg.x, pg.y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}


function drawCable(c) {
  const activeModule = getActiveModule();
  ctx.strokeStyle = CATALOG.cable.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  const pts = c.points;
  if (!pts || pts.length < 2) return;

  // Draw cable relative to module position
  ctx.moveTo(activeModule.x + pts[0].x, activeModule.y + pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(activeModule.x + pts[i].x, activeModule.y + pts[i].y);
  }
  ctx.stroke();

  // Draw control points if selected
  if (state.selectedId === c.id) {
    ctx.fillStyle = "#ffd166";
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      ctx.beginPath();
      ctx.arc(activeModule.x + pt.x, activeModule.y + pt.y, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Draw point index for easier identification
      ctx.fillStyle = "#000";
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(i.toString(), activeModule.x + pt.x, activeModule.y + pt.y + 3);
      ctx.fillStyle = "#ffd166";
    }

    // Draw selection outline
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(activeModule.x + pts[0].x, activeModule.y + pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(activeModule.x + pts[i].x, activeModule.y + pts[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
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

canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const zoomIntensity = 0.1;
  const oldZoom = view.zoom;

  // нове значення з обмеженням
  view.zoom = Math.min(3, Math.max(0.3, view.zoom - e.deltaY * zoomIntensity / 100));

  // масштаб відносно курсора (щоб "наближало до точки", а не у кут)
  const mouseX = e.offsetX;
  const mouseY = e.offsetY;
  const zoomRatio = view.zoom / oldZoom;
  view.offsetX = mouseX - (mouseX - view.offsetX) * zoomRatio;
  view.offsetY = mouseY - (mouseY - view.offsetY) * zoomRatio;

  render();
});

canvas.addEventListener("mousedown", e => {
  const pos = getMouse(e);
  if (state.viewMode === "overview") return;

  // 🖱️ Права кнопка — панорамування сцени
  if (e.button === 2) {
    view.isPanning = true;
    view.panStartX = e.clientX - view.offsetX;
    view.panStartY = e.clientY - view.offsetY;
    return;
  }

  // далі працюємо лише з лівою кнопкою
  if (e.button !== 0) return;

  // =============  MODULE TOOL  =============
  if (state.tool === "module") {
    const m = getActiveModule?.();
    if (!m) return;

    state.selectedModuleId = m.id; // для підсвітки/хендлів у render()

    // клік по хендлу → старт ресайзу
    const handle = getResizeHandleAtPoint(pos.x, pos.y, m);
    if (handle) {
      drag = {
        type: "resize",
        id: m.id,
        handle,
        startX: m.x,
        startY: m.y,
        startW: m.w,
        startH: m.h
      };
      return;
    }

    // клік всередині модуля → перетяг модуля
    if (pos.x >= m.x && pos.x <= m.x + m.w && pos.y >= m.y && pos.y <= m.y + m.h) {
      drag = {
        type: "module",
        id: m.id,
        dx: pos.x - m.x,
        dy: pos.y - m.y
      };
      return;
    }

    // клік повз — нічого
    return;
  }

  // =============  SELECT TOOL  =============
if (state.tool === "select") {
  const m = getActiveModule?.();
  if (!m) return;

  const relX = pos.x - m.x;
  const relY = pos.y - m.y;

  const objs = getActiveObjects();
  // перевіряємо з кінця — "верхній" елемент перший
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    if (o.type === "cable") continue; // кабель тут не чіпаємо

    if (relX >= o.x && relX <= o.x + o.w && relY >= o.y && relY <= o.y + o.h) {
      state.selectedId = o.id;
      drag = { type: "object", id: o.id, dx: relX - o.x, dy: relY - o.y };
      render();
      return;
    }
  }

  // клік по порожньому місцю
  state.selectedId = null;
  render();
  return;
}


  // =============  CABLE TOOL  =============
  if (state.tool === "cable") {
    const m = getActiveModule?.();
    if (!m) return;

    const objs = getActiveObjects();

    // 1) хіт-тест по ТОЧКАХ кабелю → перетяг точки
    const pointHitR = 8; // px у координатах сцени (render() вже з трансформом)
    for (const cable of objs) {
      if (cable.type !== "cable" || !cable.points) continue;
      for (let i = 0; i < cable.points.length; i++) {
        const p = cable.points[i];
        const gx = m.x + p.x, gy = m.y + p.y; // глобальні координати точки
        if (Math.abs(pos.x - gx) <= pointHitR && Math.abs(pos.y - gy) <= pointHitR) {
          state.selectedId = cable.id;
          drag = { type: "cablePoint", id: cable.id, pointIndex: i, dx: pos.x - gx, dy: pos.y - gy };
          return;
        }
      }
    }

    // 2) хіт-тест по СЕГМЕНТАХ кабелю → перетяг усього кабелю
    const segHit = 8;
    if (typeof distanceToLineSegment === "function") {
      for (const cable of objs) {
        if (cable.type !== "cable" || !cable.points || cable.points.length < 2) continue;
        for (let i = 0; i < cable.points.length - 1; i++) {
          const p1 = cable.points[i], p2 = cable.points[i + 1];
          const p1g = { x: m.x + p1.x, y: m.y + p1.y };
          const p2g = { x: m.x + p2.x, y: m.y + p2.y };
          const d = distanceToLineSegment(pos.x, pos.y, p1g.x, p1g.y, p2g.x, p2g.y);
          if (d < segHit) {
            state.selectedId = cable.id;
            // зберігаємо останню позицію в ЛОКАЛЬНИХ координатах модуля
            drag = { type: "cable", id: cable.id, lastMX: pos.x - m.x, lastMY: pos.y - m.y };
            return;
          }
        }
      }
    }

    // 3) інакше — додаємо точку до чернетки кабелю (module-relative)
    if (!state.cableDraft) state.cableDraft = { id: genId(), type: "cable", points: [] };
    state.cableDraft.points.push({ x: snap(pos.x - m.x), y: snap(pos.y - m.y) });
    render();
    return;
  }

  // інші інструменти — за потреби
});



canvas.addEventListener("mousemove", e => {
  if (view.isPanning) {
    view.offsetX = e.clientX - view.panStartX;
    view.offsetY = e.clientY - view.panStartY;
    render();
  }
});

canvas.addEventListener("mouseup", e => {
  if (e.button === 2) view.isPanning = false;
});
canvas.addEventListener("contextmenu", e => e.preventDefault()); // вимикає контекстне меню

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
    if (a.x < 0 || a.y < 0 || a.x + a.w > activeModule.w || a.y + a.h > activeModule.h) {
      issues.push({ type: "error", msg: `${CATALOG[a.type].name} is outside habitat bounds.` });
    }
    // overlap
    for (let j = i + 1; j < objects.length; j++) {
      const b = objects[j];
      if (b.type === "cable") continue;
      if (rectsOverlap(a, b)) {
        issues.push({ type: "error", msg: `${CATALOG[a.type].name} overlaps with ${CATALOG[b.type].name}.` });
      }
    }
    // corridor validation removed - no visual corridor
    // access zone validation removed - no visual access zones
  }
  // 2) Cable along walls (approx: every cable point must lie near a wall)
  for (const o of objects) {
    if (o.type !== "cable") continue;
    const bad = o.points.some(p => {
      const nearLeft = Math.abs(p.x - 0) < GRID;
      const nearRight = Math.abs(p.x - activeModule.w) < GRID;
      const nearTop = Math.abs(p.y - 0) < GRID;
      const nearBottom = Math.abs(p.y - activeModule.h) < GRID;
      return !(nearLeft || nearRight || nearTop || nearBottom);
    });
    if (bad) issues.push({ type: "warn", msg: "Cable should be routed along walls/edges for safety." });
  }
  // 3) Bed away from Panel (noise/light) → recommend distance >= 120px
  const beds = objects.filter(o => o.type === "bed");
  const panels = objects.filter(o => o.type === "panel");
  for (const b of beds) {
    for (const p of panels) {
      const dx = (b.x + b.w / 2) - (p.x + p.w / 2);
      const dy = (b.y + b.h / 2) - (p.y + p.h / 2);
      const dist = Math.hypot(dx, dy);
      if (dist < 120) issues.push({ type: "hint", msg: "Consider placing Bed further from Panel to reduce noise/light exposure." });
    }
  }

  // 4) Check minimum free space (at least 30% of habitat should be clear)
  const totalArea = activeModule.w * activeModule.h;
  const objectArea = objects
    .filter(o => o.type !== "cable")
    .reduce((sum, o) => sum + (o.w * o.h), 0);
  const freeSpaceRatio = (totalArea - objectArea) / totalArea;
  if (freeSpaceRatio < 0.3) {
    issues.push({ type: "warn", msg: `Only ${Math.round(freeSpaceRatio * 100)}% free space. NASA recommends at least 30% for crew movement.` });
  }

  // 5) Check for objects too close to habitat walls (minimum 20px clearance)
  for (const o of objects) {
    if (o.type === "cable") continue;
    const clearance = 20;
    if (o.x < clearance ||
      o.y < clearance ||
      o.x + o.w > activeModule.w - clearance ||
      o.y + o.h > activeModule.h - clearance) {
      issues.push({ type: "warn", msg: `${CATALOG[o.type].name} is too close to habitat wall. Maintain ${clearance}px clearance.` });
    }
  }

  // 6) New NASA rules for extended systems
  // Kitchen should be near dining area
  const kitchens = objects.filter(o => o.type === "kitchen");
  const dinings = objects.filter(o => o.type === "dining");
  if (kitchens.length > 0 && dinings.length > 0) {
    for (const k of kitchens) {
      const minDist = Math.min(...dinings.map(d => {
        const dx = (k.x + k.w / 2) - (d.x + d.w / 2);
        const dy = (k.y + k.h / 2) - (d.y + d.h / 2);
        return Math.hypot(dx, dy);
      }));
      if (minDist > 200) {
        issues.push({ type: "hint", msg: "Consider placing Kitchen closer to Dining area for efficiency." });
      }
    }
  }

  // Exercise area should be away from sleeping areas
  const exercises = objects.filter(o => o.type === "exercise");
  for (const e of exercises) {
    for (const b of beds) {
      const dx = (e.x + e.w / 2) - (b.x + b.w / 2);
      const dy = (e.y + e.h / 2) - (b.y + b.h / 2);
      const dist = Math.hypot(dx, dy);
      if (dist < 150) {
        issues.push({ type: "hint", msg: "Consider placing Exercise area further from sleeping areas to reduce noise." });
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
      suggestions.push({ type: "hint", msg: "Add at least a Bed and a Panel to start a functional layout." });
    }
    if (objects.filter(o => o.type === "cabinet").length < 1) {
      suggestions.push({ type: "hint", msg: "Consider adding a Cabinet for storage along a wall to free central space." });
    }
    if (objects.filter(o => o.type === "kitchen").length < 1) {
      suggestions.push({ type: "hint", msg: "Consider adding a Kitchen for food preparation and crew nutrition." });
    }
    if (objects.filter(o => o.type === "exercise").length < 1) {
      suggestions.push({ type: "hint", msg: "Consider adding an Exercise area for crew physical health." });
    }
    if (objects.filter(o => o.type === "private").length < 1) {
      suggestions.push({ type: "hint", msg: "Consider adding Private Space for crew psychological well-being." });
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
      suggestions = [{ type: "error", msg: "AI proxy not reachable. Switch source to Local or start server.js" }];
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

  if (state.viewMode === "overview") {
    // In overview mode, check if clicking on a module
    for (const module of state.modules) {
      const scale = state.overviewScale;
      const x = module.x * scale;
      const y = module.y * scale;
      const w = module.w * scale;
      const h = module.h * scale;

      if (pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h) {
        switchModule(module.id);
        state.viewMode = "single";
        render();
        return;
      }
    }
    return;
  }

  if (state.tool === "cable") {
    if (!state.cableDraft) state.cableDraft = { id: genId(), type: "cable", points: [] };
    const activeModule = getActiveModule();
    if (!activeModule) return;

    const relX = snap(pos.x - activeModule.x);
    const relY = snap(pos.y - activeModule.y);
    state.cableDraft.points.push({ x: relX, y: relY });
    render();
    return;
  }

  if (state.tool === "module") {
    // Module tool - select modules or resize handles
    const moduleHits = modulesAtPoint(pos.x, pos.y);
    if (moduleHits.length) {
      state.selectedModuleId = moduleHits[moduleHits.length - 1];
      const module = state.modules.find(m => m.id === state.selectedModuleId);

      // Check if clicking on resize handle
      const resizeHandle = getResizeHandleAtPoint(pos.x, pos.y, module);
      if (resizeHandle) {
        drag = {
          id: module.id,
          dx: pos.x - module.x,
          dy: pos.y - module.y,
          type: "resize",
          handle: resizeHandle,
          startX: module.x,
          startY: module.y,
          startW: module.w,
          startH: module.h
        };
      } else {
        drag = {
          id: module.id,
          dx: pos.x - module.x,
          dy: pos.y - module.y,
          type: "module"
        };
      }
    } else {
      state.selectedModuleId = null;
    }
    render();
    return;
  }

  const hits = objectsAtPoint(pos.x, pos.y);
  if (hits.length) {
    state.selectedId = hits[hits.length - 1];
    const objects = getActiveObjects();
    const activeModule = getActiveModule();
    const obj = objects.find(o => o.id === state.selectedId);


    // Check if clicking on a cable control point
    if (obj && obj.type === "cable") {
      const cablePoint = getCablePointAtPoint(pos.x, pos.y, obj.id);
      if (cablePoint) {
        // Start dragging cable point
        drag = {
          id: obj.id,
          pointIndex: cablePoint.pointIndex,
          dx: pos.x - (activeModule.x + cablePoint.point.x),
          dy: pos.y - (activeModule.y + cablePoint.point.y),
          type: "cablePoint"
        };
      } else {
        // Start dragging entire cable
        drag = {
          id: obj.id,
          dx: 0,
          dy: 0,
          type: "cable"
        };
      }
    } else {
      // Calculate drag offset in global coordinates for regular objects
      drag = {
        id: obj.id,
        dx: pos.x - (activeModule.x + obj.x),
        dy: pos.y - (activeModule.y + obj.y),
        type: "object"
      };
    }
  } else {
    state.selectedId = null;
  }
  render();
});

canvas.addEventListener("mousemove", e => {
  const pos = getMouse(e);

  // Update cursor for resize handles
  if (!drag) {
    updateCursor(pos.x, pos.y);
  }

  if (!drag || state.viewMode === "overview") return;

  if (drag.type === "module") {
    // Move module
    const module = state.modules.find(m => m.id === drag.id);
    if (module) {
      module.x = snap(pos.x - drag.dx);
      module.y = snap(pos.y - drag.dy);
      // Update corridor position
      module.corridor.x = module.x + (module.w - module.corridor.w) / 2;
      module.corridor.y = module.y + (module.h - module.corridor.h) / 2;
      render();
    }
  } else if (drag.type === "resize") {
    // Resize module
    const module = state.modules.find(m => m.id === drag.id);
    if (module) {
      const deltaX = pos.x - drag.startX;
      const deltaY = pos.y - drag.startY;

      let newX = drag.startX;
      let newY = drag.startY;
      let newW = drag.startW;
      let newH = drag.startH;

      switch (drag.handle) {
        case "nw":
          newX = drag.startX + deltaX;
          newY = drag.startY + deltaY;
          newW = drag.startW - deltaX;
          newH = drag.startH - deltaY;
          break;
        case "ne":
          newY = drag.startY + deltaY;
          newW = drag.startW + deltaX;
          newH = drag.startH - deltaY;
          break;
        case "sw":
          newX = drag.startX + deltaX;
          newW = drag.startW - deltaX;
          newH = drag.startH + deltaY;
          break;
        case "se":
          newW = drag.startW + deltaX;
          newH = drag.startH + deltaY;
          break;
        case "n":
          newY = drag.startY + deltaY;
          newH = drag.startH - deltaY;
          break;
        case "s":
          newH = drag.startH + deltaY;
          break;
        case "w":
          newX = drag.startX + deltaX;
          newW = drag.startW - deltaX;
          break;
        case "e":
          newW = drag.startW + deltaX;
          break;
      }

      // Apply minimum size constraints
      if (newW >= MIN_MODULE_W && newH >= MIN_MODULE_H) {
        module.x = snap(newX);
        module.y = snap(newY);
        module.w = snap(newW);
        module.h = snap(newH);

        // Update corridor position
        module.corridor.x = module.x + (module.w - module.corridor.w) / 2;
        module.corridor.y = module.y + (module.h - module.corridor.h) / 2;

        render();
      }
    }
  } else if (drag.type === "object") {
    // Move object
    const objects = getActiveObjects();
    const activeModule = getActiveModule();
    const obj = objects.find(o => o.id === drag.id);
    if (obj) {
      // Convert global coordinates to module-relative coordinates
      const moduleX = pos.x - activeModule.x - drag.dx;
      const moduleY = pos.y - activeModule.y - drag.dy;
      obj.x = snap(moduleX);
      obj.y = snap(moduleY);
      clampObjectToModule(obj, activeModule); // 🔒 межі модуля
      render();
    }
  } else if (drag.type === "cablePoint") {
  const m = getActiveModule();
  const objs = getActiveObjects();
  const cable = objs.find(o => o.id === drag.id && o.type === "cable");
  if (!m || !cable) return;
  const pt = cable.points[drag.pointIndex];
  if (!pt) return;

  const loc = toLocal(m, pos.x, pos.y);
  pt.x = loc.x; pt.y = loc.y;
  clampPointToModule(pt, m);
  render();
} else if (drag.type === "cable") {
  const m = getActiveModule();
  const objs = getActiveObjects();
  const cable = objs.find(o => o.id === drag.id && o.type === "cable");
  if (!m || !cable) return;

  const cur = toLocal(m, pos.x, pos.y);
  const last = { x: drag.lastMX ?? cur.x, y: drag.lastMY ?? cur.y };
  const dx = cur.x - last.x;
  const dy = cur.y - last.y;

  for (const p of cable.points) {
    p.x = snap(p.x + dx);
    p.y = snap(p.y + dy);
    clampPointToModule(p, m);
  }

  drag.lastMX = cur.x;
  drag.lastMY = cur.y;
  render();
}

});


canvas.addEventListener("mouseup", e => {
  if (drag && state.viewMode !== "overview") {
    saveToHistory(); // Save state after drag operation
    saveState();
  }
  drag = null;
});

canvas.addEventListener("dblclick", e => {
  if (state.viewMode === "overview") return;

  if (state.tool === "cable" && state.cableDraft?.points?.length >= 2) {
  const m = getActiveModule();
  if (!m) return;
  saveToHistory?.();
  m.objects.push({
    id: state.cableDraft.id,
    type: "cable",
    points: state.cableDraft.points.map(p => ({ x: snap(p.x), y: snap(p.y) }))
  });
  state.selectedId = state.cableDraft.id;
  state.cableDraft = null;
  state.tool = "select";
  markToolActive?.();
  saveState?.(); render();
}

});

document.addEventListener("keydown", e => {
  if (state.viewMode === "overview") {
    if (e.key.toLowerCase() === "o") {
      toggleOverviewMode();
    }
    return;
  }

  // Undo/Redo functionality
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
    return;
  } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
    e.preventDefault();
    redo();
    return;
  }

  if (e.key === "Delete") {
    if (state.tool === "module" && state.selectedModuleId) {
      // Delete selected module
      deleteModule(state.selectedModuleId);
    } else if (state.selectedId) {
      // Delete selected object
      const activeModule = getActiveModule();
      if (activeModule) {
        saveToHistory(); // Save state before deletion
        activeModule.objects = activeModule.objects.filter(o => o.id !== state.selectedId);
        state.selectedId = null;
        saveState();
        render();
      }
    }
  } else if (e.key.toLowerCase() === "r") {
    // rotation placeholder: swap w/h for axis-aligned rectangles
    const objects = getActiveObjects();
    const obj = objects.find(o => o.id === state.selectedId);
    if (obj && obj.type !== "cable") {
      saveToHistory(); // Save state before rotation
      const t = obj.w; obj.w = obj.h; obj.h = t;
      saveState();
      render();
    }
  } else if (e.key.toLowerCase() === "v") {
    state.tool = "select"; markToolActive();
  } else if (e.key.toLowerCase() === "c") {
    state.tool = "cable"; state.cableDraft = { id: genId(), type: "cable", points: [] }; markToolActive();
  } else if (e.key.toLowerCase() === "m") {
    state.tool = "module"; markToolActive();
  } else if (e.key.toLowerCase() === "o") {
    toggleOverviewMode();
  } else if (e.code === "KeyD" && (e.ctrlKey || e.metaKey)) {
    const objects = getActiveObjects();
    const obj = objects.find(o => o.id === state.selectedId);
    if (obj) {
      const activeModule = getActiveModule();
      if (activeModule) {
        saveToHistory(); // Save state before duplication
        const clone = JSON.parse(JSON.stringify(obj));
        clone.id = genId();
        clone.x += GRID; clone.y += GRID;
        activeModule.objects.push(clone);
        state.selectedId = clone.id;
        saveState();
        render();
      }
    }
  } else if (e.key === "+" || e.key === "=") {
    // Add cable point
    const objects = getActiveObjects();
    const cable = objects.find(o => o.id === state.selectedId && o.type === "cable");
    if (cable && cable.points && cable.points.length > 0) {
      saveToHistory(); // Save state before adding point
      const activeModule = getActiveModule();
      if (activeModule) {
        // Add point at the end of the cable
        const lastPoint = cable.points[cable.points.length - 1];
        cable.points.push({
          x: lastPoint.x + GRID,
          y: lastPoint.y
        });
        saveState();
        render();
      }
    }
  } else if (e.key === "-" || e.key === "_") {
    // Remove cable point
    const objects = getActiveObjects();
    const cable = objects.find(o => o.id === state.selectedId && o.type === "cable");
    if (cable && cable.points && cable.points.length > 2) {
      saveToHistory(); // Save state before removing point
      // Remove the last point
      cable.points.pop();
      saveState();
      render();
    }
  }
});

function getMouse(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left - view.offsetX) / view.zoom;
  const y = (e.clientY - rect.top - view.offsetY) / view.zoom;
  return { x, y };
}

function render() {
  // Очистити екран
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 🔍 Застосувати масштаб і зсув
  ctx.save();
  ctx.setTransform(view.zoom, 0, 0, view.zoom, view.offsetX, view.offsetY);

  // Основне малювання сцени
  if (state.viewMode === "overview") {
    drawOverviewMode();
  } else {
    drawHabitat();
    drawGrid();
    drawObjects();
    drawValidationOverlay();
  }

  // Відновити стан після трансформацій
  ctx.restore();

  // 🔄 Оновити статистику й кнопки
  updateStats();
  updateOverviewButton();
}


function updateStats() {
  if (state.viewMode === "overview") {
    // Overview mode stats
    const totalObjects = state.modules.reduce((sum, m) => sum + m.objects.length, 0);
    const totalModules = state.modules.length;
    const totalIssues = state.modules.reduce((sum, m) => {
      const moduleObjects = m.objects;
      const moduleIssues = validateLayoutForModule(m);
      return sum + moduleIssues.length;
    }, 0);

    $("#object-count").textContent = totalObjects;
    $("#free-space").textContent = `${totalModules} modules`;
    $("#issue-count").textContent = totalIssues;
  } else {
    // Single module mode stats
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
  }

  // Update module list
  renderModuleList();
}

function validateLayoutForModule(module) {
  const issues = [];
  const objects = module.objects;

  // Basic validation for module
  for (let i = 0; i < objects.length; i++) {
    const a = objects[i];
    if (a.type === "cable") continue;

    // inside module
    if (a.x < 0 || a.y < 0 || a.x + a.w > module.w || a.y + a.h > module.h) {
      issues.push({ type: "error", msg: `${CATALOG[a.type].name} is outside module bounds.` });
    }

    // overlap
    for (let j = i + 1; j < objects.length; j++) {
      const b = objects[j];
      if (b.type === "cable") continue;
      if (rectsOverlap(a, b)) {
        issues.push({ type: "error", msg: `${CATALOG[a.type].name} overlaps with ${CATALOG[b.type].name}.` });
      }
    }
  }

  return issues;
}

function drawValidationOverlay() {
  const issues = validateLayout();
  const errorObjects = new Set();
  const warnObjects = new Set();
  const objects = getActiveObjects();
  const activeModule = getActiveModule();

  // Collect objects with issues - improved logic
  for (const issue of issues) {
    if (issue.type === "error" || issue.type === "warn") {
      // More precise object identification
      for (const obj of objects) {
        if (obj.type === "cable") continue;

        // Check if this specific object is mentioned in the issue
        const objName = CATALOG[obj.type].name;
        const isSpecificObject = issue.msg.includes(objName) &&
          (issue.msg.includes("overlaps with") ||
            issue.msg.includes("blocks") ||
            issue.msg.includes("outside") ||
            issue.msg.includes("too close") ||
            issue.msg.includes("access zone is obstructed"));

        if (isSpecificObject) {
          if (issue.type === "error") errorObjects.add(obj.id);
          else warnObjects.add(obj.id);
        }
      }
    }
  }

  // Draw overlay indicators
  for (const obj of objects) {
    if (obj.type === "cable") continue;

    const objX = activeModule.x + obj.x;
    const objY = activeModule.y + obj.y;

    if (errorObjects.has(obj.id)) {
      // Red error overlay
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#ff6b6b";
      ctx.fillRect(objX, objY, obj.w, obj.h);
      ctx.restore();
    } else if (warnObjects.has(obj.id)) {
      // Yellow warning overlay
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = "#ffd93d";
      ctx.fillRect(objX, objY, obj.w, obj.h);
      ctx.restore();
    }
  }
}

function markToolActive() {
  $("#tool-select").classList.toggle("active", state.tool === "select");
  $("#tool-cable").classList.toggle("active", state.tool === "cable");
  $("#tool-module").classList.toggle("active", state.tool === "module");
}


// Module management functions
function addModule(templateKey = 'standard', customConfig = null) {
  saveToHistory(); // Save state before adding module
  const moduleCount = state.modules.length;
  let template, moduleName, moduleColor, moduleType, corridorWidth;

  if (customConfig) {
    // Use custom configuration from modal
    template = customConfig.template;
    moduleName = customConfig.name;
    moduleColor = customConfig.color;
    moduleType = customConfig.type;
    corridorWidth = customConfig.corridorWidth;
  } else {
    // Use template configuration
    template = MODULE_TEMPLATES[templateKey];
    moduleName = `${template.name} Module ${moduleCount + 1}`;
    moduleColor = "#0d1b26";
    moduleType = "habitat";
    corridorWidth = template.corridor.w;
  }

  const offsetX = 50 + (moduleCount * 30);
  const offsetY = 50 + (moduleCount * 30);

  const newModule = {
    id: `module-${moduleCount + 1}`,
    name: moduleName,
    x: offsetX,
    y: offsetY,
    w: template.w,
    h: template.h,
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
  state.cableDraft = null; // Clear any draft cables when adding new module

  // Auto-create connection to previous module
  if (moduleCount > 0) {
    const prevModule = state.modules[moduleCount - 1];
    state.connections.push({
      id: `conn-${state.connections.length + 1}`,
      from: prevModule.id,
      to: newModule.id,
      type: "Habitat Link"
    });
  }

  saveState();
  renderModuleList();
  render();
}

function switchModule(moduleId) {
  state.activeModuleId = moduleId;
  state.selectedId = null;
  state.cableDraft = null; // Clear any draft cables when switching modules
  saveState();
  renderModuleList();
  render();
}

function deleteModule(moduleId) {
  if (state.modules.length <= 1) {
    alert("Cannot delete the last module!");
    return;
  }

  saveToHistory(); // Save state before deleting module

  // Remove module
  state.modules = state.modules.filter(m => m.id !== moduleId);

  // Remove connections involving this module
  state.connections = state.connections.filter(c => c.from !== moduleId && c.to !== moduleId);

  // If deleted module was active, switch to first available module
  if (state.activeModuleId === moduleId) {
    state.activeModuleId = state.modules[0].id;
  }

  // Clear selections
  state.selectedId = null;
  state.selectedModuleId = null;
  state.cableDraft = null;

  saveState();
  renderModuleList();
  render();
}

function resizeModule(moduleId, newWidth, newHeight) {
  const module = state.modules.find(m => m.id === moduleId);
  if (module) {
    module.w = Math.max(MIN_MODULE_W, newWidth); // Minimum width
    module.h = Math.max(MIN_MODULE_H, newHeight); // Minimum height

    // Update corridor position to center
    module.corridor.x = module.x + (module.w - module.corridor.w) / 2;
    module.corridor.y = module.y + (module.h - module.corridor.h) / 2;

    saveState();
    render();
  }
}

function editModule(moduleId) {
  const module = state.modules.find(m => m.id === moduleId);
  if (!module) return;

  // Populate edit modal with current module data
  $("#edit-module-name").value = module.name;
  $("#edit-module-width").value = module.w;
  $("#edit-module-height").value = module.h;
  $("#edit-module-color").value = module.color || "#0d1b26";
  $("#edit-module-type").value = module.type || "habitat";

  // Store current module ID for saving
  state.editingModuleId = moduleId;

  // Show edit modal
  $("#edit-modal").style.display = "block";
}

// Modal functions
function showModuleModal() {
  const modal = $("#module-modal");
  modal.style.display = "block";

  // Reset form to default values
  $("#module-name").value = "New Module";
  $("#module-template-select").value = "standard";
  $("#module-color").value = "#0d1b26";
  $("#module-type").value = "habitat";
  // corridor width removed

  // Hide custom size group initially
  $("#custom-size-group").style.display = "none";
}

function hideModuleModal() {
  const modal = $("#module-modal");
  modal.style.display = "none";
}

function hideEditModal() {
  const modal = $("#edit-modal");
  modal.style.display = "none";
  state.editingModuleId = null;
}

function saveModuleChanges() {
  if (!state.editingModuleId) return;

  const module = state.modules.find(m => m.id === state.editingModuleId);
  if (!module) return;

  const name = $("#edit-module-name").value.trim();
  const width = parseInt($("#edit-module-width").value);
  const height = parseInt($("#edit-module-height").value);
  const color = $("#edit-module-color").value;
  const type = $("#edit-module-type").value;

  if (!name) {
    alert("Please enter a module name!");
    return;
  }

  if (width < 200 || height < 150) {
    alert("Minimum size is 200x150 pixels!");
    return;
  }

  // Update module properties
  module.name = name;
  module.color = color;
  module.type = type;

  // Update size if changed
  if (width !== module.w || height !== module.h) {
    resizeModule(state.editingModuleId, width, height);
  }

  saveState();
  renderModuleList();
  render();
  hideEditModal();
}

// corridor width display removed

function updateCustomSizeGroup() {
  const template = $("#module-template-select").value;
  const customGroup = $("#custom-size-group");

  if (template === "custom") {
    customGroup.style.display = "block";
  } else {
    customGroup.style.display = "none";
    // Update width/height based on template
    const templateData = MODULE_TEMPLATES[template];
    if (templateData) {
      $("#module-width").value = templateData.w;
      $("#module-height").value = templateData.h;
    }
  }
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

// Overview mode functions
function toggleOverviewMode() {
  state.viewMode = state.viewMode === "single" ? "overview" : "single";
  state.selectedId = null;
  state.cableDraft = null;
  saveState();
  render();
}

function drawOverviewMode() {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw all modules
  for (const module of state.modules) {
    drawModuleInOverview(module);
  }

  // Draw module connections
  drawModuleConnections();
}

function drawModuleInOverview(module) {
  const scale = state.overviewScale;
  const x = module.x * scale;
  const y = module.y * scale;
  const w = module.w * scale;
  const h = module.h * scale;

  // Module border
  ctx.fillStyle = "#0d1b26";
  ctx.strokeStyle = module.id === state.activeModuleId ? "#3b82f6" : "#284157";
  ctx.lineWidth = module.id === state.activeModuleId ? 3 : 2;
  roundRect(x, y, w, h, 8, true, true);

  // Corridor removed from overview

  // Module name
  ctx.fillStyle = "#9ad";
  ctx.font = "bold 10px system-ui";
  ctx.fillText(module.name, x + 5, y - 5);

  // Objects count
  ctx.fillStyle = "#7aa2f7";
  ctx.font = "8px system-ui";
  ctx.fillText(`${module.objects.length} objects`, x + 5, y + h + 12);

  // Draw objects as small dots
  for (const obj of module.objects) {
    if (obj.type === "cable") continue;
    const cat = CATALOG[obj.type];
    ctx.fillStyle = cat.color;
    ctx.fillRect(
      x + (obj.x * scale),
      y + (obj.y * scale),
      Math.max(2, obj.w * scale),
      Math.max(2, obj.h * scale)
    );
  }
}

function drawModuleConnections() {
  // Draw connections between modules (solid lines)
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 2;
  ctx.setLineDash([]); // Solid lines instead of dashed

  for (const connection of state.connections) {
    const module1 = state.modules.find(m => m.id === connection.from);
    const module2 = state.modules.find(m => m.id === connection.to);

    if (module1 && module2) {
      const x1 = module1.x + module1.w / 2;
      const y1 = module1.y + module1.h / 2;
      const x2 = module2.x + module2.w / 2;
      const y2 = module2.y + module2.h / 2;

      ctx.beginPath();
      ctx.moveTo(x1 * state.overviewScale, y1 * state.overviewScale);
      ctx.lineTo(x2 * state.overviewScale, y2 * state.overviewScale);
      ctx.stroke();

      // Draw connection label
      const midX = (x1 + x2) / 2 * state.overviewScale;
      const midY = (y1 + y2) / 2 * state.overviewScale;
      ctx.fillStyle = "#9ad";
      ctx.font = "8px system-ui";
      ctx.fillText(connection.type || "Connection", midX, midY - 5);
    }
  }
}

/* ---------------- UI wiring ---------------- */
// Category menu functionality
$$(".category-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const category = btn.dataset.category;
    const menu = document.getElementById(`${category}-menu`);

    // Close all other menus
    $$(".category-menu").forEach(m => {
      if (m !== menu) {
        m.style.display = "none";
        m.previousElementSibling.classList.remove("active");
      }
    });

    // Toggle current menu
    if (menu.style.display === "none" || menu.style.display === "") {
      menu.style.display = "block";
      btn.classList.add("active");
    } else {
      menu.style.display = "none";
      btn.classList.remove("active");
    }
  });
});

// Close menus when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".category-group")) {
    $$(".category-menu").forEach(menu => {
      menu.style.display = "none";
      menu.previousElementSibling.classList.remove("active");
    });
  }
});

// Item click handlers
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
  const obj = objects.find(o => o.id === state.selectedId);
  if (obj && obj.type !== "cable") {
    const t = obj.w; obj.w = obj.h; obj.h = t;
    saveState();
    render();
  }
});

$("#btn-duplicate").addEventListener("click", () => {
  const objects = getActiveObjects();
  const obj = objects.find(o => o.id === state.selectedId);
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
      activeModule.objects = activeModule.objects.filter(o => o.id !== state.selectedId);
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

$("#tool-module").addEventListener("click", () => {
  state.tool = "module";
  markToolActive();
  // одразу виділяємо активний модуль — drawHabitat показує рамку/хендли
  state.selectedModuleId = state.activeModuleId;
  render();
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
    state.cableDraft = null; // Clear any draft cables
    saveState();
    render();
  }
});

$("#btn-add-module").addEventListener("click", () => {
  showModuleModal();
});

$("#btn-overview").addEventListener("click", toggleOverviewMode);

$("#btn-edit-module").addEventListener("click", () => {
  if (state.selectedModuleId) {
    editModule(state.selectedModuleId);
  }
});

$("#btn-delete-module").addEventListener("click", () => {
  if (state.selectedModuleId) {
    if (confirm("Are you sure you want to delete this module?")) {
      deleteModule(state.selectedModuleId);
    }
  }
});

// Modal event listeners
$("#btn-create-module").addEventListener("click", () => {
  const name = $("#module-name").value.trim();
  const template = $("#module-template-select").value;
  const color = $("#module-color").value;
  const type = $("#module-type").value;
  const corridorWidth = 80; // default corridor width

  if (!name) {
    alert("Please enter a module name!");
    return;
  }

  let templateData;
  if (template === "custom") {
    const width = parseInt($("#module-width").value);
    const height = parseInt($("#module-height").value);

    if (width < 200 || height < 150) {
      alert("Minimum size is 200x150 pixels!");
      return;
    }

    templateData = {
      w: width,
      h: height,
      corridor: { w: corridorWidth, h: 80 }
    };
  } else {
    templateData = MODULE_TEMPLATES[template];
    templateData.corridor.w = corridorWidth;
  }

  const customConfig = {
    template: templateData,
    name: name,
    color: color,
    type: type,
    corridorWidth: corridorWidth
  };

  addModule(null, customConfig);
  hideModuleModal();
});

$("#btn-cancel-module").addEventListener("click", hideModuleModal);

$(".close").addEventListener("click", hideModuleModal);

// Edit modal event listeners
$("#btn-save-module").addEventListener("click", saveModuleChanges);

$("#btn-cancel-edit").addEventListener("click", hideEditModal);

$(".close-edit").addEventListener("click", hideEditModal);

// Close modal when clicking outside
window.addEventListener("click", (e) => {
  const moduleModal = $("#module-modal");
  const editModal = $("#edit-modal");

  if (e.target === moduleModal) {
    hideModuleModal();
  } else if (e.target === editModal) {
    hideEditModal();
  }
});

// Template change handler
$("#module-template-select").addEventListener("change", updateCustomSizeGroup);

// corridor width slider removed

// Update overview button text based on current mode
function updateOverviewButton() {
  const btn = $("#btn-overview");
  if (state.viewMode === "overview") {
    btn.textContent = "👁️ Single Mode";
    btn.style.background = "#dc2626";
  } else {
    btn.textContent = "👁️ Overview Mode";
    btn.style.background = "#7c3aed";
  }

  // Show/hide module editing buttons based on tool and selection
  const editBtn = $("#btn-edit-module");
  const deleteBtn = $("#btn-delete-module");

  if (state.tool === "module" && state.selectedModuleId) {
    editBtn.style.display = "block";
    deleteBtn.style.display = "block";
  } else {
    editBtn.style.display = "none";
    deleteBtn.style.display = "none";
  }
}

// Cable tools event listeners
$("#btn-add-cable-point").addEventListener("click", () => {
  const objects = getActiveObjects();
  const cable = objects.find(o => o.id === state.selectedId && o.type === "cable");
  if (cable && cable.points && cable.points.length > 0) {
    saveToHistory(); // Save state before adding point
    const activeModule = getActiveModule();
    if (activeModule) {
      // Add point at the end of the cable
      const lastPoint = cable.points[cable.points.length - 1];
      cable.points.push({
        x: lastPoint.x + GRID,
        y: lastPoint.y
      });
      saveState();
      render();
    }
  }
});

$("#btn-remove-cable-point").addEventListener("click", () => {
  const objects = getActiveObjects();
  const cable = objects.find(o => o.id === state.selectedId && o.type === "cable");
  if (cable && cable.points && cable.points.length > 2) {
    saveToHistory(); // Save state before removing point
    // Remove the last point
    cable.points.pop();
    saveState();
    render();
  }
});

$("#btn-delete-cable").addEventListener("click", () => {
  if (state.selectedId) {
    const objects = getActiveObjects();
    const cable = objects.find(o => o.id === state.selectedId && o.type === "cable");
    if (cable) {
      const activeModule = getActiveModule();
      if (activeModule) {
        saveToHistory(); // Save state before deletion
        activeModule.objects = activeModule.objects.filter(o => o.id !== state.selectedId);
        state.selectedId = null;
        saveState();
        render();
      }
    }
  }
});

// Undo/Redo button event listeners
$("#btn-undo").addEventListener("click", undo);
$("#btn-redo").addEventListener("click", redo);


// Function to update cable tools visibility
function updateCableToolsVisibility() {
  const cableTools = $("#cable-tools");
  if (!cableTools) return;

  const objects = getActiveObjects();
  const selectedObj = objects.find(o => o.id === state.selectedId);

  if (selectedObj && selectedObj.type === "cable") {
    cableTools.style.display = "block";
  } else {
    cableTools.style.display = "none";
  }
}

// Wrap render to update cable tools visibility
const originalRender = render;
render = function () {
  originalRender();
  updateCableToolsVisibility?.();
};

// initial draw
loadState();
renderModuleList();
render();

document.addEventListener("DOMContentLoaded", () => {
  const aiPanel = document.getElementById("ai-floating-panel");
  const btnAI = document.getElementById("btn-ai");
  const btnCloseAI = document.getElementById("btn-close-ai");

  btnAI.addEventListener("click", () => {
    aiPanel.classList.toggle("visible");
  });

  btnCloseAI.addEventListener("click", () => {
    aiPanel.classList.remove("visible");
  });
});