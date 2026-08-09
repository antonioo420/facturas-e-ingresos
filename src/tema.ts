type Tema = 'claro' | 'oscuro'

const CLAVE = 'trimestral:tema'
const CONSULTA_OSCURO = '(prefers-color-scheme: dark)'

/**
 * El almacenamiento puede fallar (modo privado, permisos), y quedarse sin
 * recordar el tema no es motivo para tirar la página abajo.
 */
function leerGuardado(): Tema | null {
  try {
    const valor = localStorage.getItem(CLAVE)
    return valor === 'claro' || valor === 'oscuro' ? valor : null
  } catch {
    return null
  }
}

function guardar(tema: Tema) {
  try {
    localStorage.setItem(CLAVE, tema)
  } catch {
    /* sin persistencia, pero el tema sigue aplicado en esta pestaña */
  }
}

function temaDelSistema(): Tema {
  return window.matchMedia(CONSULTA_OSCURO).matches ? 'oscuro' : 'claro'
}

/**
 * El que se está viendo ahora mismo: tu elección si la hay, si no la del sitio
 * que aloje la página, y como último recurso la del sistema.
 */
function temaActual(): Tema {
  const raiz = document.documentElement
  const elegido = raiz.dataset.tema
  if (elegido === 'claro' || elegido === 'oscuro') return elegido

  const anfitrion = raiz.dataset.theme
  if (anfitrion === 'dark') return 'oscuro'
  if (anfitrion === 'light') return 'claro'

  return temaDelSistema()
}

/**
 * Mientras no se pulse el botón, la página sigue al sistema. Al pulsarlo se
 * fija la elección en <html> y se recuerda para las siguientes visitas.
 */
export function iniciarTema(boton: HTMLButtonElement) {
  const etiquetar = () => {
    const siguiente = temaActual() === 'oscuro' ? 'claro' : 'oscuro'
    const texto = `Cambiar a modo ${siguiente}`
    boton.title = texto
    boton.setAttribute('aria-label', texto)
  }

  boton.addEventListener('click', () => {
    const siguiente: Tema = temaActual() === 'oscuro' ? 'claro' : 'oscuro'
    document.documentElement.dataset.tema = siguiente
    guardar(siguiente)
    etiquetar()
  })

  // Si no se ha elegido nada, seguimos al sistema aunque cambie sobre la marcha.
  window.matchMedia(CONSULTA_OSCURO).addEventListener('change', () => {
    if (leerGuardado() === null) etiquetar()
  })

  etiquetar()
}
