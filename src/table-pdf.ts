import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import type { Movimiento } from './csv'

// Mismo lenguaje visual que la página: serif para el título, versalitas
// pequeñas para las cabeceras y filetes finos en vez de rejilla.
const A4: [number, number] = [595.28, 841.89]
const MARGEN_X = 64
const MARGEN_INFERIOR = 64
const ANCHO_TABLA = A4[0] - MARGEN_X * 2

// Columnas: concepto a la izquierda, fecha a media tabla, importe al borde.
const X_CONCEPTO = MARGEN_X
const X_FECHA = MARGEN_X + 268
const X_IMPORTE_DERECHA = MARGEN_X + ANCHO_TABLA

const ALTO_FILA = 22
const Y_TOPE_TABLA = 770

const TAM_FILA = 10
const TAM_CABECERA = 8
const TAM_TITULO = 26
const TAM_SUBTITULO = 12
const ESPACIADO_CABECERA = 1.1

// La paleta clara de styles.css.
const TINTA = rgb(0.106, 0.102, 0.09) // #1b1a17
const SUAVE = rgb(0.451, 0.431, 0.4) // #736e66
const LINEA = rgb(0.89, 0.875, 0.843) // #e3dfd7
const LINEA_FUERTE = rgb(0.788, 0.765, 0.722) // #c9c3b8

export interface OpcionesPdf {
  titulo: string
  subtitulo: string
}

interface Fuentes {
  serif: PDFFont
  texto: PDFFont
}

/**
 * Las fuentes estándar de pdf-lib usan WinAnsi y revientan con cualquier
 * carácter fuera de ese juego, así que sustituimos lo que no entre.
 */
const EXTRAS_WINANSI = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
])

function sanitizar(texto: string): string {
  let salida = ''
  for (const caracter of texto) {
    const codigo = caracter.codePointAt(0) ?? 0
    const soportado =
      (codigo >= 0x20 && codigo <= 0x7e) ||
      (codigo >= 0xa0 && codigo <= 0xff) ||
      EXTRAS_WINANSI.has(codigo)
    salida += soportado ? caracter : '?'
  }
  return salida
}

/** Recorta con puntos suspensivos lo que no quepa en el ancho dado. */
function recortar(texto: string, font: PDFFont, tam: number, anchoMaximo: number): string {
  if (font.widthOfTextAtSize(texto, tam) <= anchoMaximo) return texto
  let corto = texto
  while (corto.length > 1 && font.widthOfTextAtSize(corto + '...', tam) > anchoMaximo) {
    corto = corto.slice(0, -1)
  }
  return corto + '...'
}

function escribir(page: PDFPage, texto: string, x: number, y: number, font: PDFFont, tam: number, color = TINTA) {
  page.drawText(texto, { x, y, size: tam, font, color })
}

function escribirDerecha(page: PDFPage, texto: string, derecha: number, y: number, font: PDFFont, tam: number, color = TINTA) {
  escribir(page, texto, derecha - font.widthOfTextAtSize(texto, tam), y, font, tam, color)
}

function escribirCentrado(page: PDFPage, texto: string, y: number, font: PDFFont, tam: number, color = TINTA) {
  escribir(page, texto, (A4[0] - font.widthOfTextAtSize(texto, tam)) / 2, y, font, tam, color)
}

/**
 * pdf-lib no sabe de interletraje, así que las versalitas de las cabeceras se
 * dibujan letra a letra, como el `letter-spacing` de la página.
 */
function escribirEspaciado(
  page: PDFPage,
  texto: string,
  x: number,
  y: number,
  font: PDFFont,
  tam: number,
  espaciado: number,
  color = SUAVE,
) {
  let avance = x
  for (const caracter of texto) {
    escribir(page, caracter, avance, y, font, tam, color)
    avance += font.widthOfTextAtSize(caracter, tam) + espaciado
  }
}

function filete(page: PDFPage, y: number, color = LINEA, grosor = 0.5) {
  page.drawLine({
    start: { x: MARGEN_X, y },
    end: { x: MARGEN_X + ANCHO_TABLA, y },
    thickness: grosor,
    color,
  })
}

async function embeberFuentes(pdf: PDFDocument): Promise<Fuentes> {
  return {
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    texto: await pdf.embedFont(StandardFonts.Helvetica),
  }
}

/** Portada: título en serif, filete corto y subtítulo apagado. */
function dibujarPortada(page: PDFPage, opciones: OpcionesPdf, fuentes: Fuentes) {
  const titulo = sanitizar(opciones.titulo.trim())
  if (titulo) escribirCentrado(page, titulo, 500, fuentes.serif, TAM_TITULO)

  const centro = A4[0] / 2
  page.drawLine({
    start: { x: centro - 26, y: 484 },
    end: { x: centro + 26, y: 484 },
    thickness: 0.75,
    color: LINEA_FUERTE,
  })

  const subtitulo = sanitizar(opciones.subtitulo.trim())
  if (subtitulo) escribirCentrado(page, subtitulo, 461, fuentes.texto, TAM_SUBTITULO, SUAVE)
}

/** Cabecera de la tabla, entre dos filetes. Devuelve el tope de la primera fila. */
function dibujarCabecera(page: PDFPage, yTope: number, fuentes: Fuentes): number {
  filete(page, yTope, LINEA_FUERTE, 0.75)
  const baseY = yTope - 14
  escribirEspaciado(page, 'CONCEPTO', X_CONCEPTO, baseY, fuentes.texto, TAM_CABECERA, ESPACIADO_CABECERA)
  escribirEspaciado(page, 'FECHA', X_FECHA, baseY, fuentes.texto, TAM_CABECERA, ESPACIADO_CABECERA)
  // El ancho crece con el interletraje: hay que descontarlo para cuadrar a la derecha.
  const anchoImporte =
    fuentes.texto.widthOfTextAtSize('IMPORTE', TAM_CABECERA) + ESPACIADO_CABECERA * 'IMPORTE'.length
  escribirEspaciado(
    page,
    'IMPORTE',
    X_IMPORTE_DERECHA - anchoImporte,
    baseY,
    fuentes.texto,
    TAM_CABECERA,
    ESPACIADO_CABECERA,
  )

  const nuevoTope = yTope - 22
  filete(page, nuevoTope, LINEA_FUERTE, 0.75)
  return nuevoTope
}

function dibujarFila(page: PDFPage, yTope: number, movimiento: Movimiento, fuentes: Fuentes): number {
  const baseY = yTope - 14
  const concepto = recortar(
    sanitizar(movimiento.concepto),
    fuentes.texto,
    TAM_FILA,
    X_FECHA - X_CONCEPTO - 14,
  )
  escribir(page, concepto, X_CONCEPTO, baseY, fuentes.texto, TAM_FILA)
  escribir(page, sanitizar(movimiento.fechaTexto), X_FECHA, baseY, fuentes.texto, TAM_FILA, SUAVE)
  escribirDerecha(page, sanitizar(movimiento.importeTexto), X_IMPORTE_DERECHA, baseY, fuentes.texto, TAM_FILA)

  const nuevoTope = yTope - ALTO_FILA
  filete(page, nuevoTope)
  return nuevoTope
}

/**
 * Página separadora, con el mismo aire que la portada pero sin subtítulo.
 * Va entre la tabla y las facturas para que se vea dónde empieza cada parte.
 */
export async function anadirPortadilla(pdf: PDFDocument, titulo: string) {
  const fuentes = await embeberFuentes(pdf)
  dibujarPortada(pdf.addPage(A4), { titulo, subtitulo: '' }, fuentes)
}

/**
 * Crea el documento con la portada y la tabla de ingresos paginada.
 * Devuelve el PDFDocument para que merge.ts le añada las facturas detrás.
 */
export async function crearDocumentoIngresos(
  movimientos: Movimiento[],
  opciones: OpcionesPdf,
): Promise<PDFDocument> {
  const pdf = await PDFDocument.create()
  const fuentes = await embeberFuentes(pdf)

  dibujarPortada(pdf.addPage(A4), opciones, fuentes)

  let page = pdf.addPage(A4)
  let yTope = dibujarCabecera(page, Y_TOPE_TABLA, fuentes)

  for (const movimiento of movimientos) {
    if (yTope - ALTO_FILA < MARGEN_INFERIOR) {
      page = pdf.addPage(A4)
      yTope = dibujarCabecera(page, Y_TOPE_TABLA, fuentes)
    }
    yTope = dibujarFila(page, yTope, movimiento, fuentes)
  }

  return pdf
}
