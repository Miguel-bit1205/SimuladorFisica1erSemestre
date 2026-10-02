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
  legendCar: document.getElementById("legendCar"),
  legendTruck: document.getElementById("legendTruck"),
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
    // CORREGIDO: el modelo ahora guarda los márgenes en "Modelo.params"
    // (antes se llamaba "Modelo.CONFIG", que ya no existe y rompía el cálculo).
    const { MARGIN_LEFT_M, MARGIN_RIGHT_M } = Modelo.params;
    this.worldMaxX = Modelo.DATOS_EXAMEN.encuentros.x2 + MARGIN_RIGHT_M;
    const worldWidthM = this.worldMaxX + MARGIN_LEFT_M;
    this.pxPerMeter =
      this.canvas.width / (worldWidthM * window.devicePixelRatio);
  },

  /**
   * Convierte una posición en metros a coordenada X en píxeles.
   */
  metrosAPixeles(xMeters) {
    const dpr = window.devicePixelRatio;
    // CORREGIDO: Modelo.CONFIG -> Modelo.params (ver nota en calcularEscalaMundo).
    return (xMeters + Modelo.params.MARGIN_LEFT_M) * this.pxPerMeter * dpr;
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
      this.scaleReadout.textContent = `Escala: 1 px ≈ ${(1 / this.pxPerMeter).toFixed(2)} m · Rango: 0–${this.worldMaxX.toFixed(0)} m`;
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
  /** Silueta mejorada y más estilizada del automóvil (MRU). */
  /** Silueta con efecto 3D estilizado del automóvil (MRU). */
  dibujarAuto(xPx, y, color, label) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    const w = 52 * dpr,
      h = 18 * dpr;

    ctx.save();
    ctx.translate(xPx, y);

    // Sombra ovalada en el suelo para dar profundidad
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(0, h * 0.65, w * 0.48, 4 * dpr, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cuerpo inferior del auto (base)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 4);
    ctx.lineTo(-w / 2 + 8, -2);
    ctx.lineTo(w / 2 - 8, -2);
    ctx.lineTo(w / 2, 4);
    ctx.closePath();
    ctx.fill();

    // Cabina superior (efecto 3D con pendiente)
    const gradient = ctx.createLinearGradient(0, -h, 0, 0);
    gradient.addColorStop(0, "#ffffff33"); // Brillo superior de luz
    gradient.addColorStop(1, color);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-w * 0.22, 0);
    ctx.lineTo(-w * 0.12, -h * 0.85);
    ctx.lineTo(w * 0.15, -h * 0.85);
    ctx.lineTo(w * 0.28, 0);
    ctx.closePath();
    ctx.fill();

    // Parabrisas y ventanillas (efecto cristal oscuro)
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, -h * 0.75);
    ctx.lineTo(w * 0.08, -h * 0.75);
    ctx.lineTo(w * 0.12, -3);
    ctx.lineTo(-w * 0.04, -3);
    ctx.closePath();
    ctx.fill();

    // Ruedas circulares con relieve
    [-w * 0.28, w * 0.28].forEach((dx) => {
      ctx.fillStyle = "#020617";
      ctx.beginPath();
      ctx.arc(dx, h * 0.4, 5.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
      // Aro interior de la rueda
      ctx.fillStyle = "#64748b";
      ctx.beginPath();
      ctx.arc(dx, h * 0.4, 2.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    });

    // Resplandor elegante (Glow)
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * dpr;
    ctx.strokeStyle = "#ffffff55";
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.restore();

    // Etiqueta del vehículo
    ctx.fillStyle = color;
    ctx.font = `600 ${11 * dpr}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(label, xPx, y - h - 8 * dpr);
  },

  /** Silueta con efecto 3D y volumen del camión (MRUV). */
  dibujarCamion(xPx, y, color, label) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    const boxW = 44 * dpr,
      boxH = 26 * dpr;
    const cabW = 18 * dpr,
      cabH = 20 * dpr;

    ctx.save();
    ctx.translate(xPx, y);

    // Sombra inferior en el suelo
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(0, 6 * dpr, (boxW + cabW) * 0.42, 4 * dpr, 0, 0, Math.PI * 2);
    ctx.fill();

    // Caja de carga con volumen lateral
    ctx.fillStyle = color;
    ctx.fillRect(-boxW / 2, -boxH, boxW, boxH);

    // Detalle de sombra lateral en la caja para efecto 3D
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(-boxW / 2, -boxH * 0.3, boxW, boxH * 0.3);

    // Cabina frontal del camión
    ctx.fillStyle = "#cbd5e1"; // Cabina metálica clara para contrastar
    ctx.fillRect(boxW / 2 - 2, -cabH, cabW, cabH);

    // Parabrisas de la cabina
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(boxW / 2 + 2, -cabH + 4 * dpr, cabW - 6 * dpr, 8 * dpr);

    // Ruedas múltiples del camión con relieve
    [-boxW * 0.32, -boxW * 0.02, boxW / 2 + cabW * 0.45].forEach((dx) => {
      ctx.fillStyle = "#020617";
      ctx.beginPath();
      ctx.arc(dx, 3 * dpr, 5 * dpr, 0, Math.PI * 2);
      ctx.fill();
      // Centro de la rueda
      ctx.fillStyle = "#64748b";
      ctx.beginPath();
      ctx.arc(dx, 3 * dpr, 2 * dpr, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();

    // Etiqueta del camión
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

  /** Dibuja la gráfica de Posición (x vs t) en tiempo real con ejes, etiquetas y marcas numéricas */
  dibujarGraficaPosicion(tActual) {
    const canvas = document.getElementById("canvasGraphX");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const w = canvas.width;
    const h = canvas.height;
    const tMax = Modelo.DATOS_EXAMEN.tEnd;

    // CORREGIDO: antes el eje x llegaba hasta "encuentros.x2 + 50", un valor
    // pensado solo para el problema de ejemplo. Con parámetros propios del
    // usuario (por ejemplo, un móvil mucho más rápido) la curva se salía del
    // cuadro. Ahora se toma el mayor valor realmente alcanzado por cualquiera
    // de los dos móviles en todo el intervalo [0, tEnd], más un 8% de margen.
    const xMax =
      Math.max(
        Modelo.DATOS_EXAMEN.encuentros.x2,
        Modelo.posicionMovil1(tMax),
        Modelo.posicionMovil2(tMax),
        Modelo.params.x0_1,
        Modelo.params.x0_2,
        1, // evita xMax = 0 si todo quedara en el origen
      ) * 1.08;

    // Márgenes para dejar espacio a los números de los ejes
    const padLeft = 50 * dpr;
    const padBottom = 30 * dpr;
    const padTop = 15 * dpr;
    const padRight = 20 * dpr;

    const graphW = w - padLeft - padRight;
    const graphH = h - padBottom - padTop;

    // --- Ejes coordenados ---
    ctx.strokeStyle = "#2d3748";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    // Eje Y (Posición x)
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, h - padBottom);
    // Eje X (Tiempo t)
    ctx.lineTo(w - padRight, h - padBottom);
    ctx.stroke();

    // --- Marcas y números en los ejes ---
    ctx.fillStyle = "#64748b";
    ctx.font = `${9 * dpr}px sans-serif`;

    // Marcas en Eje X (Tiempo): antes el paso era fijo (5s); ahora se
    // calcula como tMax/4 para dar siempre ~5 marcas, sea cual sea tMax.
    const pasoT = tMax / 4;
    for (let tVal = 0; tVal <= tMax + 1e-6; tVal += pasoT) {
      const px = padLeft + (tVal / tMax) * graphW;
      ctx.fillRect(px, h - padBottom, 1 * dpr, 4 * dpr);
      ctx.textAlign = "center";
      ctx.fillText(`${tVal.toFixed(1)}s`, px, h - padBottom + 14 * dpr);
    }

    // Marcas en Eje Y (Posición): paso dinámico = xMax/4, en vez del
    // incremento fijo de 200 m (que no tenía sentido con otros parámetros).
    const pasoX = xMax / 4;
    for (let xVal = 0; xVal <= xMax + 1e-6; xVal += pasoX) {
      const py = h - padBottom - (xVal / xMax) * graphH;
      ctx.fillRect(padLeft - 4 * dpr, py, 4 * dpr, 1 * dpr);
      ctx.textAlign = "right";
      ctx.fillText(`${xVal.toFixed(0)}m`, padLeft - 8 * dpr, py + 3 * dpr);
    }

    // Etiquetas de los ejes
    ctx.fillStyle = "#94a3b8";
    ctx.font = `600 ${10 * dpr}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("t (s)", w - padRight - 10 * dpr, h - 5 * dpr); // Eje X
    ctx.save();
    ctx.translate(15 * dpr, padTop + graphH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("x (m)", 0, 0); // Eje Y
    ctx.restore();

    // Funciones de conversión a coordenadas del canvas
    const toX = (t) => padLeft + (t / tMax) * graphW;
    const toY = (x) => h - padBottom - (x / xMax) * graphH;

    const pasos = 100;
    const dt = tActual / pasos;

    // --- Curva del Auto (MRU) ---
    ctx.strokeStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--car-color")
        .trim() || "#38bdf8";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    for (let i = 0; i <= pasos; i++) {
      const t = i * dt;
      const x = Modelo.posicionAuto(t);
      const px = toX(t);
      const py = toY(x);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // --- Curva del Camión (MRUV) ---
    ctx.strokeStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--truck-color")
        .trim() || "#fb923c";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    for (let i = 0; i <= pasos; i++) {
      const t = i * dt;
      const x = Modelo.posicionCamion(t);
      const px = toX(t);
      const py = toY(x);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  },

  /** Dibuja la gráfica de Velocidad (v vs t) en tiempo real con ejes, etiquetas y marcas numéricas */
  dibujarGraficaVelocidad(tActual) {
    const canvas = document.getElementById("canvasGraphV");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const w = canvas.width;
    const h = canvas.height;
    const tMax = Modelo.DATOS_EXAMEN.tEnd;

    // CORREGIDO: antes vMax estaba fijo en 80 m/s. Con otras velocidades
    // ingresadas por el usuario la curva se salía del cuadro (o se veía muy
    // chica si eran menores). Como la velocidad es lineal en el tiempo
    // (v = v0 + a·t), su valor máximo en [0, tMax] siempre está en uno de
    // los dos extremos, así que basta comparar t=0 y t=tMax.
    const vMax =
      Math.max(
        Math.abs(Modelo.velocidadMovil1(0)),
        Math.abs(Modelo.velocidadMovil1(tMax)),
        Math.abs(Modelo.velocidadMovil2(0)),
        Math.abs(Modelo.velocidadMovil2(tMax)),
        1, // evita vMax = 0 si ambos móviles estuvieran detenidos
      ) * 1.15;

    const padLeft = 45 * dpr;
    const padBottom = 30 * dpr;
    const padTop = 15 * dpr;
    const padRight = 20 * dpr;

    const graphW = w - padLeft - padRight;
    const graphH = h - padBottom - padTop;

    // --- Ejes coordenados ---
    ctx.strokeStyle = "#2d3748";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, h - padBottom);
    ctx.lineTo(w - padRight, h - padBottom);
    ctx.stroke();

    // --- Marcas y números en los ejes ---
    ctx.fillStyle = "#64748b";
    ctx.font = `${9 * dpr}px sans-serif`;

    // Marcas en Eje X (Tiempo): paso dinámico = tMax/4 (antes era fijo en 5s).
    const pasoT = tMax / 4;
    for (let tVal = 0; tVal <= tMax + 1e-6; tVal += pasoT) {
      const px = padLeft + (tVal / tMax) * graphW;
      ctx.fillRect(px, h - padBottom, 1 * dpr, 4 * dpr);
      ctx.textAlign = "center";
      ctx.fillText(`${tVal.toFixed(1)}s`, px, h - padBottom + 14 * dpr);
    }

    // Marcas en Eje Y (Velocidad): paso dinámico = vMax/4 (antes era fijo en 20 m/s).
    const pasoV = vMax / 4;
    for (let vVal = 0; vVal <= vMax + 1e-6; vVal += pasoV) {
      const py = h - padBottom - (vVal / vMax) * graphH;
      ctx.fillRect(padLeft - 4 * dpr, py, 4 * dpr, 1 * dpr);
      ctx.textAlign = "right";
      ctx.fillText(`${vVal.toFixed(0)}`, padLeft - 8 * dpr, py + 3 * dpr);
    }

    // Etiquetas de los ejes
    ctx.fillStyle = "#94a3b8";
    ctx.font = `600 ${10 * dpr}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("t (s)", w - padRight - 10 * dpr, h - 5 * dpr);
    ctx.save();
    ctx.translate(15 * dpr, padTop + graphH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("v (m/s)", 0, 0);
    ctx.restore();

    const toX = (t) => padLeft + (t / tMax) * graphW;
    const toY = (v) => h - padBottom - (v / vMax) * graphH;

    const pasos = 100;
    const dt = tActual / pasos;

    // --- Velocidad del Móvil 1 / Auto (constante si es MRU, lineal si es MRUV) ---
    ctx.strokeStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--car-color")
        .trim() || "#38bdf8";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    for (let i = 0; i <= pasos; i++) {
      const t = i * dt;
      // CORREGIDO: faltaba pasar "t" (antes siempre graficaba la velocidad en t=0).
      const v = Modelo.velocidadAuto(t);
      const px = toX(t);
      const py = toY(v);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // --- Velocidad Camión (Lineal) ---
    ctx.strokeStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--truck-color")
        .trim() || "#fb923c";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    for (let i = 0; i <= pasos; i++) {
      const t = i * dt;
      const v = Modelo.velocidadCamion(t);
      const px = toX(t);
      const py = toY(v);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  },
  /* --------------------------------------------------------------------
   * PANEL DE DATOS Y EVENTOS (DOM)
   * -------------------------------------------------------------------- */

  actualizarPanelDatos(t, xCar, xTruck) {
    const p = this.panel;
    if (p.time) p.time.textContent = `${t.toFixed(2)} s`;
    if (p.posCar) p.posCar.textContent = `${xCar.toFixed(2)} m`;
    if (p.posTruck) p.posTruck.textContent = `${xTruck.toFixed(2)} m`;
    if (p.velCar)
      // CORREGIDO: faltaba pasar "t". Sin él, si el Móvil 1 se configura como
      // MRUV, siempre mostraba la velocidad inicial (t=0) y nunca cambiaba.
      p.velCar.textContent = `${Modelo.velocidadAuto(t).toFixed(2)} m/s`;
    if (p.velTruck)
      p.velTruck.textContent = `${Modelo.velocidadCamion(t).toFixed(2)} m/s`;
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
   * NUEVO: información que depende de la configuración pero NO cambia
   * cuadro a cuadro (la leyenda superior y las tarjetas de "Eventos
   * clave"). Antes quedaban con el texto fijo del problema de ejemplo
   * (t≈2,25s, 90,2m, etc.) incluso después de que el usuario aplicara
   * otra configuración distinta. Por eso NO se llaman desde render()
   * (que corre 60 veces por segundo), sino una sola vez: al iniciar la
   * app y cada vez que Controlador aplica una nueva configuración.
   * -------------------------------------------------------------------- */

  actualizarInfoEstatica() {
    this._actualizarLeyenda();
    this._actualizarTarjetasEventos();
  },

  /** Reescribe los textos "■ Automóvil (...)" / "■ Camión (...)" de la
   * cabecera con los parámetros realmente vigentes en el Modelo. */
  _actualizarLeyenda() {
    const p = Modelo.params;

    if (this.legendCar) {
      this.legendCar.textContent =
        p.tipoMovil1 === "mru"
          ? `■ Automóvil (Móvil 1): v₀ = ${p.v0_1} m/s — MRU`
          : `■ Automóvil (Móvil 1): v₀ = ${p.v0_1} m/s, a = ${p.a_1} m/s² — MRUV`;
    }
    if (this.legendTruck) {
      this.legendTruck.textContent =
        p.tipoMovil2 === "mru"
          ? `■ Camión (Móvil 2): v₀ = ${p.v0_2} m/s — MRU`
          : `■ Camión (Móvil 2): v₀ = ${p.v0_2} m/s, a = ${p.a_2} m/s² — MRUV`;
    }
  },

  /** Recalcula el texto y el atributo data-time de cada tarjeta de la
   * lista "Eventos clave" a partir de Modelo.DATOS_EXAMEN actual, para
   * que el clic sobre la tarjeta salte siempre al instante correcto. */
  _actualizarTarjetasEventos() {
    const { encuentros, velIguales } = Modelo.DATOS_EXAMEN;

    this._setTarjetaEvento(
      "e1",
      encuentros.t1,
      `t ≈ ${encuentros.t1.toFixed(2)} s · x ≈ ${encuentros.x1.toFixed(1)} m`,
    );
    this._setTarjetaEvento(
      "e2",
      velIguales.t,
      `t ≈ ${velIguales.t.toFixed(2)} s · separación = ${velIguales.gap.toFixed(0)} m`,
    );
    this._setTarjetaEvento(
      "e3",
      encuentros.t2,
      `t ≈ ${encuentros.t2.toFixed(2)} s · x ≈ ${encuentros.x2.toFixed(1)} m`,
    );
  },

  _setTarjetaEvento(key, tiempo, textoDescripcion) {
    const li = document.querySelector(`[data-event="${key}"]`);
    if (!li) return;
    li.setAttribute("data-time", tiempo); // usado por Controlador al hacer clic
    const parrafo = li.querySelector("p");
    if (parrafo) parrafo.textContent = textoDescripcion;
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
    const carColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--car-color")
        .trim() || "#00e5ff";
    const truckColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--truck-color")
        .trim() || "#ff8a3d";

    this.dibujarCamion(truckPx, this.roadY + 6 * dpr, truckColor, "Camión");
    this.dibujarAuto(carPx, this.roadY - 10 * dpr, carColor, "Auto");

    this.actualizarPanelDatos(t, xCar, xTruck);
    this.actualizarResaltadoEventos(t);
    this.sincronizarSlider(t);

    this.dibujarGraficaPosicion(t);
    this.dibujarGraficaVelocidad(t);
  },
};
