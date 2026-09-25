/**
 * ============================================================================
 * CONTROLADOR — controlador.js
 * ============================================================================
 * Responsabilidad única: mantener el "estado" de la simulación (tiempo,
 * si corre o está pausada, velocidad de reproducción) y reaccionar a la
 * interacción del usuario (botones, sliders). En cada cambio de estado le
 * pide a la Vista que se repinte con Vista.render(t); nunca dibuja nada
 * él mismo ni calcula física directamente (eso es trabajo de Modelo/Vista).
 * ============================================================================
 */
const Controlador = {
  // --- Estado mutable de la reproducción ------------------------------------
  estado: {
    t: 0, // tiempo simulado actual, en segundos
    corriendo: false,
    pausado: false,
    velocidadReproduccion: 4, // multiplicador de tiempo real -> tiempo simulado
    ultimoFrameMs: 0,
  },

  /**
   * Punto de entrada: prepara Vista, dibuja el estado inicial y conecta
   * todos los listeners de los controles de la interfaz.
   */
  init() {
    Vista.init();
    Vista.redimensionar();
    Vista.render(this.estado.t);

    this._configurarBotones();
    this._configurarControlVelocidad();
    this._configurarSliderTiempo();
    window.addEventListener("resize", () => {
      Vista.redimensionar();
      Vista.render(this.estado.t);
    });
  },

  /* --------------------------------------------------------------------
   * BUCLE DE ANIMACIÓN (60 FPS vía requestAnimationFrame)
   * -------------------------------------------------------------------- */

  _tick(timestampMs) {
    const e = this.estado;
    if (!e.corriendo) return;

    if (!e.pausado) {
      const deltaSegundosReales = (timestampMs - e.ultimoFrameMs) / 1000;
      e.t += deltaSegundosReales * e.velocidadReproduccion;

      if (e.t >= Modelo.DATOS_EXAMEN.tEnd) {
        e.t = Modelo.DATOS_EXAMEN.tEnd;
        e.corriendo = false;
        Vista.actualizarBotonesControl(false);
      }
    }
    e.ultimoFrameMs = timestampMs;

    Vista.render(e.t);

    if (e.corriendo) requestAnimationFrame((ts) => this._tick(ts));
  },

  /* --------------------------------------------------------------------
   * LISTENERS DE LA INTERFAZ
   * -------------------------------------------------------------------- */

  _configurarBotones() {
    Vista.btnStart?.addEventListener("click", () => {
      const e = this.estado;
      e.t = 0;
      e.corriendo = true;
      e.pausado = false;
      e.ultimoFrameMs = performance.now();
      Vista.actualizarBotonesControl(true);
      Vista.setTextoBotonPausa("⏸ Pausar");
      requestAnimationFrame((ts) => this._tick(ts));
    });

    Vista.btnPause?.addEventListener("click", () => {
      const e = this.estado;
      e.pausado = !e.pausado;
      Vista.setTextoBotonPausa(e.pausado ? "▶ Reanudar" : "⏸ Pausar");
      if (!e.pausado) {
        e.ultimoFrameMs = performance.now();
        requestAnimationFrame((ts) => this._tick(ts));
      }
    });

    document.getElementById("btnReset")?.addEventListener("click", () => {
      const e = this.estado;
      e.corriendo = false;
      e.pausado = false;
      e.t = 0;
      Vista.actualizarBotonesControl(false);
      Vista.setTextoBotonPausa("⏸ Pausar");
      Vista.render(e.t);
    });
  },

  _configurarControlVelocidad() {
    const speedRange = document.getElementById("speedRange");
    const speedVal = document.getElementById("speedVal");
    if (!speedRange) return;

    speedRange.addEventListener("input", () => {
      this.estado.velocidadReproduccion = Number(speedRange.value);
      if (speedVal) speedVal.textContent = `${this.estado.velocidadReproduccion}×`;
    });

    // Sincroniza el valor mostrado con el valor inicial del control
    this.estado.velocidadReproduccion = Number(speedRange.value);
    if (speedVal) speedVal.textContent = `${this.estado.velocidadReproduccion}×`;
  },

  /** Slider de "rebobinar / avanzar": permite mover t manualmente y ver
   * el escenario redibujado al instante en ese segundo exacto. */
  _configurarSliderTiempo() {
    const slider = Vista.timelineSlider;
    if (!slider) return;

    slider.max = Modelo.DATOS_EXAMEN.tEnd;

    slider.addEventListener("input", () => {
      this.estado.t = Number(slider.value);
      Vista.render(this.estado.t);
    });
  },
};
