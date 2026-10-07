/**
 * ============================================================================
 * VISTA — vista.js
 * ============================================================================
 * Responsabilidad única: "pintar" lo que el Modelo calcula. Aquí vive todo
 * el canvas (escalado, carretera, vehículos, marcadores, gráficas) y la
 * actualización de los elementos del DOM (panel de datos, tarjetas de
 * eventos, slider, tabs de gráficas). La Vista NUNCA cambia el estado de
 * la simulación (eso es del Controlador); solo puede guardar estado propio
 * de presentación, como "qué gráfica está activa" (graficaActiva).
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
  graphTabs: document.getElementById("graphTabs"),
  tituloGrafica: document.getElementById("graphTitulo"),
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
  worldMinX: 0, // metro más a la izquierda que cabe en el canvas (puede ser negativo)
  worldMaxX: 0, // metro más a la derecha que cabe en el canvas
  pxPerMeter: 1, // factor de conversión metros -> píxeles
  roadY: 0, // coordenada Y del eje de la carretera, en píxeles

  // CAMBIO 3: qué gráfica está visible ("x" | "v" | "a"). Es estado de
  // PRESENTACIÓN (qué pestaña se ve), no estado de la simulación, por eso
  // puede vivir en la Vista sin romper la regla "Vista no cambia estado".
  graficaActiva: "x",

  // CAMBIO 1: tamaño base de cada sprite (en "px CSS", sin multiplicar por
  // devicePixelRatio todavía). Único lugar donde se definen estas medidas;
  // tanto el dibujo como el cálculo de la "cola" del vehículo parten de acá,
  // para no duplicar números sueltos en varios sitios.
  DIM_AUTO: { w: 52, h: 18 },
  DIM_CAMION: { boxW: 44, boxH: 26, cabW: 18, cabH: 20 },

  init() {
    this.ctx = this.canvas.getContext("2d");
  },

  /* --------------------------------------------------------------------
   * ESCALADO — convierte metros del mundo físico a píxeles del canvas
   * -------------------------------------------------------------------- */

  /**
   * Recalcula el factor de escala muestreando la posición real de ambos
   * móviles a lo largo de toda la simulación [0, tEnd], para que la
   * carretera siempre los contenga sea cual sea la configuración.
   */
  calcularEscalaMundo() {
    const { MARGIN_LEFT_M, MARGIN_RIGHT_M } = Modelo.params;

    const tEnd = Modelo.DATOS_EXAMEN.tEnd;
    const pasos = 100;
    let minX = Math.min(0, Modelo.params.x0_1, Modelo.params.x0_2);
    let maxX = Math.max(Modelo.params.x0_1, Modelo.params.x0_2);

    for (let i = 0; i <= pasos; i++) {
      const t = (tEnd * i) / pasos;
      const p1 = Modelo.posicionMovil1(t);
      const p2 = Modelo.posicionMovil2(t);
      if (p1 < minX) minX = p1;
      if (p2 < minX) minX = p2;
      if (p1 > maxX) maxX = p1;
      if (p2 > maxX) maxX = p2;
    }

    this.worldMinX = minX - MARGIN_LEFT_M;
    this.worldMaxX = maxX + MARGIN_RIGHT_M;

    const worldWidthM = this.worldMaxX - this.worldMinX;
    this.pxPerMeter =
      this.canvas.width / (worldWidthM * window.devicePixelRatio);
  },

  /**
   * Convierte una posición en metros a coordenada X en píxeles.
   */
  metrosAPixeles(xMeters) {
    const dpr = window.devicePixelRatio;
    return (xMeters - this.worldMinX) * this.pxPerMeter * dpr;
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
      this.scaleReadout.textContent = `Escala: 1 px ≈ ${(1 / this.pxPerMeter).toFixed(2)} m · Rango: ${this.worldMinX.toFixed(0)}–${this.worldMaxX.toFixed(0)} m`;
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

    // Marcas de distancia: recorren el rango real de la escena
    // (worldMinX..worldMaxX, que puede empezar en negativo) con un paso
    // proporcional, igual que en las gráficas.
    const rangoTotal = this.worldMaxX - this.worldMinX;
    const paso = Math.max(1, rangoTotal / 8);
    const inicio = Math.ceil(this.worldMinX / paso) * paso;
    for (let m = inicio; m <= this.worldMaxX; m += paso) {
      const px = this.metrosAPixeles(m);
      ctx.strokeStyle = "#1e2733";
      ctx.beginPath();
      ctx.moveTo(px, this.roadY - roadHeight / 2 - 6 * dpr);
      ctx.lineTo(px, this.roadY + roadHeight / 2 + 6 * dpr);
      ctx.stroke();
      ctx.fillText(`${m.toFixed(0)} m`, px, this.roadY + roadHeight / 2 + 22 * dpr);
    }

    // CAMBIO 2: sistema de referencia cartesiano del observador. Se dibuja
    // ANTES que vehículos/marcadores (que render() pinta después), así
    // nunca los tapa: queda siempre "debajo" visualmente.
    this._dibujarEjesCartesianos(roadHeight);
  },

  /**
   * CAMBIO 2: eje X horizontal (siguiendo la carretera) y eje Y vertical
   * cortando en x=0, ambos con flecha, más el origen rotulado "O (0,0)".
   * Usa metrosAPixeles, así que respeta la escala real y funciona aunque
   * worldMinX sea negativo. Si x=0 queda fuera del rango visible, el eje Y
   * simplemente no se dibuja (no hay nada sensato que mostrar ahí).
   */
  _dibujarEjesCartesianos(roadHeight) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    const colorEje = "#64748b";
    const colorEtiqueta = "#cbd5e1";

    const yEjeX = this.roadY + roadHeight / 2 + 42 * dpr; // línea base, debajo de las marcas de distancia
    const xInicio = 8 * dpr;
    const xFin = this.canvas.width - 8 * dpr;
    const yTopeEjeY = 14 * dpr;

    ctx.save();

    // --- Eje X: horizontal, con flecha apuntando a la derecha ---
    ctx.strokeStyle = colorEje;
    ctx.fillStyle = colorEje;
    ctx.lineWidth = 1.5 * dpr;
    this._dibujarFlecha(xInicio, yEjeX, xFin, yEjeX, dpr);

    ctx.fillStyle = colorEtiqueta;
    ctx.font = `600 ${11 * dpr}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText("x (m)", xFin - 4 * dpr, yEjeX - 8 * dpr);

    // --- Eje Y: vertical, cortando en x=0, solo si el origen es visible ---
    const origenPx = this.metrosAPixeles(0);
    if (origenPx >= 0 && origenPx <= this.canvas.width) {
      ctx.strokeStyle = colorEje;
      ctx.fillStyle = colorEje;
      this._dibujarFlecha(origenPx, yEjeX, origenPx, yTopeEjeY, dpr);

      ctx.fillStyle = colorEtiqueta;
      ctx.textAlign = "left";
      ctx.font = `600 ${11 * dpr}px sans-serif`;
      ctx.fillText("y (m)", origenPx + 6 * dpr, yTopeEjeY + 10 * dpr);

      // Punto y etiqueta del origen del observador
      ctx.beginPath();
      ctx.arc(origenPx, yEjeX, 3 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `600 ${10 * dpr}px monospace`;
      ctx.fillText("O (0,0)", origenPx + 6 * dpr, yEjeX + 14 * dpr);
    }

    ctx.restore();
  },

  /** Dibuja una línea de (x1,y1) a (x2,y2) con una pequeña punta de flecha en el destino. */
  _dibujarFlecha(x1, y1, x2, y2, dpr) {
    const ctx = this.ctx;
    const tam = 6 * dpr;
    const angulo = Math.atan2(y2 - y1, x2 - x1);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - tam * Math.cos(angulo - Math.PI / 6),
      y2 - tam * Math.sin(angulo - Math.PI / 6),
    );
    ctx.lineTo(
      x2 - tam * Math.cos(angulo + Math.PI / 6),
      y2 - tam * Math.sin(angulo + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
  },

  /**
   * CAMBIO 1: silueta del auto. El punto físico (xPx) ahora representa la
   * COLA del vehículo, no el centro. Por eso se traslada a (xPx + medioLargo)
   * en vez de (xPx): así el borde trasero del sprite (x local = -medioLargo)
   * cae exactamente sobre xPx, y el resto del dibujo (simétrico respecto al
   * 0 local, igual que antes) se extiende hacia adelante desde ahí.
   */
  dibujarAuto(xPx, y, color, label) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    const w = this.DIM_AUTO.w * dpr;
    const h = this.DIM_AUTO.h * dpr;
    const medioLargo = w / 2; // única fuente de verdad del offset cola->dibujo

    ctx.save();
    ctx.translate(xPx + medioLargo, y);

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

    // Etiqueta del vehículo (en coordenadas de pantalla, sin el offset de cola)
    ctx.fillStyle = color;
    ctx.font = `600 ${11 * dpr}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(label, xPx + medioLargo, y - h - 8 * dpr);

    // Marca visual pequeña y discreta exactamente sobre el punto de cola,
    // para que el offset del Cambio 1 sea verificable a simple vista.
    ctx.fillStyle = color;
    ctx.fillRect(xPx - 1 * dpr, y + h * 0.5, 2 * dpr, 6 * dpr);
  },

  /** CAMBIO 1: mismo criterio que dibujarAuto — xPx es la COLA del camión
   * (el borde trasero de la caja de carga, el extremo más alejado de la
   * cabina), no el centro. */
  dibujarCamion(xPx, y, color, label) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    const boxW = this.DIM_CAMION.boxW * dpr;
    const boxH = this.DIM_CAMION.boxH * dpr;
    const cabW = this.DIM_CAMION.cabW * dpr;
    const cabH = this.DIM_CAMION.cabH * dpr;
    const medioLargo = boxW / 2; // el borde izquierdo de la caja es la cola

    ctx.save();
    ctx.translate(xPx + medioLargo, y);

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

    // Etiqueta del camión (en coordenadas de pantalla, sin el offset de cola)
    ctx.fillStyle = color;
    ctx.font = `600 ${11 * dpr}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(label, xPx + medioLargo, y - boxH - 10 * dpr);

    // Marca visual pequeña y discreta exactamente sobre el punto de cola
    ctx.fillStyle = color;
    ctx.fillRect(xPx - 1 * dpr, y - boxH * 0.3, 2 * dpr, 6 * dpr);
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

  /** Llave gráfica (bracket) que señala la separación entre las colas de ambos móviles. */
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
   * GRÁFICAS — x-t, v-t, a-t (CAMBIO 3: conmutables por tabs, una visible
   * a la vez). Comparten patrón: ejes, grilla suave, marcas numéricas,
   * etiquetas con unidades, leyenda de colores y curvas hasta tActual.
   * -------------------------------------------------------------------- */

  /** Pequeña leyenda de colores (Auto/Camión) dentro de la esquina superior
   * derecha de una gráfica. Compartida por las 3 gráficas. */
  _dibujarLeyendaGrafica(ctx, w, padRight, padTop, carColor, truckColor, dpr) {
    const x = w - padRight - 86 * dpr;
    let y = padTop + 6 * dpr;
    const filas = [
      { color: carColor, texto: "Auto" },
      { color: truckColor, texto: "Camión" },
    ];
    ctx.save();
    ctx.font = `${9.5 * dpr}px sans-serif`;
    ctx.textAlign = "left";
    filas.forEach((f) => {
      ctx.fillStyle = f.color;
      ctx.fillRect(x, y, 10 * dpr, 10 * dpr);
      ctx.fillStyle = "#cbd5e1";
      ctx.fillText(f.texto, x + 14 * dpr, y + 9 * dpr);
      y += 15 * dpr;
    });
    ctx.restore();
  },

  /** Grilla suave de fondo en las posiciones de las marcas de los ejes,
   * para dar aspecto de "papel cuadriculado" de laboratorio. Se dibuja
   * antes que los ejes y las curvas, así queda siempre detrás. */
  _dibujarGrillaSuave(ctx, padLeft, padTop, padRight, padBottom, w, h, xTicks, yTicks) {
    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
    ctx.lineWidth = 1;
    xTicks.forEach((px) => {
      ctx.beginPath();
      ctx.moveTo(px, padTop);
      ctx.lineTo(px, h - padBottom);
      ctx.stroke();
    });
    yTicks.forEach((py) => {
      ctx.beginPath();
      ctx.moveTo(padLeft, py);
      ctx.lineTo(w - padRight, py);
      ctx.stroke();
    });
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

    // Rango dinámico: el mayor valor realmente alcanzado por cualquiera de
    // los dos móviles en todo el intervalo [0, tEnd], más un 8% de margen.
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

    const toX = (t) => padLeft + (t / tMax) * graphW;
    const toY = (x) => h - padBottom - (x / xMax) * graphH;

    // Marcas (paso dinámico = rango/4, da siempre ~5 marcas)
    const pasoT = tMax / 4;
    const pasoX = xMax / 4;
    const xTicksPx = [];
    const yTicksPx = [];
    for (let tVal = 0; tVal <= tMax + 1e-6; tVal += pasoT) xTicksPx.push(toX(tVal));
    for (let xVal = 0; xVal <= xMax + 1e-6; xVal += pasoX) yTicksPx.push(toY(xVal));

    // --- Grilla suave (aspecto de sistema cartesiano real) ---
    this._dibujarGrillaSuave(ctx, padLeft, padTop, padRight, padBottom, w, h, xTicksPx, yTicksPx);

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
    for (let tVal = 0; tVal <= tMax + 1e-6; tVal += pasoT) {
      const px = toX(tVal);
      ctx.fillRect(px, h - padBottom, 1 * dpr, 4 * dpr);
      ctx.textAlign = "center";
      ctx.fillText(`${tVal.toFixed(1)}s`, px, h - padBottom + 14 * dpr);
    }
    for (let xVal = 0; xVal <= xMax + 1e-6; xVal += pasoX) {
      const py = toY(xVal);
      ctx.fillRect(padLeft - 4 * dpr, py, 4 * dpr, 1 * dpr);
      ctx.textAlign = "right";
      ctx.fillText(`${xVal.toFixed(0)}m`, padLeft - 8 * dpr, py + 3 * dpr);
    }

    // Etiquetas de los ejes
    ctx.fillStyle = "#94a3b8";
    ctx.font = `600 ${10 * dpr}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("t (s)", w - padRight - 10 * dpr, h - 5 * dpr);
    ctx.save();
    ctx.translate(15 * dpr, padTop + graphH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("x (m)", 0, 0);
    ctx.restore();

    const pasos = 100;
    const dt = tActual / pasos;
    const carColor =
      getComputedStyle(document.documentElement).getPropertyValue("--car-color").trim() || "#38bdf8";
    const truckColor =
      getComputedStyle(document.documentElement).getPropertyValue("--truck-color").trim() || "#fb923c";

    // --- Curva del Auto ---
    ctx.strokeStyle = carColor;
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

    // --- Curva del Camión ---
    ctx.strokeStyle = truckColor;
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

    this._dibujarLeyendaGrafica(ctx, w, padRight, padTop, carColor, truckColor, dpr);
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

    // La velocidad es lineal en el tiempo (v = v0 + a·t), así que su valor
    // máximo en [0, tMax] siempre está en uno de los dos extremos.
    const vMax =
      Math.max(
        Math.abs(Modelo.velocidadMovil1(0)),
        Math.abs(Modelo.velocidadMovil1(tMax)),
        Math.abs(Modelo.velocidadMovil2(0)),
        Math.abs(Modelo.velocidadMovil2(tMax)),
        1,
      ) * 1.15;

    const padLeft = 45 * dpr;
    const padBottom = 30 * dpr;
    const padTop = 15 * dpr;
    const padRight = 20 * dpr;

    const graphW = w - padLeft - padRight;
    const graphH = h - padBottom - padTop;

    const toX = (t) => padLeft + (t / tMax) * graphW;
    const toY = (v) => h - padBottom - (v / vMax) * graphH;

    const pasoT = tMax / 4;
    const pasoV = vMax / 4;
    const xTicksPx = [];
    const yTicksPx = [];
    for (let tVal = 0; tVal <= tMax + 1e-6; tVal += pasoT) xTicksPx.push(toX(tVal));
    for (let vVal = 0; vVal <= vMax + 1e-6; vVal += pasoV) yTicksPx.push(toY(vVal));

    this._dibujarGrillaSuave(ctx, padLeft, padTop, padRight, padBottom, w, h, xTicksPx, yTicksPx);

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
    for (let tVal = 0; tVal <= tMax + 1e-6; tVal += pasoT) {
      const px = toX(tVal);
      ctx.fillRect(px, h - padBottom, 1 * dpr, 4 * dpr);
      ctx.textAlign = "center";
      ctx.fillText(`${tVal.toFixed(1)}s`, px, h - padBottom + 14 * dpr);
    }
    for (let vVal = 0; vVal <= vMax + 1e-6; vVal += pasoV) {
      const py = toY(vVal);
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

    const pasos = 100;
    const dt = tActual / pasos;
    const carColor =
      getComputedStyle(document.documentElement).getPropertyValue("--car-color").trim() || "#38bdf8";
    const truckColor =
      getComputedStyle(document.documentElement).getPropertyValue("--truck-color").trim() || "#fb923c";

    // --- Velocidad del Móvil 1 / Auto (constante si es MRU, lineal si es MRUV) ---
    ctx.strokeStyle = carColor;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    for (let i = 0; i <= pasos; i++) {
      const t = i * dt;
      const v = Modelo.velocidadAuto(t);
      const px = toX(t);
      const py = toY(v);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // --- Velocidad Camión ---
    ctx.strokeStyle = truckColor;
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

    this._dibujarLeyendaGrafica(ctx, w, padRight, padTop, carColor, truckColor, dpr);
  },

  /** CAMBIO 3 (nueva): gráfica de Aceleración (a vs t). La aceleración es
   * constante en el tiempo (0 en MRU, el valor "a" fijo en MRUV), así que
   * se dibuja como una recta horizontal por móvil. El eje Y es simétrico
   * alrededor de 0 para poder representar también aceleraciones negativas. */
  dibujarGraficaAceleracion(tActual) {
    const canvas = document.getElementById("canvasGraphA");
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
    const { a_1, a_2 } = Modelo.params;

    // Rango simétrico: no hace falta muestrear porque a(t) es constante.
    const aMax = Math.max(Math.abs(a_1), Math.abs(a_2), 1) * 1.3;

    const padLeft = 45 * dpr;
    const padBottom = 30 * dpr;
    const padTop = 15 * dpr;
    const padRight = 20 * dpr;

    const graphW = w - padLeft - padRight;
    const graphH = h - padBottom - padTop;

    const toX = (t) => padLeft + (t / tMax) * graphW;
    // El 0 va al centro vertical, para poder mostrar valores negativos.
    const toY = (a) => padTop + graphH / 2 - (a / aMax) * (graphH / 2);

    const pasoT = tMax / 4;
    const pasoA = aMax / 2; // -aMax, -aMax/2, 0, +aMax/2, +aMax
    const xTicksPx = [];
    const yTicksPx = [];
    for (let tVal = 0; tVal <= tMax + 1e-6; tVal += pasoT) xTicksPx.push(toX(tVal));
    for (let aVal = -aMax; aVal <= aMax + 1e-6; aVal += pasoA) yTicksPx.push(toY(aVal));

    this._dibujarGrillaSuave(ctx, padLeft, padTop, padRight, padBottom, w, h, xTicksPx, yTicksPx);

    // --- Ejes coordenados (marco) ---
    ctx.strokeStyle = "#2d3748";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, h - padBottom);
    ctx.lineTo(w - padRight, h - padBottom);
    ctx.stroke();

    // Línea de referencia a=0, marcando el origen horizontal del gráfico
    ctx.strokeStyle = "#3a4553";
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.beginPath();
    ctx.moveTo(padLeft, toY(0));
    ctx.lineTo(w - padRight, toY(0));
    ctx.stroke();
    ctx.setLineDash([]);

    // --- Marcas y números en los ejes ---
    ctx.fillStyle = "#64748b";
    ctx.font = `${9 * dpr}px sans-serif`;
    for (let tVal = 0; tVal <= tMax + 1e-6; tVal += pasoT) {
      const px = toX(tVal);
      ctx.fillRect(px, h - padBottom, 1 * dpr, 4 * dpr);
      ctx.textAlign = "center";
      ctx.fillText(`${tVal.toFixed(1)}s`, px, h - padBottom + 14 * dpr);
    }
    for (let aVal = -aMax; aVal <= aMax + 1e-6; aVal += pasoA) {
      const py = toY(aVal);
      ctx.fillRect(padLeft - 4 * dpr, py, 4 * dpr, 1 * dpr);
      ctx.textAlign = "right";
      ctx.fillText(`${aVal.toFixed(1)}`, padLeft - 8 * dpr, py + 3 * dpr);
    }

    // Etiquetas de los ejes
    ctx.fillStyle = "#94a3b8";
    ctx.font = `600 ${10 * dpr}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("t (s)", w - padRight - 10 * dpr, h - 5 * dpr);
    ctx.save();
    ctx.translate(15 * dpr, padTop + graphH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("a (m/s²)", 0, 0);
    ctx.restore();

    const carColor =
      getComputedStyle(document.documentElement).getPropertyValue("--car-color").trim() || "#38bdf8";
    const truckColor =
      getComputedStyle(document.documentElement).getPropertyValue("--truck-color").trim() || "#fb923c";

    // --- Aceleración del Auto: recta horizontal en a_1, hasta tActual ---
    ctx.strokeStyle = carColor;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(a_1));
    ctx.lineTo(toX(tActual), toY(a_1));
    ctx.stroke();

    // --- Aceleración del Camión: recta horizontal en a_2, hasta tActual ---
    ctx.strokeStyle = truckColor;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(a_2));
    ctx.lineTo(toX(tActual), toY(a_2));
    ctx.stroke();

    this._dibujarLeyendaGrafica(ctx, w, padRight, padTop, carColor, truckColor, dpr);
  },

  /** CAMBIO 3: dispatcher — dibuja SOLO la gráfica cuya pestaña está activa,
   * siempre con el "t" actual de la simulación. */
  dibujarGraficaActiva(t) {
    if (this.graficaActiva === "v") this.dibujarGraficaVelocidad(t);
    else if (this.graficaActiva === "a") this.dibujarGraficaAceleracion(t);
    else this.dibujarGraficaPosicion(t);
  },

  /** CAMBIO 3: cambia qué gráfica está visible (clases CSS + título +
   * estado del tab). NO repinta por sí sola: el Controlador, tras llamar
   * a esto, debe llamar a Vista.render(t) para que la gráfica recién
   * mostrada aparezca con el tiempo actual. */
  cambiarGraficaActiva(id) {
    if (!["x", "v", "a"].includes(id)) return;
    this.graficaActiva = id;

    const titulos = {
      x: "Posición vs Tiempo (x - t)",
      v: "Velocidad vs Tiempo (v - t)",
      a: "Aceleración vs Tiempo (a - t)",
    };
    if (this.tituloGrafica) this.tituloGrafica.textContent = titulos[id];

    ["x", "v", "a"].forEach((clave) => {
      const canvas = document.getElementById(`canvasGraph${clave.toUpperCase()}`);
      if (canvas) canvas.classList.toggle("is-hidden", clave !== id);
    });

    if (this.graphTabs) {
      this.graphTabs.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.graph === id);
      });
    }
  },

  /* --------------------------------------------------------------------
   * PANEL DE DATOS Y EVENTOS (DOM)
   * -------------------------------------------------------------------- */

  actualizarPanelDatos(t, xCar, xTruck) {
    const p = this.panel;
    if (p.time) p.time.textContent = `${t.toFixed(2)} s`;
    if (p.posCar) p.posCar.textContent = `${xCar.toFixed(2)} m`;
    if (p.posTruck) p.posTruck.textContent = `${xTruck.toFixed(2)} m`;
    if (p.velCar) p.velCar.textContent = `${Modelo.velocidadAuto(t).toFixed(2)} m/s`;
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
   * Información que depende de la configuración pero NO cambia cuadro a
   * cuadro (la leyenda superior y las tarjetas de "Eventos clave"). Se
   * llama solo al iniciar y cada vez que Controlador aplica una nueva
   * configuración (no en cada frame de animación).
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
    // CORREGIDO: el "(t=10s)" estaba hardcodeado; ahora usa el t real calculado.
    this.dibujarMarcadorEvento(
      velIguales.xCar,
      "#8fa3bb",
      `v iguales (t=${velIguales.t.toFixed(1)}s)`,
    );
    this.dibujarMarcadorEvento(encuentros.x2, "#ff5e8f", "2do encuentro");

    // Bracket de separación entre colas, visible solo cerca del instante de v iguales
    if (Math.abs(t - velIguales.t) < 0.15) {
      this.dibujarCorcheteSeparacion(
        this.metrosAPixeles(velIguales.xCar),
        this.metrosAPixeles(velIguales.xTruck),
        `separación = ${velIguales.gap.toFixed(0)} m`,
      );
    }

    const dpr = window.devicePixelRatio;
    const carColor =
      getComputedStyle(document.documentElement).getPropertyValue("--car-color").trim() || "#00e5ff";
    const truckColor =
      getComputedStyle(document.documentElement).getPropertyValue("--truck-color").trim() || "#ff8a3d";

    this.dibujarCamion(truckPx, this.roadY + 6 * dpr, truckColor, "Camión");
    this.dibujarAuto(carPx, this.roadY - 10 * dpr, carColor, "Auto");

    this.actualizarPanelDatos(t, xCar, xTruck);
    this.actualizarResaltadoEventos(t);
    this.sincronizarSlider(t);

    // CAMBIO 3: solo se dibuja la gráfica de la pestaña activa.
    this.dibujarGraficaActiva(t);
  },
};
