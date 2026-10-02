/**
 * ============================================================================
 * MODELO — modelo.js
 * ============================================================================
 * Responsabilidad única: guardar los datos del problema y calcular la física
 * de manera dinámica (posiciones, velocidades, encuentros).
 * ============================================================================
 */
const Modelo = {
  // Parámetros configurables del problema (con valores por defecto del examen).
  // NOTA: este objeto reemplazó a un antiguo "Modelo.CONFIG" de una versión
  // anterior. Si ves algún archivo que todavía lea "Modelo.CONFIG", es un
  // resto desactualizado: el nombre correcto y vigente es "Modelo.params".
  params: {
    tipoMovil1: "mru", // "mru" o "mruv"
    x0_1: 0, // Posición inicial móvil 1
    v0_1: 40, // Velocidad inicial móvil 1
    a_1: 0, // Aceleración móvil 1

    tipoMovil2: "mruv", // "mru" o "mruv"
    x0_2: 80, // Posición inicial móvil 2
    v0_2: 0, // Velocidad inicial móvil 2
    a_2: 4, // Aceleración móvil 2

    MARGIN_LEFT_M: 20,
    MARGIN_RIGHT_M: 30,
  },

  /**
   * Actualiza los parámetros del modelo dinámicamente desde el controlador.
   */
  actualizarParametros(nuevosDatos) {
    this.params = { ...this.params, ...nuevosDatos };
    // Recalculamos los datos de examen automáticamente al cambiar los parámetros
    this.DATOS_EXAMEN = this.datosExamen();
  },

  /**
   * Posición del Móvil 1 en el tiempo t (dependiendo de si es MRU o MRUV).
   */
  posicionMovil1(t) {
    const { x0_1, v0_1, a_1, tipoMovil1 } = this.params;
    if (tipoMovil1 === "mru") {
      return x0_1 + v0_1 * t;
    } else {
      return x0_1 + v0_1 * t + 0.5 * a_1 * t * t;
    }
  },

  /**
   * Posición del Móvil 2 en el tiempo t (dependiendo de si es MRU o MRUV).
   */
  posicionMovil2(t) {
    const { x0_2, v0_2, a_2, tipoMovil2 } = this.params;
    if (tipoMovil2 === "mru") {
      return x0_2 + v0_2 * t;
    } else {
      return x0_2 + v0_2 * t + 0.5 * a_2 * t * t;
    }
  },

  /**
   * Velocidad del Móvil 1 en el tiempo t.
   */
  velocidadMovil1(t) {
    const { v0_1, a_1, tipoMovil1 } = this.params;
    if (tipoMovil1 === "mru") {
      return v0_1;
    } else {
      return v0_1 + a_1 * t;
    }
  },

  /**
   * Velocidad del Móvil 2 en el tiempo t.
   */
  velocidadMovil2(t) {
    const { v0_2, a_2, tipoMovil2 } = this.params;
    if (tipoMovil2 === "mru") {
      return v0_2;
    } else {
      return v0_2 + a_2 * t;
    }
  },

  // --- Métodos de compatibilidad con los nombres anteriores (Auto / Camión) ---
  // IMPORTANTE: siempre hay que pasarles el "t" actual. El valor por defecto
  // (t=0) en velocidadAuto es solo una red de seguridad para no romper si
  // alguien olvida el argumento; si el Móvil 1 está en modo MRUV, llamarla
  // sin t daría siempre la velocidad inicial y nunca la velocidad real.
  posicionAuto(t) {
    return this.posicionMovil1(t);
  },
  posicionCamion(t) {
    return this.posicionMovil2(t);
  },
  velocidadAuto(t = 0) {
    return this.velocidadMovil1(t);
  },
  velocidadCamion(t) {
    return this.velocidadMovil2(t);
  },

  /**
   * Resuelve numéricamente los encuentros igualando posiciones: x1(t) = x2(t)
   * Útil para cualquier combinación ingresada por el usuario.
   */
  resolverEncuentros() {
    let t1 = null,
      t2 = null;
    let minDiff = Infinity;
    let tMin = 0;

    // Barrido numérico de alta precisión para encontrar intersecciones
    for (let t = 0; t <= 50; t += 0.01) {
      const p1 = this.posicionMovil1(t);
      const p2 = this.posicionMovil2(t);
      const diff = Math.abs(p1 - p2);

      if (diff < minDiff) {
        minDiff = diff;
        tMin = t;
      }

      if (t > 0 && diff < 0.3) {
        if (t1 === null) {
          t1 = t;
        } else if (Math.abs(t - t1) > 1.0) {
          t2 = t;
        }
      }
    }

    // Si hay un único punto de toque o rebase cercano
    if (t1 !== null && t2 === null && minDiff < 0.5) {
      t2 = t1;
    }

    // Caso límite: si con la configuración actual los móviles nunca llegan
    // a juntarse (por ejemplo, ambos alejándose todo el tiempo), no existe
    // un "encuentro" real. En ese caso se usa tMin (el instante de mínima
    // distancia entre ambos) como mejor aproximación, solo para que el
    // escalado del canvas y las gráficas tengan un valor de referencia.
    const tFinal1 = t1 !== null ? t1 : tMin;
    const tFinal2 = t2 !== null ? t2 : tMin;

    return {
      t1: tFinal1,
      x1: this.posicionMovil1(tFinal1),
      t2: tFinal2,
      x2: this.posicionMovil1(tFinal2),
    };
  },

  /**
   * Resuelve de forma aproximada el instante de velocidades iguales v1(t) = v2(t)
   */
  resolverVelocidadesIguales() {
    let tBest = 0;
    let minDiff = Infinity;

    for (let t = 0; t <= 50; t += 0.01) {
      const v1 = this.velocidadMovil1(t);
      const v2 = this.velocidadMovil2(t);
      const diff = Math.abs(v1 - v2);
      if (diff < minDiff) {
        minDiff = diff;
        tBest = t;
      }
    }

    const p1 = this.posicionMovil1(tBest);
    const p2 = this.posicionMovil2(tBest);
    return {
      t: tBest,
      xCar: p1,
      xTruck: p2,
      gap: Math.abs(p1 - p2),
    };
  },

  /**
   * Genera los datos dinámicos globales para las vistas y gráficas.
   */
  datosExamen() {
    const encuentros = this.resolverEncuentros();
    return {
      encuentros,
      velIguales: this.resolverVelocidadesIguales(),
      tEnd: Math.max(encuentros.t2 + 1.5, 20),
    };
  },
};

// Se inicializan los datos por defecto al arrancar
Modelo.DATOS_EXAMEN = Modelo.datosExamen();
