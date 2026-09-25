/**
 * ============================================================================
 * VISTA — vista.js
 * ============================================================================
 * Responsabilidad única: "pintar" lo que el Modelo calcula. Aquí vive todo
 * el canvas (escalado, carretera, vehículos, marcadores) y la actualización
 * de los elementos del DOM (panel de datos, tarjetas de eventos, slider).
 * La Vista NUNCA cambia el estado de la simulación, solo lo muestra.
 * Depende de Modelo (ya cargado antes en el HTML) para las fórmulas.
 * ============================================================================
 */
const Vista = {
  // --- Referencias a elementos del DOM, obtenidas una sola vez -------------
  canvas: document.getElementById("simCanvas"),
  scaleReadout: document.getElementById("scaleReadout"),
  timelineSlider: document.getElementById("timelineSlider"),
  btnStart: document.getElementById("btnStart"),
  btnPause: document.getElementById("btnPause"),
  panel: {
    time: document.getElementById("valTime"),
    posCar: document.getElementById("valPosCar"),
    posTruck: document.getElementById("valPosTruck"),
    velCar: document.getElementById("valVelCar"),
    velTruck: document.getElementById("valVelTruck"),
    gap: document.getElementById("valGap"),
  },

  // --- Estado propio de la vista: escalado metros -> píxeles ---------------
  ctx: null,
  worldMaxX: 0, // metros que caben en el ancho visible del canvas
  pxPerMeter: 1, // factor de conversión metros -> píxeles
  roadY: 0, // coordenada Y del eje de la carretera, en píxeles

  init() {
    this.ctx = this.canvas.getContext("2d");
  },

  /* --------------------------------------------------------------------
   * ESCALADO — convierte metros del mundo físico a píxeles del canvas
   * -------------------------------------------------------------------- */

  /**
   * Recalcula el factor de escala usando como referencia el 2do encuentro
   * (Modelo.DATOS_EXAMEN.encuentros.x2 ≈ 709.8 m), que es la posición más
   * lejana que debe caber en pantalla.
   */
  calcularEscalaMundo() {
    const { MARGIN_LEFT_M, MARGIN_RIGHT_M } = Modelo.CONFIG;
    this.worldMaxX = Modelo.DATOS_EXAMEN.encuentros.x2 + MARGIN_RIGHT_M;
    const worldWidthM = this.worldMaxX + MARGIN_LEFT_M;
    this.pxPerMeter = this.canvas.width / (worldWidthM * window.devicePixelRatio);
  },

  /**
   * Convierte una posición en metros a coordenada X en píxeles.
   */
  metrosAPixeles(xMeters) {
    const dpr = window.devicePixelRatio;
    return (xMeters + Modelo.CONFIG.MARGIN_LEFT_M) * this.pxPerMeter * dpr;
  },

  /**
   * Ajusta el tamaño físico del canvas al tamaño real de su contenedor
   * (con soporte HiDPI/Retina) y recalcula la escala. Se llama al cargar
   * la página y cada vez que la ventana cambia de tamaño.
   */
  redimensionar() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.roadY = this.canvas.height * 0.55;

    this.calcularEscalaMundo();

    if (this.scaleReadout) {
      this.scaleReadout.textContent =
        `Escala: 1 px ≈ ${(1 / this.pxPerMeter).toFixed(2)} m · Rango: 0–${this.worldMaxX.toFixed(0)} m`;
    }
  },

  /* --------------------------------------------------------------------
   * DIBUJO — carretera, vehículos, marcadores de eventos
   * -------------------------------------------------------------------- */

  dibujarCarretera() {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const roadHeight = 70 * dpr;
    ctx.fillStyle = "#11151b";
    ctx.fillRect(0, this.roadY - roadHeight / 2, this.canvas.width, roadHeight);

    ctx.strokeStyle = "#3a4553";
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([14 * dpr, 12 * dpr]);
    ctx.beginPath();
    ctx.moveTo(0, this.roadY);
    ctx.lineTo(this.canvas.width, this.roadY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#5b6b80";
    ctx.font = `${11 * dpr}px monospace`;
    ctx.textAlign = "center";
    for (let m = 0; m <= this.worldMaxX; m += 100) {
      const px = this.metrosAPixeles(m);
      ctx.strokeStyle = "#1e2733";
      ctx.beginPath();
      ctx.moveTo(px, this.roadY - roadHeight / 2 - 6 * dpr);
      ctx.lineTo(px, this.roadY + roadHeight / 2 + 6 * dpr);
      ctx.stroke();
      ctx.fillText(`${m} m`, px, this.roadY + roadHeight / 2 + 22 * dpr);
    }
  },

  /** Silueta del auto. El tamaño en px es fijo (para que se vea), solo la
   * POSICIÓN respeta la escala real calculada arriba. */
  dibujarAuto(xPx, y, color, label) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    const w = 46 * dpr, h = 18 * dpr;

    ctx.save();
    ctx.translate(xPx, y);

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(0, h * 0.55, w * 0.5, 4 * dpr, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 2);
    ctx.lineTo(-w / 2 + 6, -4);
    ctx.lineTo(-w * 0.15, -h);
    ctx.lineTo(w * 0.28, -h);
    ctx.lineTo(w / 2 - 4, -2);
    ctx.lineTo(w / 2, 4);
    ctx.lineTo(w / 2, h * 0.4);
    ctx.lineTo(-w / 2, h * 0.4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(5,7,10,0.85)";
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, -h + 2);
    ctx.lineTo(w * 0.22, -h + 2);
    ctx.lineTo(w * 0.14, -2);
    ctx.lineTo(-w * 0.02, -2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#05070a";
    [-w * 0.28, w * 0.28].forEach((dx) => {
      ctx.beginPath();
      ctx.arc(dx, h * 0.4, 5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * dpr;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.restore();

    ctx.fillStyle = color;
    ctx.font = `600 ${11 * dpr}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(label, xPx, y - h - 8 * dpr);
  },

  /** Silueta del camión (cabina + caja). Mismo criterio: tamaño fijo, posición a escala. */
  dibujarCamion(xPx, y, color, label) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    const boxW = 40 * dpr, boxH = 26 * dpr;
    const cabW = 16 * dpr, cabH = 20 * dpr;

    ctx.save();
    ctx.translate(xPx, y);

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(0, 6 * dpr, (boxW + cabW) * 0.42, 4 * dpr, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.fillRect(-boxW / 2, -boxH, boxW, boxH);
    ctx.fillRect(boxW / 2 - 2, -cabH, cabW, cabH);

    ctx.fillStyle = "rgba(5,7,10,0.85)";
    ctx.fillRect(boxW / 2 + 2, -cabH + 4 * dpr, cabW - 6 * dpr, 8 * dpr);

    ctx.fillStyle = "#05070a";
    [-boxW * 0.32, -boxW * 0.02, boxW / 2 + cabW * 0.5].forEach((dx) => {
      ctx.beginPath();
      ctx.arc(dx, 2 * dpr, 5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();

    ctx.fillStyle = color;
    ctx.font = `600 ${11 * dpr}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(label, xPx, y - boxH - 10 * dpr);
  },

  /** Línea vertical punteada que marca un evento clave (encuentro, etc.) sobre la carretera. */
  dibujarMarcadorEvento(xMeters, color, text) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    const px = this.metrosAPixeles(xMeters);
    const yTop = this.roadY - 90 * dpr;
    const yBottom = this.roadY + 40 * dpr;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(px, yTop);
    ctx.lineTo(px, yBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = color;
    ctx.font = `${10.5 * dpr}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText(text, px, yTop - 6 * dpr);
    ctx.restore();
  },

  /** Llave gráfica (bracket) que señala la separación de 120 m a los t=10s. */
  dibujarCorcheteSeparacion(xCarPx, xTruckPx, label) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    const yy = this.roadY - 55 * dpr;

    ctx.save();
    ctx.strokeStyle = "#ffe45e";
    ctx.fillStyle = "#ffe45e";
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(xTruckPx, yy - 6 * dpr);
    ctx.lineTo(xTruckPx, yy + 6 * dpr);
    ctx.moveTo(xTruckPx, yy);
    ctx.lineTo(xCarPx, yy);
    ctx.lineTo(xCarPx, yy - 6 * dpr);
    ctx.lineTo(xCarPx, yy + 6 * dpr);
    ctx.stroke();

    ctx.font = `600 ${11 * dpr}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText(label, (xTruckPx + xCarPx) / 2, yy - 8 * dpr);
    ctx.restore();
  },

  /* --------------------------------------------------------------------
   * PANEL DE DATOS Y EVENTOS (DOM)
   * -------------------------------------------------------------------- */

  actualizarPanelDatos(t, xCar, xTruck) {
    const p = this.panel;
    if (p.time) p.time.textContent = `${t.toFixed(2)} s`;
    if (p.posCar) p.posCar.textContent = `${xCar.toFixed(2)} m`;
    if (p.posTruck) p.posTruck.textContent = `${xTruck.toFixed(2)} m`;
    if (p.velCar) p.velCar.textContent = `${Modelo.velocidadAuto().toFixed(2)} m/s`;
    if (p.velTruck) p.velTruck.textContent = `${Modelo.velocidadCamion(t).toFixed(2)} m/s`;
    if (p.gap) p.gap.textContent = `${Math.abs(xTruck - xCar).toFixed(2)} m`;
  },

  /** Resalta (clase CSS event--active) la tarjeta del evento cuando t cae dentro de su ventana. */
  actualizarResaltadoEventos(t) {
    const TOLERANCIA = 0.12;
    const { encuentros, velIguales } = Modelo.DATOS_EXAMEN;
    this.marcarEventoActivo("e1", Math.abs(t - encuentros.t1) < TOLERANCIA);
    this.marcarEventoActivo("e2", Math.abs(t - velIguales.t) < TOLERANCIA);
    this.marcarEventoActivo("e3", Math.abs(t - encuentros.t2) < TOLERANCIA);
  },

  marcarEventoActivo(key, activo) {
    const elemento = document.querySelector(`[data-event="${key}"]`);
    if (elemento) elemento.classList.toggle("event--active", activo);
  },

  /** Botones Iniciar/Pausar: habilitado/deshabilitado según si la simulación corre. */
  actualizarBotonesControl(enEjecucion) {
    if (this.btnStart) this.btnStart.disabled = enEjecucion;
    if (this.btnPause) this.btnPause.disabled = !enEjecucion;
  },

  setTextoBotonPausa(texto) {
    if (this.btnPause) this.btnPause.textContent = texto;
  },

  /** Mueve el slider de línea de tiempo para reflejar t, salvo que el usuario
   * lo esté arrastrando en ese momento (para no "pelear" con su gesto). */
  sincronizarSlider(t) {
    if (this.timelineSlider && document.activeElement !== this.timelineSlider) {
      this.timelineSlider.value = t;
    }
  },

  /* --------------------------------------------------------------------
   * RENDER PRINCIPAL — se llama una vez por frame con el tiempo actual
   * -------------------------------------------------------------------- */

  render(t) {
    this.dibujarCarretera();

    const xCar = Modelo.posicionAuto(t);
    const xTruck = Modelo.posicionCamion(t);
    const carPx = this.metrosAPixeles(xCar);
    const truckPx = this.metrosAPixeles(xTruck);
    const { encuentros, velIguales } = Modelo.DATOS_EXAMEN;

    // Marcadores estáticos de los 3 eventos clave del problema
    this.dibujarMarcadorEvento(encuentros.x1, "#ffe45e", "1er encuentro");
    this.dibujarMarcadorEvento(velIguales.xCar, "#8fa3bb", "v iguales (t=10s)");
    this.dibujarMarcadorEvento(encuentros.x2, "#ff5e8f", "2do encuentro");

    // Bracket de separación de 120 m, visible solo cerca de t=10s
    if (Math.abs(t - velIguales.t) < 0.15) {
      this.dibujarCorcheteSeparacion(
        this.metrosAPixeles(velIguales.xCar),
        this.metrosAPixeles(velIguales.xTruck),
        `separación = ${velIguales.gap.toFixed(0)} m`,
      );
    }

    const dpr = window.devicePixelRatio;
    const carColor = getComputedStyle(document.documentElement).getPropertyValue("--car-color").trim() || "#00e5ff";
    const truckColor = getComputedStyle(document.documentElement).getPropertyValue("--truck-color").trim() || "#ff8a3d";

    this.dibujarCamion(truckPx, this.roadY + 6 * dpr, truckColor, "Camión");
    this.dibujarAuto(carPx, this.roadY - 10 * dpr, carColor, "Auto");

    this.actualizarPanelDatos(t, xCar, xTruck);
    this.actualizarResaltadoEventos(t);
    this.sincronizarSlider(t);
  },
};
