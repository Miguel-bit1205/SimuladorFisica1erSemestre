/**
 * ============================================================================
 * VISTA — vista.js
 * ============================================================================
 * Pinta lo que el Modelo calcula: canvas (escala, carretera, vehículos,
 * marcadores) y DOM (panel, eventos, slider, tabs de gráficas). La Vista
 * NUNCA cambia el estado de la simulación; solo guarda estado propio de
 * presentación (ej. qué gráfica está activa). Depende de Modelo.
 * ============================================================================
 */
const Vista = {
  // --- Referencias al DOM -----------------------------------------------
  canvas: document.getElementById("simCanvas"),
  scaleReadout: document.getElementById("scaleReadout"),
  timelineSlider: document.getElementById("timelineSlider"),
  btnStart: document.getElementById("btnStart"),
  btnPause: document.getElementById("btnPause"),
  btnAplicarConfig: document.getElementById("btnAplicarConfig"),
  configBadge: document.getElementById("configBadge"),
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

  // --- Estado propio de la vista ----------------------------------------
  ctx: null,
  worldMinX: 0,
  worldMaxX: 0,
  pxPerMeter: 1,
  roadY: 0,
  graficaActiva: "x", // "x" | "v" | "a"
  _colores: null, // cache de --car-color / --truck-color
  _timerFlash: null,
  _timerBadge: null,

  // Medidas base de los sprites (px CSS, sin dpr). Única fuente de verdad
  // del tamaño: tanto el dibujo como el offset "cola" parten de acá.
  DIM_AUTO: { w: 52, h: 18 },
  DIM_CAMION: { boxW: 44, boxH: 26, cabW: 18, cabH: 20 },

  init() {
    this.ctx = this.canvas.getContext("2d");
  },

  /* --------------------------------------------------------------------
   * ESCALADO
   * -------------------------------------------------------------------- */

  /**
   * Fija el rango visible muestreando [0, tEnd]. La carretera queda fija
   * (no se desplaza durante la reproducción) y contiene siempre ambas
   * trayectorias completas. Se llama al iniciar, al redimensionar y al
   * aplicar nuevos parámetros.
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

    if (this.scaleReadout) {
      this.scaleReadout.textContent = `Escala: 1 px ≈ ${(1 / this.pxPerMeter).toFixed(2)} m · Rango: ${this.worldMinX.toFixed(0)}–${this.worldMaxX.toFixed(0)} m`;
    }
  },

  metrosAPixeles(xMeters) {
    const dpr = window.devicePixelRatio;
    return (xMeters - this.worldMinX) * this.pxPerMeter * dpr;
  },

  /** Ajusta el canvas a su contenedor (HiDPI) y recalcula la escala. */
  redimensionar() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.roadY = this.canvas.height * 0.55;
    this.calcularEscalaMundo();
  },

  /* --------------------------------------------------------------------
   * CARRETERA Y EJES CARTESIANOS
   * -------------------------------------------------------------------- */

  dibujarCarretera() {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const roadHeight = 70 * dpr;
    ctx.fillStyle = "#11151b";
    ctx.fillRect(0, this.roadY - roadHeight / 2, this.canvas.width, roadHeight);

    // Línea central discontinua
    ctx.strokeStyle = "#3a4553";
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([14 * dpr, 12 * dpr]);
    ctx.beginPath();
    ctx.moveTo(0, this.roadY);
    ctx.lineTo(this.canvas.width, this.roadY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Marcas de distancia sobre el rango real (worldMinX..worldMaxX)
    ctx.fillStyle = "#5b6b80";
    ctx.font = `${11 * dpr}px monospace`;
    ctx.textAlign = "center";
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
      ctx.fillText(
        `${m.toFixed(0)} m`,
        px,
        this.roadY + roadHeight / 2 + 22 * dpr,
      );
    }

    this._dibujarEjesCartesianos(roadHeight);
  },

  /**
   * Sistema de referencia del observador: eje X horizontal y eje Y vertical
   * cortando en x=0, ambos con flecha, origen rotulado "O (0,0)". Si x=0
   * queda fuera del rango visible, el eje Y no se dibuja.
   */
  _dibujarEjesCartesianos(roadHeight) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    const colorEje = "#64748b";
    const colorEtiqueta = "#cbd5e1";

    const yEjeX = this.roadY + roadHeight / 2 + 42 * dpr;
    const xInicio = 8 * dpr;
    const xFin = this.canvas.width - 8 * dpr;
    const yTopeEjeY = 14 * dpr;

    ctx.save();

    // Eje X
    ctx.strokeStyle = colorEje;
    ctx.fillStyle = colorEje;
    ctx.lineWidth = 1.5 * dpr;
    this._dibujarFlecha(xInicio, yEjeX, xFin, yEjeX, dpr);

    ctx.fillStyle = colorEtiqueta;
    ctx.font = `600 ${11 * dpr}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText("x (m)", xFin - 4 * dpr, yEjeX - 8 * dpr);

    // Eje Y (solo si x=0 es visible)
    const origenPx = this.metrosAPixeles(0);
    if (origenPx >= 0 && origenPx <= this.canvas.width) {
      ctx.strokeStyle = colorEje;
      ctx.fillStyle = colorEje;
      this._dibujarFlecha(origenPx, yEjeX, origenPx, yTopeEjeY, dpr);

      ctx.fillStyle = colorEtiqueta;
      ctx.textAlign = "left";
      ctx.font = `600 ${11 * dpr}px sans-serif`;
      ctx.fillText("y (m)", origenPx + 6 * dpr, yTopeEjeY + 10 * dpr);

      ctx.beginPath();
      ctx.arc(origenPx, yEjeX, 3 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `600 ${10 * dpr}px monospace`;
      ctx.fillText("O (0,0)", origenPx + 6 * dpr, yEjeX + 14 * dpr);
    }

    ctx.restore();
  },

  /** Línea de (x1,y1) a (x2,y2) con punta de flecha en el destino. */
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

  /* --------------------------------------------------------------------
   * VEHÍCULOS
   * -------------------------------------------------------------------- */

  /**
   * Auto. xPx es la COLA, no el centro: se traslada a (xPx + medioLargo)
   * para que el borde trasero del sprite caiga sobre xPx. Formas planas:
   * cabina trapezoidal + cuerpo rectangular + 2 ruedas.
   */
  dibujarAuto(xPx, y, color, label) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    const w = this.DIM_AUTO.w * dpr;
    const h = this.DIM_AUTO.h * dpr;
    const medioLargo = w / 2;

    ctx.save();
    ctx.translate(xPx + medioLargo, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1 * dpr;
    ctx.lineJoin = "round";

    // Cabina (trapecio)
    ctx.beginPath();
    ctx.moveTo(-w * 0.28, -h * 0.35);
    ctx.lineTo(-w * 0.16, -h * 0.95);
    ctx.lineTo(w * 0.18, -h * 0.95);
    ctx.lineTo(w * 0.3, -h * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cuerpo
    ctx.beginPath();
    ctx.rect(-w / 2, -h * 0.35, w, h * 0.75);
    ctx.fill();
    ctx.stroke();

    // Ruedas
    [-w * 0.28, w * 0.28].forEach((dx) => {
      ctx.fillStyle = "#020617";
      ctx.beginPath();
      ctx.arc(dx, h * 0.4, 5 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#64748b";
      ctx.beginPath();
      ctx.arc(dx, h * 0.4, 2 * dpr, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();

    // Etiqueta y marca de cola
    ctx.fillStyle = color;
    ctx.font = `600 ${11 * dpr}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(label, xPx + medioLargo, y - h - 8 * dpr);
    ctx.fillRect(xPx - 1 * dpr, y + h * 0.5, 2 * dpr, 6 * dpr);
  },

  /** Camión. xPx es la COLA (borde trasero de la caja). Caja + cabina + 3 ruedas. */
  dibujarCamion(xPx, y, color, label) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;
    const boxW = this.DIM_CAMION.boxW * dpr;
    const boxH = this.DIM_CAMION.boxH * dpr;
    const cabW = this.DIM_CAMION.cabW * dpr;
    const cabH = this.DIM_CAMION.cabH * dpr;
    const medioLargo = boxW / 2;

    ctx.save();
    ctx.translate(xPx + medioLargo, y);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1 * dpr;

    // Caja de carga
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.rect(-boxW / 2, -boxH, boxW, boxH);
    ctx.fill();
    ctx.stroke();

    // Cabina
    ctx.fillStyle = "#cbd5e1";
    ctx.beginPath();
    ctx.rect(boxW / 2 - 2 * dpr, -cabH, cabW, cabH);
    ctx.fill();
    ctx.stroke();

    // Ruedas
    [-boxW * 0.32, -boxW * 0.02, boxW / 2 + cabW * 0.45].forEach((dx) => {
      ctx.fillStyle = "#020617";
      ctx.beginPath();
      ctx.arc(dx, 3 * dpr, 5 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#64748b";
      ctx.beginPath();
      ctx.arc(dx, 3 * dpr, 2 * dpr, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();

    ctx.fillStyle = color;
    ctx.font = `600 ${11 * dpr}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(label, xPx + medioLargo, y - boxH - 10 * dpr);
    ctx.fillRect(xPx - 1 * dpr, y - boxH * 0.3, 2 * dpr, 6 * dpr);
  },

  /** Línea vertical punteada sobre la carretera marcando un evento. */
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

  /** Corchete (bracket) que señala la separación entre colas. */
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
   * HELPERS DE GRÁFICAS (compartidos por x-t, v-t, a-t)
   * -------------------------------------------------------------------- */

  /** Colores de los móviles, cacheados desde las variables CSS. */
  _obtenerColores() {
    if (!this._colores) {
      const css = getComputedStyle(document.documentElement);
      this._colores = {
        car: css.getPropertyValue("--car-color").trim() || "#38bdf8",
        truck: css.getPropertyValue("--truck-color").trim() || "#fb923c",
      };
    }
    return this._colores;
  },

  /** Tiempos e etiquetas de los 3 eventos clave, filtrados al rango [0, tEnd]. */
  _getTiemposEventos() {
    const { encuentros, velIguales, tEnd } = Modelo.DATOS_EXAMEN;
    return [
      { t: encuentros.t1, etiqueta: "t₁" },
      { t: velIguales.t, etiqueta: "t_v" },
      { t: encuentros.t2, etiqueta: "t₂" },
    ].filter((e) => e.t >= 0 && e.t <= tEnd);
  },

  /** Mide y limpia el canvas. Reasigna width/height solo si cambiaron
   * (evita reasignar bitmap cada frame; importante para 60 fps). */
  _prepararCanvasGrafica(id) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    const dpr = window.devicePixelRatio;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (w === 0 || h === 0) return null;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    return { ctx, dpr, w, h };
  },

  /** Mínimo y máximo de varias f(t) en [0, tMax], por muestreo. */
  _rangoDeCurvas(fns, tMax, pasos = 60) {
    let min = Infinity;
    let max = -Infinity;
    fns.forEach((fn) => {
      for (let i = 0; i <= pasos; i++) {
        const v = fn((tMax * i) / pasos);
        if (v < min) min = v;
        if (v > max) max = v;
      }
    });
    return { min, max };
  },

  /** Leyenda Auto/Camión en la esquina superior derecha. */
  _dibujarLeyendaGrafica(ctx, w, padRight, padTop, carColor, truckColor, dpr) {
    const x = w - padRight - 86 * dpr;
    let y = padTop + 6 * dpr;
    ctx.save();
    ctx.font = `${9.5 * dpr}px sans-serif`;
    ctx.textAlign = "left";
    [
      { color: carColor, texto: "Auto" },
      { color: truckColor, texto: "Camión" },
    ].forEach((f) => {
      ctx.fillStyle = f.color;
      ctx.fillRect(x, y, 10 * dpr, 10 * dpr);
      ctx.fillStyle = "#cbd5e1";
      ctx.fillText(f.texto, x + 14 * dpr, y + 9 * dpr);
      y += 15 * dpr;
    });
    ctx.restore();
  },

  /** Grilla suave en las posiciones de las marcas. Se dibuja antes que todo. */
  _dibujarGrillaSuave(
    ctx,
    padLeft,
    padTop,
    padRight,
    padBottom,
    w,
    h,
    xTicks,
    yTicks,
  ) {
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

  /** Paso "bonito" (1, 2 o 5 × 10^n) apuntando a ~numTicks marcas. */
  _calcularPasoBonito(rango, numTicksDeseados = 5) {
    if (!isFinite(rango) || rango <= 0) return 1;
    const pasoCrudo = rango / numTicksDeseados;
    const magnitud = Math.pow(10, Math.floor(Math.log10(pasoCrudo)));
    const residuo = pasoCrudo / magnitud;
    let pasoNormalizado;
    if (residuo <= 1) pasoNormalizado = 1;
    else if (residuo <= 2) pasoNormalizado = 2;
    else if (residuo <= 5) pasoNormalizado = 5;
    else pasoNormalizado = 10;
    return pasoNormalizado * magnitud;
  },

  /** Decimales del tick según el paso (≥1 → 0 decimales; 0.5 → 1; 0.05 → 2). */
  _formatoTick(valor, paso) {
    const decimales =
      paso >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(paso) - 1e-9));
    return valor.toFixed(decimales);
  },

  /** Readout horizontal de segmentos [{texto, color}] en la esquina inferior. */
  _dibujarReadoutInstantaneo(ctx, x, y, dpr, segmentos) {
    ctx.save();
    ctx.font = `600 ${10 * dpr}px monospace`;
    ctx.textAlign = "left";
    let cursorX = x;
    segmentos.forEach((seg) => {
      ctx.fillStyle = seg.color;
      ctx.fillText(seg.texto, cursorX, y);
      cursorX += ctx.measureText(seg.texto).width;
    });
    ctx.restore();
  },

  /** Líneas verticales punteadas en los instantes de evento (t1, t_v, t2). */
  _dibujarMarcadoresEventoGrafica(ctx, toX, padTop, h, padBottom, dpr) {
    const colorMarcador = "#facc15";
    ctx.save();
    ctx.strokeStyle = colorMarcador;
    ctx.fillStyle = colorMarcador;
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.font = `600 ${9 * dpr}px monospace`;
    ctx.textAlign = "center";

    this._getTiemposEventos().forEach(({ t, etiqueta }) => {
      const px = toX(t);
      ctx.beginPath();
      ctx.moveTo(px, padTop);
      ctx.lineTo(px, h - padBottom);
      ctx.stroke();
      ctx.fillText(etiqueta, px, padTop + 9 * dpr);
    });

    ctx.setLineDash([]);
    ctx.restore();
  },

  /** Cursor vertical en tActual (sobre las curvas). */
  _dibujarCursorTiempo(ctx, toX, tActual, padTop, h, padBottom, dpr) {
    const px = toX(tActual);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(px, padTop);
    ctx.lineTo(px, h - padBottom);
    ctx.stroke();
    ctx.restore();
  },

  /** Puntos sobre cada curva en tActual, con valor al lado.
   * Si los dos coinciden en altura, el segundo se desplaza ~6 px. */
  _dibujarPuntosActuales(ctx, puntos, dpr) {
    const sep = 6 * dpr;
    const pts = puntos.map((p) => ({ ...p }));
    const solapados = pts.length === 2 && Math.abs(pts[0].y - pts[1].y) < sep;
    if (solapados) pts[1].y += sep;

    ctx.save();
    ctx.font = `600 ${9.5 * dpr}px monospace`;
    pts.forEach((p, i) => {
      ctx.fillStyle = p.color;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const ancho = ctx.measureText(p.label).width;
      const aLaIzquierda = p.x + 8 * dpr + ancho > ctx.canvas.width - 4 * dpr;
      const yTexto = solapados
        ? i === 0
          ? p.y - 2 * dpr
          : p.y + 6 * dpr
        : p.y + 3 * dpr;
      ctx.textAlign = aLaIzquierda ? "right" : "left";
      const xTexto = aLaIzquierda ? p.x - 8 * dpr : p.x + 8 * dpr;
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = "#030712";
      ctx.strokeText(p.label, xTexto, yTexto);
      ctx.fillStyle = p.color;
      ctx.fillText(p.label, xTexto, yTexto);
    });
    ctx.restore();
  },

  /** Curva completa tenue (0..tEnd) + tramo sólido hasta tActual. */
  _dibujarCurvaDoble(ctx, toX, toY, fnFisica, tActual, tEnd, color, dpr) {
    const pasos = 100;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * dpr;

    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    for (let i = 0; i <= pasos; i++) {
      const t = (tEnd * i) / pasos;
      if (i === 0) ctx.moveTo(toX(t), toY(fnFisica(t)));
      else ctx.lineTo(toX(t), toY(fnFisica(t)));
    }
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let i = 0; i <= pasos; i++) {
      const t = (tActual * i) / pasos;
      if (i === 0) ctx.moveTo(toX(t), toY(fnFisica(t)));
      else ctx.lineTo(toX(t), toY(fnFisica(t)));
    }
    ctx.stroke();
    ctx.restore();
  },

  /** Área bajo f(t) entre 0 y tActual (hasta la línea 0). */
  _dibujarAreaSombreada(ctx, toX, toY, fnFisica, tActual, color) {
    if (tActual <= 0) return;
    const pasos = 60;
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(0));
    for (let i = 0; i <= pasos; i++) {
      const t = (tActual * i) / pasos;
      ctx.lineTo(toX(t), toY(fnFisica(t)));
    }
    ctx.lineTo(toX(tActual), toY(0));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  /** Círculos sobre cada curva en los instantes de evento. */
  _dibujarPuntosEventos(ctx, toX, toY, curvas, dpr) {
    const tiempos = this._getTiemposEventos().map((e) => e.t);
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1 * dpr;
    curvas.forEach((c) => {
      ctx.fillStyle = c.color;
      tiempos.forEach((t) => {
        ctx.beginPath();
        ctx.arc(toX(t), toY(c.fn(t)), 3.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    });
    ctx.restore();
  },

  /**
   * Gráfica genérica (usada por x-t, v-t, a-t).
   * cfg: { canvasId, tActual, letraY, unidad, curvas:[{fn,color,simbolo}],
   *        rango?:{min,max}, sombrear?:bool, rotulosArea?:[{texto,color}] }
   * Orden de capas: grilla → ejes/ticks → marcadores evento → área →
   * curvas → puntos evento → cursor → puntos actuales → leyenda/readouts.
   */
  _dibujarGrafica(cfg) {
    const {
      canvasId,
      tActual,
      letraY,
      unidad,
      curvas,
      rango,
      sombrear,
      rotulosArea,
    } = cfg;
    const lienzo = this._prepararCanvasGrafica(canvasId);
    if (!lienzo) return;
    const { ctx, dpr, w, h } = lienzo;
    const tMax = Modelo.DATOS_EXAMEN.tEnd;
    const { car: carColor, truck: truckColor } = this._obtenerColores();

    // Rango vertical: el dado, o el que abarcan las curvas (+8% margen)
    let yMin, yMax;
    if (rango) {
      yMin = rango.min;
      yMax = rango.max;
    } else {
      const r = this._rangoDeCurvas(
        curvas.map((c) => c.fn),
        tMax,
      );
      const min = Math.min(0, r.min);
      let max = Math.max(0, r.max);
      if (max - min < 1) max = min + 1;
      const margen = (max - min) * 0.08;
      yMax = max + margen;
      yMin = min < 0 ? min - margen : 0;
    }

    const padLeft = 64 * dpr;
    const padBottom = 30 * dpr;
    const padTop = 15 * dpr;
    const padRight = 20 * dpr;
    const graphW = w - padLeft - padRight;
    const graphH = h - padBottom - padTop;

    const toX = (t) => padLeft + (t / tMax) * graphW;
    const toY = (v) => h - padBottom - ((v - yMin) / (yMax - yMin)) * graphH;

    // Ticks con pasos "bonitos" (múltiplos del paso, incluye el 0)
    const pasoT = this._calcularPasoBonito(tMax);
    const pasoY = this._calcularPasoBonito(
      Math.max(Math.abs(yMin), Math.abs(yMax)),
    );
    const tTicks = [];
    for (let k = 0; k * pasoT <= tMax + 1e-9; k++) tTicks.push(k * pasoT);
    const yTicks = [];
    for (
      let k = Math.ceil(yMin / pasoY - 1e-9);
      k * pasoY <= yMax + 1e-9;
      k++
    ) {
      yTicks.push(k * pasoY);
    }

    this._dibujarGrillaSuave(
      ctx,
      padLeft,
      padTop,
      padRight,
      padBottom,
      w,
      h,
      tTicks.map(toX),
      yTicks.map(toY),
    );

    // Ejes
    ctx.strokeStyle = "#2d3748";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, h - padBottom);
    ctx.lineTo(w - padRight, h - padBottom);
    ctx.stroke();

    // Referencia en 0 si el eje vertical tiene negativos
    if (yMin < 0) {
      ctx.strokeStyle = "#3a4553";
      ctx.setLineDash([3 * dpr, 3 * dpr]);
      ctx.beginPath();
      ctx.moveTo(padLeft, toY(0));
      ctx.lineTo(w - padRight, toY(0));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Números de los ejes (con unidad en cada tick)
    ctx.fillStyle = "#64748b";
    ctx.font = `${9 * dpr}px sans-serif`;
    tTicks.forEach((tVal) => {
      const px = toX(tVal);
      ctx.fillRect(px, h - padBottom, 1 * dpr, 4 * dpr);
      ctx.textAlign = "center";
      ctx.fillText(`${tVal.toFixed(1)} s`, px, h - padBottom + 14 * dpr);
    });
    yTicks.forEach((yVal) => {
      const py = toY(yVal);
      ctx.fillRect(padLeft - 4 * dpr, py, 4 * dpr, 1 * dpr);
      ctx.textAlign = "right";
      ctx.fillText(
        `${this._formatoTick(yVal, pasoY)} ${unidad}`,
        padLeft - 8 * dpr,
        py + 3 * dpr,
      );
    });

    // Títulos de ejes
    ctx.fillStyle = "#94a3b8";
    ctx.font = `600 ${10 * dpr}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("t (s)", w - padRight - 10 * dpr, h - 5 * dpr);
    ctx.save();
    ctx.translate(15 * dpr, padTop + graphH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(letraY, 0, 0);
    ctx.restore();

    this._dibujarMarcadoresEventoGrafica(ctx, toX, padTop, h, padBottom, dpr);

    if (sombrear) {
      curvas.forEach((c) =>
        this._dibujarAreaSombreada(ctx, toX, toY, c.fn, tActual, c.color),
      );
    }

    curvas.forEach((c) =>
      this._dibujarCurvaDoble(ctx, toX, toY, c.fn, tActual, tMax, c.color, dpr),
    );

    this._dibujarPuntosEventos(ctx, toX, toY, curvas, dpr);
    this._dibujarCursorTiempo(ctx, toX, tActual, padTop, h, padBottom, dpr);

    const valoresActuales = curvas.map((c) => c.fn(tActual));
    this._dibujarPuntosActuales(
      ctx,
      curvas.map((c, i) => ({
        x: toX(tActual),
        y: toY(valoresActuales[i]),
        color: c.color,
        label: `${c.simbolo}=${valoresActuales[i].toFixed(1)} ${unidad}`,
      })),
      dpr,
    );

    this._dibujarLeyendaGrafica(
      ctx,
      w,
      padRight,
      padTop,
      carColor,
      truckColor,
      dpr,
    );

    const unir = (segs) =>
      segs.flatMap((s, i) =>
        i === 0 ? [s] : [{ texto: "  ·  ", color: "#64748b" }, s],
      );
    const xTexto = padLeft + 8 * dpr;
    const yReadout = h - padBottom - 10 * dpr;
    this._dibujarReadoutInstantaneo(
      ctx,
      xTexto,
      yReadout,
      dpr,
      unir(
        curvas.map((c, i) => ({
          texto: `${c.simbolo} = ${valoresActuales[i].toFixed(1)} ${unidad}`,
          color: c.color,
        })),
      ),
    );
    if (rotulosArea) {
      this._dibujarReadoutInstantaneo(
        ctx,
        xTexto,
        yReadout - 14 * dpr,
        dpr,
        unir(rotulosArea),
      );
    }
  },

  /** Gráfica x-t. Sin área sombreada. */
  dibujarGraficaPosicion(tActual) {
    const { car, truck } = this._obtenerColores();
    this._dibujarGrafica({
      canvasId: "canvasGraphX",
      tActual,
      letraY: "x",
      unidad: "m",
      curvas: [
        { fn: (t) => Modelo.posicionAuto(t), color: car, simbolo: "x₁" },
        { fn: (t) => Modelo.posicionCamion(t), color: truck, simbolo: "x₂" },
      ],
    });
  },

  /** Gráfica v-t. Área bajo la curva = distancia recorrida (x(t)−x(0)). */
  dibujarGraficaVelocidad(tActual) {
    const { car, truck } = this._obtenerColores();
    const d1 = Modelo.posicionAuto(tActual) - Modelo.posicionAuto(0);
    const d2 = Modelo.posicionCamion(tActual) - Modelo.posicionCamion(0);
    this._dibujarGrafica({
      canvasId: "canvasGraphV",
      tActual,
      letraY: "v",
      unidad: "m/s",
      sombrear: true,
      curvas: [
        { fn: (t) => Modelo.velocidadAuto(t), color: car, simbolo: "v₁" },
        { fn: (t) => Modelo.velocidadCamion(t), color: truck, simbolo: "v₂" },
      ],
      rotulosArea: [
        { texto: `d₁ ≈ ${d1.toFixed(1)} m`, color: car },
        { texto: `d₂ ≈ ${d2.toFixed(1)} m`, color: truck },
      ],
    });
  },

  /** Gráfica a-t. Eje simétrico; área = Δv = a·t. */
  dibujarGraficaAceleracion(tActual) {
    const { car, truck } = this._obtenerColores();
    const p = Modelo.params;
    const a1 = p.tipoMovil1 === "mru" ? 0 : p.a_1;
    const a2 = p.tipoMovil2 === "mru" ? 0 : p.a_2;
    const aMax = Math.max(Math.abs(a1), Math.abs(a2), 1) * 1.3;
    this._dibujarGrafica({
      canvasId: "canvasGraphA",
      tActual,
      letraY: "a",
      unidad: "m/s²",
      sombrear: true,
      rango: { min: -aMax, max: aMax },
      curvas: [
        { fn: () => a1, color: car, simbolo: "a₁" },
        { fn: () => a2, color: truck, simbolo: "a₂" },
      ],
      rotulosArea: [
        { texto: `Δv₁ ≈ ${(a1 * tActual).toFixed(1)} m/s`, color: car },
        { texto: `Δv₂ ≈ ${(a2 * tActual).toFixed(1)} m/s`, color: truck },
      ],
    });
  },

  /** Dispatcher: dibuja solo la gráfica del tab activo. */
  dibujarGraficaActiva(t) {
    if (this.graficaActiva === "v") this.dibujarGraficaVelocidad(t);
    else if (this.graficaActiva === "a") this.dibujarGraficaAceleracion(t);
    else this.dibujarGraficaPosicion(t);
  },

  /** Cambia qué gráfica está visible. NO repinta: el Controlador debe
   * llamar a Vista.render(t) después. */
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
      const canvas = document.getElementById(
        `canvasGraph${clave.toUpperCase()}`,
      );
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
    if (p.velCar)
      p.velCar.textContent = `${Modelo.velocidadAuto(t).toFixed(2)} m/s`;
    if (p.velTruck)
      p.velTruck.textContent = `${Modelo.velocidadCamion(t).toFixed(2)} m/s`;
    if (p.gap) p.gap.textContent = `${Math.abs(xTruck - xCar).toFixed(2)} m`;
  },

  /** Resalta la tarjeta del evento activo según t. */
  actualizarResaltadoEventos(t) {
    const TOLERANCIA = 0.12;
    const { encuentros, velIguales } = Modelo.DATOS_EXAMEN;
    this.marcarEventoActivo("e1", Math.abs(t - encuentros.t1) < TOLERANCIA);
    this.marcarEventoActivo("e2", Math.abs(t - velIguales.t) < TOLERANCIA);
    this.marcarEventoActivo("e3", Math.abs(t - encuentros.t2) < TOLERANCIA);
  },

  marcarEventoActivo(key, activo) {
    const el = document.querySelector(`[data-event="${key}"]`);
    if (el) el.classList.toggle("event--active", activo);
  },

  /** Botones Iniciar/Pausar. btnPause se habilita si la simulación corre
   * O si hay un "punto de reanudación" válido (clic en evento o slider). */
  actualizarBotonesControl(enEjecucion, hayPuntoDeReanudacion = false) {
    if (this.btnStart) this.btnStart.disabled = enEjecucion;
    if (this.btnPause)
      this.btnPause.disabled = !(enEjecucion || hayPuntoDeReanudacion);
  },

  /** Feedback al pulsar "Actualizar": flash azul (~900 ms) + badge (~2 s). */
  mostrarConfirmacionActualizacion() {
    const btn = this.btnAplicarConfig;
    if (btn) {
      btn.classList.remove("btn--flash");
      void btn.offsetWidth; // reflow para reiniciar la animación si se pulsa de nuevo
      btn.classList.add("btn--flash");
      clearTimeout(this._timerFlash);
      this._timerFlash = setTimeout(
        () => btn.classList.remove("btn--flash"),
        900,
      );
    }
    if (this.configBadge) {
      this.configBadge.classList.add("is-visible");
      clearTimeout(this._timerBadge);
      this._timerBadge = setTimeout(
        () => this.configBadge.classList.remove("is-visible"),
        2000,
      );
    }
  },

  setTextoBotonPausa(texto) {
    if (this.btnPause) this.btnPause.textContent = texto;
  },

  /** Refleja t en el slider salvo que el usuario lo esté arrastrando. */
  sincronizarSlider(t) {
    if (this.timelineSlider && document.activeElement !== this.timelineSlider) {
      this.timelineSlider.value = t;
    }
  },

  /* --------------------------------------------------------------------
   * INFO ESTÁTICA (leyenda + tarjetas de eventos)
   * Solo al iniciar y al aplicar nueva configuración. No en cada frame.
   * -------------------------------------------------------------------- */

  actualizarInfoEstatica() {
    this.calcularEscalaMundo(); // reajusta la escala al nuevo rango total
    this._actualizarLeyenda();
    this._actualizarTarjetasEventos();
  },

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

  /** Recalcula texto y data-time de cada tarjeta de evento. */
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
    li.setAttribute("data-time", tiempo);
    const parrafo = li.querySelector("p");
    if (parrafo) parrafo.textContent = textoDescripcion;
  },

  /* --------------------------------------------------------------------
   * RENDER PRINCIPAL
   * -------------------------------------------------------------------- */

  render(t) {
    this.dibujarCarretera();

    const xCar = Modelo.posicionAuto(t);
    const xTruck = Modelo.posicionCamion(t);
    const carPx = this.metrosAPixeles(xCar);
    const truckPx = this.metrosAPixeles(xTruck);
    const { encuentros, velIguales } = Modelo.DATOS_EXAMEN;

    // Marcadores sobre la carretera
    this.dibujarMarcadorEvento(encuentros.x1, "#ffe45e", "1er encuentro");
    this.dibujarMarcadorEvento(
      velIguales.xCar,
      "#8fa3bb",
      `v iguales (t=${velIguales.t.toFixed(1)}s)`,
    );
    this.dibujarMarcadorEvento(encuentros.x2, "#ff5e8f", "2do encuentro");

    // Corchete de separación cerca del instante de velocidades iguales
    if (Math.abs(t - velIguales.t) < 0.15) {
      this.dibujarCorcheteSeparacion(
        this.metrosAPixeles(velIguales.xCar),
        this.metrosAPixeles(velIguales.xTruck),
        `separación = ${velIguales.gap.toFixed(0)} m`,
      );
    }

    // Colores de los móviles (cacheados)
    const dpr = window.devicePixelRatio;
    const { car: carColor, truck: truckColor } = this._obtenerColores();

    this.dibujarCamion(truckPx, this.roadY + 6 * dpr, truckColor, "Camión");
    this.dibujarAuto(carPx, this.roadY - 10 * dpr, carColor, "Auto");

    this.actualizarPanelDatos(t, xCar, xTruck);
    this.actualizarResaltadoEventos(t);
    this.sincronizarSlider(t);

    this.dibujarGraficaActiva(t);
  },
};
