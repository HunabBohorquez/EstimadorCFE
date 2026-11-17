'use strict';

/* ============================ Utilidades ============================ */
const $ = (id) => document.getElementById(id);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmtMXN = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
const fmtKwh = (n) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kWh';
const KEYS = { items: 'estimadorcfe.items', tariffs: 'estimadorcfe.tariffs' };
const BIMESTERS_PER_YEAR = 6;

const DEFAULT_TARIFFS = Object.freeze({
  basicLimit: 150, interLimit: 280,
  basicRate: 1.05, interRate: 1.28, excessRate: 3.75,
  fixedCharge: 60, iva: 16
});

const DEMO_HOME = [
  { name: 'Refrigerador',        watts: 150,  qty: 1, hours: 8, days: 60 },
  { name: 'Aire acondicionado',  watts: 1200, qty: 1, hours: 2, days: 60 },
  { name: 'Televisión',          watts: 100,  qty: 1, hours: 4, days: 60 },
  { name: 'Focos LED',           watts: 9,    qty: 8, hours: 5, days: 60 },
  { name: 'Lavadora',            watts: 500,  qty: 1, hours: 1, days: 24 },
  { name: 'Computadora',         watts: 150,  qty: 1, hours: 7, days: 60 }
];

/* ============================ TariffEngine ============================ */
class TariffEngine {
  constructor(tariffs) { this.tariffs = { ...DEFAULT_TARIFFS, ...tariffs }; }

  static applianceKwh(a) { return (a.watts * a.qty * a.hours * a.days) / 1000; }

  static validate(t) {
    const nums = ['basicLimit', 'interLimit', 'basicRate', 'interRate', 'excessRate', 'fixedCharge', 'iva'];
    for (const k of nums) {
      if (typeof t[k] !== 'number' || !Number.isFinite(t[k]) || t[k] < 0) return 'Todos los valores de tarifa deben ser números ≥ 0.';
    }
    if (t.interLimit <= t.basicLimit) return 'El límite Intermedio debe ser mayor que el límite Básico.';
    if (t.iva > 100) return 'El IVA no puede exceder 100 %.';
    return null;
  }

  setTariffs(t) { this.tariffs = { ...t }; }

  /** Calcula el recibo completo para un consumo bimestral en kWh. */
  calculate(kwh) {
    const t = this.tariffs;
    const total = Math.max(0, kwh);
    const basicKwh = Math.min(total, t.basicLimit);
    const interKwh = Math.max(0, Math.min(total, t.interLimit) - t.basicLimit);
    const excessKwh = Math.max(0, total - t.interLimit);
    const tiers = [
      { name: 'Básico',     range: `0 – ${t.basicLimit} kWh`,                    kwh: basicKwh,  rate: t.basicRate },
      { name: 'Intermedio', range: `${t.basicLimit + 1} – ${t.interLimit} kWh`,  kwh: interKwh,  rate: t.interRate },
      { name: 'Excedente',  range: `> ${t.interLimit} kWh`,                      kwh: excessKwh, rate: t.excessRate }
    ].map((x) => ({ ...x, cost: round2(x.kwh * x.rate) }));

    const energy = round2(tiers.reduce((s, x) => s + x.cost, 0));
    const subtotal = round2(energy + t.fixedCharge);
    const iva = round2((subtotal * t.iva) / 100);
    return { kwh: total, tiers, energy, fixed: t.fixedCharge, subtotal, ivaRate: t.iva, iva, total: round2(subtotal + iva) };
  }
}

/* ============================ ApplianceStore ============================ */
class ApplianceStore {
  constructor() { this.items = []; this.load(); }

  static validate(d) {
    if (!d.name || !d.name.trim()) return 'El nombre es obligatorio.';
    if (!(d.watts > 0)) return 'La potencia debe ser mayor a 0 W.';
    if (!Number.isInteger(d.qty) || d.qty < 1) return 'La cantidad debe ser un entero ≥ 1.';
    if (!(d.hours >= 0 && d.hours <= 24)) return 'Las horas diarias deben estar entre 0 y 24.';
    if (!Number.isInteger(d.days) || d.days < 1 || d.days > 60) return 'Los días por bimestre deben ser un entero entre 1 y 60.';
    return null;
  }

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEYS.items) || '[]');
      this.items = Array.isArray(raw) ? raw.filter((i) => !ApplianceStore.validate(i)) : [];
    } catch { this.items = []; }
  }
  save() { try { localStorage.setItem(KEYS.items, JSON.stringify(this.items)); } catch { /* almacenamiento no disponible */ } }

  add(d) {
    const item = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()), active: true, ...d, name: d.name.trim() };
    this.items.push(item); this.save(); return item;
  }
  update(id, d) {
    const i = this.items.findIndex((x) => x.id === id);
    if (i < 0) return false;
    this.items[i] = { ...this.items[i], ...d, name: d.name.trim() }; this.save(); return true;
  }
  remove(id) { this.items = this.items.filter((x) => x.id !== id); this.save(); }
  toggle(id) { const it = this.get(id); if (it) { it.active = !it.active; this.save(); } }
  get(id) { return this.items.find((x) => x.id === id); }
  clear() { this.items = []; this.save(); }
  loadDemo() { this.items = []; DEMO_HOME.forEach((d) => this.add(d)); }
  active() { return this.items.filter((x) => x.active); }
  totalKwh() { return this.active().reduce((s, x) => s + TariffEngine.applianceKwh(x), 0); }
}

/* ============================ SavingsSimulator ============================ */
class SavingsSimulator {
  constructor(engine) { this.engine = engine; }

  /** Compara el recibo actual contra el recibo con el equipo reemplazado. */
  simulate(appliance, newWatts, currentTotalKwh) {
    const oldKwh = TariffEngine.applianceKwh(appliance);
    const newKwh = TariffEngine.applianceKwh({ ...appliance, watts: newWatts });
    const newTotalKwh = Math.max(0, currentTotalKwh - oldKwh + newKwh);
    const before = this.engine.calculate(currentTotalKwh);
    const after = this.engine.calculate(newTotalKwh);
    const savedKwh = oldKwh - newKwh;
    const savedMoney = round2(before.total - after.total);
    return {
      oldKwh, newKwh, savedKwh, savedMoney, before, after,
      // kWh recortados del escalón más caro (el ahorro se descuenta primero del Excedente)
      excessCut: before.tiers[2].kwh - after.tiers[2].kwh,
      annualKwh: savedKwh * BIMESTERS_PER_YEAR,
      annualMoney: round2(savedMoney * BIMESTERS_PER_YEAR)
    };
  }
}

/* ============================ ChartRenderer ============================ */
class ChartRenderer {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); }

  render(items) {
    const rows = items
      .map((a) => ({ name: a.name, kwh: TariffEngine.applianceKwh(a) }))
      .sort((a, b) => b.kwh - a.kwh);
    const total = rows.reduce((s, r) => s + r.kwh, 0);
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, this.canvas.clientWidth || 600);
    const rowH = 36, pad = 12;
    const height = Math.max(110, rows.length * rowH + pad * 2);
    this.canvas.width = width * dpr; this.canvas.height = height * dpr;
    this.canvas.style.height = height + 'px';
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = '13px system-ui, sans-serif'; ctx.textBaseline = 'middle';

    if (!rows.length || total === 0) {
      ctx.fillStyle = '#5d6779'; ctx.textAlign = 'left';
      ctx.fillText('Sin aparatos activos con consumo para graficar.', pad, height / 2);
      return;
    }
    const labelW = Math.min(160, width * 0.28), valueW = 150;
    const barMax = Math.max(40, width - labelW - valueW - pad * 2);
    const maxKwh = rows[0].kwh;
    const palette = ['#1f6feb', '#8250df', '#1a8f4c', '#d97706', '#d1344a', '#0891b2'];

    rows.forEach((r, i) => {
      const y = pad + i * rowH + rowH / 2;
      const w = Math.max(2, (r.kwh / maxKwh) * barMax);
      ctx.fillStyle = '#1d2433'; ctx.textAlign = 'right';
      ctx.fillText(this.truncate(r.name, labelW - 10), pad + labelW - 8, y);
      ctx.fillStyle = palette[i % palette.length];
      ctx.fillRect(pad + labelW, y - 11, w, 22);
      ctx.fillStyle = '#1d2433'; ctx.textAlign = 'left';
      ctx.fillText(`${r.kwh.toFixed(1)} kWh (${((r.kwh / total) * 100).toFixed(1)}%)`, pad + labelW + w + 8, y);
    });
  }

  truncate(text, maxPx) {
    if (this.ctx.measureText(text).width <= maxPx) return text;
    let t = text;
    while (t.length > 1 && this.ctx.measureText(t + '…').width > maxPx) t = t.slice(0, -1);
    return t + '…';
  }
}

/* ============================ App (UI) ============================ */
class App {
  constructor() {
    this.store = new ApplianceStore();
    this.engine = new TariffEngine(this.loadTariffs());
    this.simulator = new SavingsSimulator(this.engine);
    this.chart = new ChartRenderer($('chart'));
    this.editingId = null;
    this.bind();
    this.fillTariffForm();
    this.render();
  }

  loadTariffs() {
    try { return JSON.parse(localStorage.getItem(KEYS.tariffs) || '{}'); } catch { return {}; }
  }

  bind() {
    $('appliance-form').addEventListener('submit', (e) => { e.preventDefault(); this.submitAppliance(); });
    $('f-cancel').addEventListener('click', () => this.resetForm());
    $('tariff-form').addEventListener('submit', (e) => { e.preventDefault(); this.applyTariffs(); });
    $('t-reset').addEventListener('click', () => { this.engine.setTariffs({ ...DEFAULT_TARIFFS }); this.persistTariffs(); this.fillTariffForm(); this.render(); });
    $('btn-demo').addEventListener('click', () => { this.store.loadDemo(); this.resetForm(); this.render(); });
    $('btn-clear').addEventListener('click', () => { if (confirm('¿Vaciar todo el inventario?')) { this.store.clear(); this.resetForm(); this.render(); } });
    $('btn-export').addEventListener('click', () => this.exportReport());
    $('sim-select').addEventListener('change', () => this.renderSimulator());
    $('sim-watts').addEventListener('input', () => this.renderSimulator());
    window.addEventListener('resize', () => this.chart.render(this.store.active()));
  }

  readApplianceForm() {
    return {
      name: $('f-name').value, watts: parseFloat($('f-watts').value), qty: parseInt($('f-qty').value, 10),
      hours: parseFloat($('f-hours').value), days: parseInt($('f-days').value, 10)
    };
  }

  submitAppliance() {
    const data = this.readApplianceForm();
    const err = ApplianceStore.validate(data);
    $('form-error').textContent = err || '';
    if (err) return;
    if (this.editingId) this.store.update(this.editingId, data); else this.store.add(data);
    this.resetForm(); this.render();
  }

  startEdit(id) {
    const a = this.store.get(id); if (!a) return;
    this.editingId = id;
    $('f-name').value = a.name; $('f-watts').value = a.watts; $('f-qty').value = a.qty;
    $('f-hours').value = a.hours; $('f-days').value = a.days;
    $('f-submit').textContent = 'Guardar cambios'; $('f-cancel').hidden = false;
    $('f-name').focus();
  }

  resetForm() {
    this.editingId = null; $('appliance-form').reset(); $('f-qty').value = 1; $('f-days').value = 60;
    $('f-submit').textContent = 'Agregar'; $('f-cancel').hidden = true; $('form-error').textContent = '';
  }

  fillTariffForm() {
    Object.entries(this.engine.tariffs).forEach(([k, v]) => { const el = $('t-' + k); if (el) el.value = v; });
    $('tariff-error').textContent = '';
  }

  applyTariffs() {
    const t = {};
    Object.keys(DEFAULT_TARIFFS).forEach((k) => { t[k] = parseFloat($('t-' + k).value); });
    const err = TariffEngine.validate(t);
    $('tariff-error').textContent = err || '';
    if (err) return;
    this.engine.setTariffs(t); this.persistTariffs(); this.render();
  }

  persistTariffs() { try { localStorage.setItem(KEYS.tariffs, JSON.stringify(this.engine.tariffs)); } catch { /* ignorar */ } }

  /* ---------- Renderizado ---------- */
  render() {
    this.renderTable(); this.renderBreakdown(); this.renderSimulatorOptions(); this.renderSimulator();
    this.chart.render(this.store.active());
  }

  cell(tr, text) { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); return td; }

  renderTable() {
    const tbody = document.querySelector('#appliance-table tbody');
    tbody.replaceChildren();
    if (!this.store.items.length) {
      const tr = tbody.insertRow(); const td = this.cell(tr, 'Sin aparatos. Agrega uno o carga el Hogar Demo.');
      td.colSpan = 8; td.style.textAlign = 'center'; return;
    }
    this.store.items.forEach((a) => {
      const tr = tbody.insertRow(); if (!a.active) tr.className = 'inactive';
      const tdSw = tr.insertCell(); tdSw.style.textAlign = 'center';
      const label = document.createElement('label'); label.className = 'switch';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = a.active;
      cb.setAttribute('aria-label', 'Activar ' + a.name);
      cb.addEventListener('change', () => { this.store.toggle(a.id); this.render(); });
      const sl = document.createElement('span'); sl.className = 'slider';
      label.append(cb, sl); tdSw.appendChild(label);
      this.cell(tr, a.name); this.cell(tr, a.watts); this.cell(tr, a.qty); this.cell(tr, a.hours); this.cell(tr, a.days);
      this.cell(tr, TariffEngine.applianceKwh(a).toFixed(2));
      const tdAct = tr.insertCell(); const box = document.createElement('div'); box.className = 'row-actions';
      const be = document.createElement('button'); be.textContent = 'Editar'; be.addEventListener('click', () => this.startEdit(a.id));
      const bd = document.createElement('button'); bd.textContent = 'Borrar'; bd.className = 'danger';
      bd.addEventListener('click', () => { this.store.remove(a.id); if (this.editingId === a.id) this.resetForm(); this.render(); });
      box.append(be, bd); tdAct.appendChild(box);
    });
  }

  renderBreakdown() {
    const bill = this.engine.calculate(this.store.totalKwh());
    $('total-kwh').textContent = fmtKwh(bill.kwh);
    const tbody = document.querySelector('#breakdown-table tbody'); tbody.replaceChildren();
    bill.tiers.forEach((t) => {
      const tr = tbody.insertRow();
      this.cell(tr, 'Escalón ' + t.name); this.cell(tr, t.range); this.cell(tr, t.kwh.toFixed(2));
      this.cell(tr, fmtMXN(t.rate) + '/kWh'); this.cell(tr, fmtMXN(t.cost));
    });
    const line = (label, value, cls) => {
      const tr = tbody.insertRow(); if (cls) tr.className = cls;
      this.cell(tr, label); const c = this.cell(tr, ''); c.colSpan = 3; this.cell(tr, fmtMXN(value));
    };
    line('Cargo fijo', bill.fixed); line('Subtotal', bill.subtotal);
    line(`IVA (${bill.ivaRate}%)`, bill.iva); line('TOTAL A PAGAR', bill.total, 'total-row');
  }

  renderSimulatorOptions() {
    const sel = $('sim-select'); const prev = sel.value; sel.replaceChildren();
    this.store.active().forEach((a) => {
      const o = document.createElement('option'); o.value = a.id; o.textContent = `${a.name} (${a.watts} W)`; sel.appendChild(o);
    });
    if (prev && this.store.get(prev)?.active) sel.value = prev;
  }

  renderSimulator() {
    const box = $('sim-result'); const a = this.store.get($('sim-select').value);
    const w = parseFloat($('sim-watts').value);
    if (!a) { box.textContent = 'Agrega aparatos activos para simular.'; return; }
    if (!(w >= 0)) { box.textContent = 'Ingresa los Watts del equipo nuevo para ver el ahorro.'; return; }
    const r = this.simulator.simulate(a, w, this.store.totalKwh());
    const cls = r.savedMoney >= 0 ? 'saving' : 'loss';
    const word = r.savedMoney >= 0 ? 'Ahorro' : 'Aumento';
    box.replaceChildren();
    const p = (html) => { const d = document.createElement('div'); d.innerHTML = html; box.appendChild(d); };
    p(`Consumo del equipo: <b>${fmtKwh(r.oldKwh)}</b> → <b>${fmtKwh(r.newKwh)}</b> por bimestre.`);
    p(`Recibo total: <b>${fmtMXN(r.before.total)}</b> → <b>${fmtMXN(r.after.total)}</b>.`);
    p(`${word} bimestral: <span class="${cls}">${fmtKwh(Math.abs(r.savedKwh))} · ${fmtMXN(Math.abs(r.savedMoney))}</span>`);
    p(`${word} anual (×${BIMESTERS_PER_YEAR} bimestres): <span class="${cls}">${fmtKwh(Math.abs(r.annualKwh))} · ${fmtMXN(Math.abs(r.annualMoney))}</span>`);
    if (r.excessCut > 0) p(`<small>${fmtKwh(r.excessCut)} del ahorro se descontaron del escalón Excedente (el más caro).</small>`);
  }

  exportReport() {
    const kwh = this.store.totalKwh();
    const report = {
      generatedAt: new Date().toISOString(),
      tariffs: this.engine.tariffs,
      appliances: this.store.items.map((a) => ({ ...a, kwhBimestral: round2(TariffEngine.applianceKwh(a)) })),
      totalKwhActivos: round2(kwh),
      recibo: this.engine.calculate(kwh)
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'reporte-estimadorcfe.json';
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }
}

document.addEventListener('DOMContentLoaded', () => new App());
