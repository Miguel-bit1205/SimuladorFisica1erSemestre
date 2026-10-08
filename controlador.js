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
    velocidadReproduccion: 1, // multiplicador de tiempo real -> tiempo simulado
    ultimoFrameMs: 0,
  },

  /**
   * Punto de entrada: prepara Vista, dibuja el estado inicial y conecta
   * todos los listeners de los controles de la interfaz.
   */
  init() {
    Vista.init();
    Vista.redimensionar();
    Vista.actualizarInfoEstatica(); // leyenda + tarjetas de eventos con los datos iniciales
    Vista.cambiarGraficaActiva(Vista.graficaActiva); // CAMBIO 3: deja tabs/título consistentes
    Vista.render(this.estado.t);

    this._configurarBotones();
    this._configurarControlVelocidad();
    this._configurarSliderTiempo();
    this._configurarClicsEventos();
    this._configurarParametrosDinamicos();
    this._configurarTabsGraficas(); // CAMBIO 3: tabs x-t / v-t / a-t

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
        Vista.actualizarBotonesControl(false, false); // terminó sola: sin punto de reanudación
      }
    }
    e.ultimoFrameMs = timestampMs;

    // Actualizar también la posición visual del slider de tiempo mientras corre
    const slider = Vista.timelineSlider;
    if (slider) slider.value = e.t;

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

      if (!e.corriendo) {
        // Veníamos de un clic en "Eventos clave" o de mover el slider de
        // tiempo (corriendo=false, pausado=true, con un t ya definido):
        // "Reanudar" debe retomar la animación desde ESE t, no desde 0.
        e.corriendo = true;
        e.pausado = false;
        e.ultimoFrameMs = performance.now();
        Vista.setTextoBotonPausa("⏸ Pausar");
        Vista.actualizarBotonesControl(true);
        requestAnimationFrame((ts) => this._tick(ts));
        return;
      }

      // Pausa/reanudación normal, en medio de una animación que ya corría.
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
      Vista.actualizarBotonesControl(false, false);
      Vista.setTextoBotonPausa("⏸ Pausar");
      const slider = Vista.timelineSlider;
      if (slider) slider.value = 0;
      Vista.render(e.t);
    });
  },

  _configurarControlVelocidad() {
    const speedRange = document.getElementById("speedRange");
    const speedVal = document.getElementById("speedVal");
    if (!speedRange) return;

    speedRange.addEventListener("input", () => {
      this.estado.velocidadReproduccion = Number(speedRange.value);
      if (speedVal)
        speedVal.textContent = `${this.estado.velocidadReproduccion}×`;
    });

    this.estado.velocidadReproduccion = Number(speedRange.value);
    if (speedVal)
      speedVal.textContent = `${this.estado.velocidadReproduccion}×`;
  },

  _configurarSliderTiempo() {
    const slider = Vista.timelineSlider;
    if (!slider) return;

    slider.max = Modelo.DATOS_EXAMEN.tEnd;

    slider.addEventListener("input", () => {
      this.estado.corriendo = false;
      this.estado.pausado = true;
      Vista.actualizarBotonesControl(false, true); // hay punto de reanudación: este t
      Vista.setTextoBotonPausa("▶ Reanudar");

      this.estado.t = Number(slider.value);
      Vista.render(this.estado.t);
    });
  },

  _configurarClicsEventos() {
    const eventosItems = document.querySelectorAll(".event");
    eventosItems.forEach((item) => {
      item.addEventListener("click", () => {
        const tiempoObjetivo = Number(item.getAttribute("data-time"));
        if (!isNaN(tiempoObjetivo)) {
          this.estado.corriendo = false;
          this.estado.pausado = true;
          Vista.actualizarBotonesControl(false, true); // hay punto de reanudación: este t
          Vista.setTextoBotonPausa("▶ Reanudar");

          this.estado.t = tiempoObjetivo;
          const slider = Vista.timelineSlider;
          if (slider) slider.value = tiempoObjetivo;

          Vista.render(this.estado.t);
        }
      });
    });
  },

  _configurarParametrosDinamicos() {
    const btn = document.getElementById("btnAplicarConfig");
    if (!btn) return;

    btn.addEventListener("click", () => {
      // 1. Pausar simulación actual
      this.estado.corriendo = false;
      this.estado.pausado = false;
      Vista.actualizarBotonesControl(false, false);
      Vista.setTextoBotonPausa("⏸ Pausar");

      // 2. Leer valores de los inputs del HTML
      const tipo1 = document.getElementById("tipo1").value;
      const x0_1 = parseFloat(document.getElementById("x0_1").value) || 0;
      const v0_1 = parseFloat(document.getElementById("v0_1").value) || 0;
      let a_1 = parseFloat(document.getElementById("a_1").value) || 0;

      const tipo2 = document.getElementById("tipo2").value;
      const x0_2 = parseFloat(document.getElementById("x0_2").value) || 0;
      const v0_2 = parseFloat(document.getElementById("v0_2").value) || 0;
      let a_2 = parseFloat(document.getElementById("a_2").value) || 0;

      // Validación lógica estricta para MRU
      if (tipo1 === "mru") a_1 = 0;
      if (tipo2 === "mru") a_2 = 0;

      // 3. Actualizar modelo con los nuevos parámetros (recalcula DATOS_EXAMEN automáticamente)
      Modelo.actualizarParametros({
        tipoMovil1: tipo1,
        x0_1,
        v0_1,
        a_1,
        tipoMovil2: tipo2,
        x0_2,
        v0_2,
        a_2,
      });

      // 4. Reiniciar el tiempo y actualizar el rango máximo del slider de tiempo
      this.estado.t = 0;
      const slider = Vista.timelineSlider;
      if (slider) {
        slider.max = Modelo.DATOS_EXAMEN.tEnd;
        slider.value = 0;
      }

      // 5. Refrescar leyenda y tarjetas de eventos con los NUEVOS datos
      //    (antes quedaban mostrando los valores del problema anterior).
      Vista.actualizarInfoEstatica();

      // 6. Redibujar la vista con los nuevos datos y gráficas
      Vista.render(this.estado.t);

      // 7. Feedback visual (flash en el botón + badge); el DOM lo maneja la Vista
      Vista.mostrarConfirmacionActualizacion();
    });
  },

  /** CAMBIO 3: cada botón/tab solo cambia CUÁL gráfica se ve (Vista.cambiarGraficaActiva)
   * y luego repinta con el "t" actual, para que la gráfica recién mostrada
   * refleje el estado real de la simulación en ese momento. */
  _configurarTabsGraficas() {
    const tabs = Vista.graphTabs;
    if (!tabs) return;

    tabs.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        Vista.cambiarGraficaActiva(btn.dataset.graph);
        Vista.render(this.estado.t);
      });
    });
  },
};
