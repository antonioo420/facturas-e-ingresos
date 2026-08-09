import type { Movimiento } from './csv'
import type { Factura } from './merge'

/** Pinta la lista de ingresos con una casilla por fila. */
export function pintarIngresos(
  cuerpo: HTMLElement,
  ingresos: Movimiento[],
  alCambiar: (indice: number, incluido: boolean) => void,
) {
  cuerpo.replaceChildren()

  ingresos.forEach((movimiento, indice) => {
    const fila = document.createElement('tr')
    if (!movimiento.incluido) fila.classList.add('excluida')

    const celdaCheck = document.createElement('td')
    celdaCheck.className = 'col-check'
    const casilla = document.createElement('input')
    casilla.type = 'checkbox'
    casilla.checked = movimiento.incluido
    casilla.setAttribute('aria-label', `Incluir ${movimiento.concepto}`)
    casilla.addEventListener('change', () => {
      fila.classList.toggle('excluida', !casilla.checked)
      alCambiar(indice, casilla.checked)
    })
    celdaCheck.append(casilla)

    const celdaConcepto = document.createElement('td')
    celdaConcepto.textContent = movimiento.concepto

    const celdaFecha = document.createElement('td')
    celdaFecha.className = 'col-fecha'
    celdaFecha.textContent = movimiento.fechaTexto

    const celdaImporte = document.createElement('td')
    celdaImporte.className = 'col-importe'
    celdaImporte.textContent = movimiento.importeTexto

    fila.append(celdaCheck, celdaConcepto, celdaFecha, celdaImporte)
    cuerpo.append(fila)
  })
}

function formatearPeso(bytes: number): string {
  const kb = bytes / 1024
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`
}

/**
 * Pinta las facturas en el orden en que se van a concatenar y permite
 * reordenarlas arrastrando por el tirador.
 *
 * El arrastre va con Pointer Events en vez de con la API de drag & drop de
 * HTML5, que los navegadores móviles no disparan con el dedo. Así el mismo
 * código sirve para dedo, ratón y lápiz.
 */
export function pintarFacturas(
  lista: HTMLElement,
  facturas: Factura[],
  acciones: {
    alReordenar: (desde: number, hasta: number) => void
    alQuitar: (indice: number) => void
  },
) {
  lista.replaceChildren()
  const items: HTMLElement[] = []

  /**
   * Mientras se arrastra no se repinta la lista: se desplazan las filas con
   * transform y solo al soltar se confirma el nuevo orden.
   */
  function iniciarArrastre(evento: PointerEvent, tirador: HTMLElement, desde: number) {
    if (evento.pointerType === 'mouse' && evento.button !== 0) return
    evento.preventDefault()

    const item = items[desde]
    const alto = item.offsetHeight
    const inicioY = evento.clientY
    let hasta = desde

    tirador.setPointerCapture(evento.pointerId)
    item.classList.add('arrastrando')

    const mover = (movimiento: PointerEvent) => {
      const desplazado = movimiento.clientY - inicioY
      hasta = Math.max(0, Math.min(items.length - 1, desde + Math.round(desplazado / alto)))
      item.style.transform = `translateY(${desplazado}px)`

      items.forEach((otro, indice) => {
        if (indice === desde) return
        let hueco = 0
        if (hasta > desde && indice > desde && indice <= hasta) hueco = -alto
        if (hasta < desde && indice >= hasta && indice < desde) hueco = alto
        otro.style.transform = hueco === 0 ? '' : `translateY(${hueco}px)`
      })
    }

    const soltar = () => {
      tirador.removeEventListener('pointermove', mover)
      tirador.removeEventListener('pointerup', soltar)
      tirador.removeEventListener('pointercancel', soltar)
      if (tirador.hasPointerCapture(evento.pointerId)) {
        tirador.releasePointerCapture(evento.pointerId)
      }
      items.forEach((otro) => {
        otro.style.transform = ''
      })
      item.classList.remove('arrastrando')
      if (hasta !== desde) acciones.alReordenar(desde, hasta)
    }

    tirador.addEventListener('pointermove', mover)
    tirador.addEventListener('pointerup', soltar)
    tirador.addEventListener('pointercancel', soltar)
  }

  facturas.forEach((factura, indice) => {
    const item = document.createElement('li')
    item.className = 'factura'

    // Botón, y no un adorno, para poder moverlas también con el teclado.
    const agarre = document.createElement('button')
    agarre.type = 'button'
    agarre.className = 'agarre'
    agarre.textContent = '⠿'
    agarre.title = 'Arrastra, o usa las flechas arriba y abajo'
    agarre.setAttribute('aria-label', `Mover ${factura.nombre}`)
    agarre.addEventListener('pointerdown', (evento) => iniciarArrastre(evento, agarre, indice))
    agarre.addEventListener('keydown', (evento) => {
      if (evento.key === 'ArrowUp' && indice > 0) {
        evento.preventDefault()
        acciones.alReordenar(indice, indice - 1)
      } else if (evento.key === 'ArrowDown' && indice < facturas.length - 1) {
        evento.preventDefault()
        acciones.alReordenar(indice, indice + 1)
      }
    })

    const orden = document.createElement('span')
    orden.className = 'orden'
    orden.textContent = String(indice + 1)

    const nombre = document.createElement('span')
    nombre.className = 'nombre'
    nombre.textContent = factura.nombre
    nombre.title = factura.nombre

    const peso = document.createElement('span')
    peso.className = 'peso'
    peso.textContent = formatearPeso(factura.bytes.byteLength)

    const quitar = document.createElement('button')
    quitar.type = 'button'
    quitar.className = 'quitar'
    quitar.textContent = '×'
    quitar.title = 'Quitar'
    quitar.setAttribute('aria-label', `Quitar ${factura.nombre}`)
    quitar.addEventListener('click', () => acciones.alQuitar(indice))

    item.append(agarre, orden, nombre, peso, quitar)
    lista.append(item)
    items.push(item)
  })
}

/** Escribe un mensaje de estado con su color correspondiente. */
export function mostrarMensaje(
  elemento: HTMLElement,
  texto: string,
  tipo: 'info' | 'ok' | 'aviso' | 'error' = 'info',
) {
  elemento.textContent = texto
  elemento.className = tipo === 'info' ? 'mensaje' : `mensaje ${tipo}`
  elemento.hidden = texto === ''
}
