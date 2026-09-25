/**
 * ============================================================================
 * MODELO — modelo.js
 * ============================================================================
 * Responsabilidad única: guardar los datos del problema y calcular la física
 * (posiciones, velocidades, encuentros). NO toca el DOM ni el canvas.
 * Vista y Controlador solo LEEN lo que hay aquí; nunca recalculan fórmulas
 * por su cuenta. Si cambian los datos del enunciado, solo se edita CONFIG.
 * ============================================================================
 */
const Modelo = {
  // --- Condiciones iniciales del problema (t = 0) --------------------------
  CONFIG: {
    V_CAR: 40, // Velocidad constante del auto, en m/s (144 km/h ÷ 3.6)
    X_TRUCK0: 80, // Posición inicial del camión, en metros (adelante del auto)
    A_TRUCK: 4, // Aceleración constante del camión, en m/s² (parte del reposo)
    MARGIN_LEFT_M: 20, // Margen visual antes de x=0
    MARGIN_RIGHT_M: 30, // Margen visual después del 2do encuentro
  },

  /**
   * Posición del auto en el tiempo t (MRU). Fórmula: x(t) = v · t
   */
  posicionAuto(t) {
    return this.CONFIG.V_CAR * t;
  },

  /**
   * Posición del camión en el tiempo t (MRUV, v0=0). Fórmula: x(t) = x0 + ½·a·t²
   */
  posicionCamion(t) {
    return this.CONFIG.X_TRUCK0 + 0.5 * this.CONFIG.A_TRUCK * t * t;
  },

  /**
   * Velocidad del auto: constante en todo instante (MRU).
   */
  velocidadAuto() {
    return this.CONFIG.V_CAR;
  },

  /**
   * Velocidad del camión en el tiempo t (MRUV, v0=0). Fórmula: v(t) = a · t
   */
  velocidadCamion(t) {
    return this.CONFIG.A_TRUCK * t;
  },

  /**
   * Resuelve los encuentros igualando posiciones: x_auto(t) = x_camion(t)
   *   40t = 80 + 2t²  →  2t² - 40t + 80 = 0  →  t² - 20t + 40 = 0
   * Se resuelve con la fórmula general (a=1, b=-20, c=40).
   * Devuelve el 1er encuentro (raíz menor) y el 2do encuentro (raíz mayor).
   */
  resolverEncuentros() {
    const a = 1, b = -20, c = 40;
    const discriminante = b * b - 4 * a * c; // 400 - 160 = 240
    const raizDisc = Math.sqrt(discriminante);

    const t1 = (-b - raizDisc) / (2 * a); // ≈ 2.254 s
    const t2 = (-b + raizDisc) / (2 * a); // ≈ 17.746 s

    return {
      t1, x1: this.posicionAuto(t1),
      t2, x2: this.posicionAuto(t2),
    };
  },

  /**
   * Resuelve el instante de velocidades iguales: v_auto = v_camion
   *   40 = 4t  →  t = 10 s
   * Y calcula la separación entre ambos en ese instante (120 m).
   */
  resolverVelocidadesIguales() {
    const t = this.CONFIG.V_CAR / this.CONFIG.A_TRUCK; // 10 s
    const xCar = this.posicionAuto(t);
    const xTruck = this.posicionCamion(t);
    return { t, xCar, xTruck, gap: Math.abs(xCar - xTruck) };
  },

  /**
   * Calcula una sola vez, al cargarse el modelo, los "datos de examen":
   * ambos encuentros, el instante de velocidades iguales y la duración
   * total a simular (2do encuentro + margen de 1.5 s).
   */
  datosExamen() {
    const encuentros = this.resolverEncuentros();
    return {
      encuentros,
      velIguales: this.resolverVelocidadesIguales(),
      tEnd: encuentros.t2 + 1.5,
    };
  },
};

// Se calculan una sola vez y quedan disponibles como resultado "congelado"
// para que Vista/Controlador no tengan que volver a resolver la física.
Modelo.DATOS_EXAMEN = Modelo.datosExamen();
