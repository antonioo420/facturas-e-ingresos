import './styles.css'
import {
  PALABRAS_INGRESO,
  coincideConPalabras,
  describirPeriodo,
  parsearExtracto,
  type Movimiento,
} from './csv'
import { anadirFacturas, descargar, nombrarArchivo, type Factura } from './merge'
import { anadirPortadilla, crearDocumentoIngresos } from './table-pdf'
import { iniciarTema } from './tema'
import { mostrarMensaje, pintarFacturas, pintarIngresos } from './ui'

function elemento<T extends HTMLElement>(id: string): T {
  const encontrado = document.getElementById(id)
  if (!encontrado) throw new Error(`Falta el elemento #${id} en el HTML`)
  return encontrado as T
}

const soltarCsv = elemento<HTMLLabelElement>('soltar-csv')
const entradaCsv = elemento<HTMLInputElement>('entrada-csv')
const mensajeCsv = elemento('mensaje-csv')
const zonaIngresos = elemento('zona-ingresos')
const campoPalabras = elemento<HTMLInputElement>('palabras')
const resumenIngresos = elemento('resumen-ingresos')
const cuerpoIngresos = elemento('cuerpo-ingresos')
const marcarTodo = elemento<HTMLButtonElement>('marcar-todo')
const desmarcarTodo = elemento<HTMLButtonElement>('desmarcar-todo')

const soltarPdf = elemento<HTMLLabelElement>('soltar-pdf')
const entradaPdf = elemento<HTMLInputElement>('entrada-pdf')
const pistaFacturas = elemento('pista-facturas')
const listaFacturas = elemento('lista-facturas')

const campoTitulo = elemento<HTMLInputElement>('titulo')
const campoSubtitulo = elemento<HTMLInputElement>('subtitulo')
const botonGenerar = elemento<HTMLButtonElement>('generar')
const estado = elemento('estado')

iniciarTema(elemento<HTMLButtonElement>('tema'))

let ingresos: Movimiento[] = []
let totalMovimientos = 0
let facturas: Factura[] = []
/** En cuanto tocas el subtítulo dejamos de sobrescribirlo. */
let subtituloTocado = false

// --- Ingresos ---

campoPalabras.value = PALABRAS_INGRESO.join(', ')

function palabrasActuales(): string[] {
  return campoPalabras.value
    .split(',')
    .map((palabra) => palabra.trim())
    .filter((palabra) => palabra !== '')
}

function seleccionados(): Movimiento[] {
  return ingresos.filter((movimiento) => movimiento.incluido)
}

function refrescarResumen() {
  const elegidos = seleccionados()
  resumenIngresos.textContent =
    `${elegidos.length} de ${ingresos.length} marcados · ` +
    `${totalMovimientos} movimientos en el extracto`

  if (!subtituloTocado) campoSubtitulo.value = describirPeriodo(elegidos)
  botonGenerar.disabled = elegidos.length === 0
}

function repintarIngresos() {
  pintarIngresos(cuerpoIngresos, ingresos, (indice, incluido) => {
    ingresos[indice].incluido = incluido
    refrescarResumen()
  })
  refrescarResumen()
}

function cargarCsv(archivo: File) {
  archivo
    .arrayBuffer()
    .then((buffer) => {
      const resultado = parsearExtracto(buffer, palabrasActuales())
      ingresos = resultado.ingresos
      totalMovimientos = resultado.totalMovimientos

      if (ingresos.length === 0) {
        zonaIngresos.hidden = true
        botonGenerar.disabled = true
        mostrarMensaje(
          mensajeCsv,
          `En ${archivo.name} no hay ningún movimiento en positivo. ` +
            '¿Seguro que es el extracto?',
          'aviso',
        )
        return
      }

      mostrarMensaje(mensajeCsv, archivo.name)
      zonaIngresos.hidden = false
      repintarIngresos()
    })
    .catch((error: unknown) => {
      const detalle = error instanceof Error ? error.message : String(error)
      mostrarMensaje(mensajeCsv, `No se pudo leer el CSV: ${detalle}`, 'error')
    })
}

function marcarTodas(incluido: boolean) {
  ingresos.forEach((movimiento) => {
    movimiento.incluido = incluido
  })
  repintarIngresos()
}

marcarTodo.addEventListener('click', () => marcarTodas(true))
desmarcarTodo.addEventListener('click', () => marcarTodas(false))

// Cambiar las palabras clave vuelve a aplicar el filtro desde cero, así que
// se pierden las casillas que se hubieran tocado a mano.
campoPalabras.addEventListener('input', () => {
  if (ingresos.length === 0) return
  const palabras = palabrasActuales()
  ingresos.forEach((movimiento) => {
    movimiento.incluido = coincideConPalabras(movimiento.concepto, palabras)
  })
  repintarIngresos()
})

// --- Facturas ---

function refrescarFacturas() {
  pistaFacturas.hidden = facturas.length < 2
  pintarFacturas(listaFacturas, facturas, {
    alReordenar: (desde, hasta) => {
      const [movida] = facturas.splice(desde, 1)
      facturas.splice(hasta, 0, movida)
      refrescarFacturas()
    },
    alQuitar: (indice) => {
      facturas.splice(indice, 1)
      refrescarFacturas()
    },
  })
}

async function cargarFacturas(archivos: File[]) {
  const pdfs = archivos.filter(
    (archivo) => archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name),
  )
  if (pdfs.length === 0) return

  // El lote nuevo entra ordenado por nombre; a partir de ahí manda el arrastre.
  pdfs.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
  const nuevas = await Promise.all(
    pdfs.map(async (archivo) => ({ nombre: archivo.name, bytes: await archivo.arrayBuffer() })),
  )
  facturas = facturas.concat(nuevas)
  refrescarFacturas()
}

// --- Zonas de carga ---

function configurarZona(zona: HTMLElement, alRecibir: (archivos: File[]) => void) {
  zona.addEventListener('dragover', (evento) => {
    evento.preventDefault()
    zona.classList.add('encima')
  })
  zona.addEventListener('dragleave', () => zona.classList.remove('encima'))
  zona.addEventListener('drop', (evento) => {
    evento.preventDefault()
    zona.classList.remove('encima')
    const archivos = Array.from(evento.dataTransfer?.files ?? [])
    if (archivos.length > 0) alRecibir(archivos)
  })
}

configurarZona(soltarCsv, (archivos) => {
  const csv = archivos.find((archivo) => /\.csv$/i.test(archivo.name)) ?? archivos[0]
  cargarCsv(csv)
})
configurarZona(soltarPdf, (archivos) => void cargarFacturas(archivos))

entradaCsv.addEventListener('change', () => {
  const archivo = entradaCsv.files?.[0]
  if (archivo) cargarCsv(archivo)
})

entradaPdf.addEventListener('change', () => {
  void cargarFacturas(Array.from(entradaPdf.files ?? []))
  entradaPdf.value = ''
})

// Si sueltas un fichero fuera de las zonas, el navegador lo abriría.
window.addEventListener('dragover', (evento) => evento.preventDefault())
window.addEventListener('drop', (evento) => evento.preventDefault())

// --- Portada ---

campoSubtitulo.addEventListener('input', () => {
  subtituloTocado = true
})

// --- Generar ---

botonGenerar.addEventListener('click', () => {
  const elegidos = seleccionados()
  if (elegidos.length === 0) {
    mostrarMensaje(estado, 'No hay ningún ingreso marcado.', 'error')
    return
  }

  botonGenerar.disabled = true
  mostrarMensaje(estado, 'Generando…')

  const subtitulo = campoSubtitulo.value
  crearDocumentoIngresos(elegidos, { titulo: campoTitulo.value, subtitulo })
    .then(async (pdf) => {
      // La portadilla solo tiene sentido si detrás viene algo.
      if (facturas.length > 0) await anadirPortadilla(pdf, 'Facturas')
      return { pdf, fusion: await anadirFacturas(pdf, facturas) }
    })
    .then(({ pdf, fusion }) => {
      descargar(fusion.bytes, nombrarArchivo(subtitulo))
      const paginas = pdf.getPageCount()
      const facturasUsadas = facturas.length - fusion.omitidas.length
      const detalle =
        `${paginas} páginas: ${elegidos.length} ingresos y ` +
        `${facturasUsadas} ${facturasUsadas === 1 ? 'factura' : 'facturas'}`

      if (fusion.omitidas.length > 0) {
        mostrarMensaje(estado, `${detalle}. Sin leer: ${fusion.omitidas.join(', ')}`, 'aviso')
      } else {
        mostrarMensaje(estado, `Listo — ${detalle}`, 'ok')
      }
    })
    .catch((error: unknown) => {
      const detalle = error instanceof Error ? error.message : String(error)
      mostrarMensaje(estado, `No se pudo generar el PDF: ${detalle}`, 'error')
    })
    .finally(() => {
      botonGenerar.disabled = seleccionados().length === 0
    })
})
