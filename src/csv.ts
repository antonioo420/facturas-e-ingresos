/** Un movimiento del extracto bancario, ya normalizado. */
export interface Movimiento {
  concepto: string
  fecha: Date | null
  /** La fecha tal cual venía en el CSV (dd/mm/yyyy), que es lo que va al PDF. */
  fechaTexto: string
  importe: number
  /** El importe tal cual venía en el CSV (30,00EUR), que es lo que va al PDF. */
  importeTexto: string
  incluido: boolean
}

export interface ExtractoParseado {
  /** Los movimientos positivos, en el orden original del fichero. */
  ingresos: Movimiento[]
  /** Movimientos totales leídos, incluidos los gastos descartados. */
  totalMovimientos: number
}

/**
 * Un importe positivo no basta: las devoluciones de compras y las
 * prestaciones también lo son. Un ingreso de verdad lleva además una de
 * estas palabras en el concepto.
 */
export const PALABRAS_INGRESO = ['bizum', 'transfer', 'ingreso cajero', 'traspaso']

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/**
 * Decodifica el fichero como UTF-8 y, si aparece el carácter de reemplazo,
 * reintenta como windows-1252: los extractos bancarios suelen venir en latin1.
 */
function decodificar(buffer: ArrayBuffer): string {
  // Se construye en vez de escribirse literal: el propio carácter de
  // reemplazo dentro del código confunde a algunas herramientas.
  const reemplazo = String.fromCharCode(0xfffd)
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  if (!utf8.includes(reemplazo)) return utf8
  return new TextDecoder('windows-1252').decode(buffer)
}

/** Elige el separador contando ocurrencias en la cabecera. */
function detectarSeparador(cabecera: string): string {
  const candidatos = [';', ',', '\t', '|']
  let mejor = ';'
  let maximo = 0
  for (const sep of candidatos) {
    const veces = cabecera.split(sep).length - 1
    if (veces > maximo) {
      maximo = veces
      mejor = sep
    }
  }
  return mejor
}

/** Parte una línea respetando las comillas dobles. */
function partirLinea(linea: string, sep: string): string[] {
  const campos: string[] = []
  let actual = ''
  let entreComillas = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (entreComillas) {
      if (c === '"') {
        if (linea[i + 1] === '"') {
          actual += '"'
          i++
        } else {
          entreComillas = false
        }
      } else {
        actual += c
      }
    } else if (c === '"') {
      entreComillas = true
    } else if (c === sep) {
      campos.push(actual.trim())
      actual = ''
    } else {
      actual += c
    }
  }
  campos.push(actual.trim())
  return campos
}

/** Minúsculas y sin acentos, para comparar nombres de columna. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * "30,00EUR" -> 30 | "-1.234,56 EUR" -> -1234.56
 * Si solo hay un separador se asume decimal; si hay punto y coma, el punto es
 * de millares (formato español).
 */
export function parsearImporte(texto: string): number {
  let limpio = texto.replace(/[^\d,.\-]/g, '')
  const negativo = limpio.startsWith('-')
  limpio = limpio.replace(/-/g, '')
  const tienePunto = limpio.includes('.')
  const tieneComa = limpio.includes(',')
  if (tienePunto && tieneComa) {
    limpio = limpio.replace(/\./g, '').replace(',', '.')
  } else if (tieneComa) {
    limpio = limpio.replace(',', '.')
  }
  const valor = parseFloat(limpio)
  if (Number.isNaN(valor)) return NaN
  return negativo ? -valor : valor
}

/** "30/06/2026" -> Date. Acepta también yyyy-mm-dd. */
export function parsearFecha(texto: string): Date | null {
  const conBarras = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (conBarras) {
    const [, d, m, a] = conBarras
    const anio = a.length === 2 ? 2000 + Number(a) : Number(a)
    const fecha = new Date(anio, Number(m) - 1, Number(d))
    return Number.isNaN(fecha.getTime()) ? null : fecha
  }
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const [, a, m, d] = iso
    return new Date(Number(a), Number(m) - 1, Number(d))
  }
  return null
}

/**
 * ¿El concepto contiene alguna de las palabras clave? Sin distinguir
 * mayúsculas ni acentos. Con la lista vacía entra todo lo positivo.
 */
export function coincideConPalabras(concepto: string, palabras: string[]): boolean {
  const utiles = palabras.map(normalizar).filter((palabra) => palabra !== '')
  if (utiles.length === 0) return true
  const limpio = normalizar(concepto)
  return utiles.some((palabra) => limpio.includes(palabra))
}

/** Localiza las columnas por nombre, con respaldo posicional. */
function localizarColumnas(cabecera: string[]): { concepto: number; fecha: number; importe: number } {
  const normalizada = cabecera.map(normalizar)
  const buscar = (...claves: string[]) =>
    normalizada.findIndex((columna) => claves.some((clave) => columna.includes(clave)))

  const concepto = buscar('concepto', 'descripcion', 'detalle')
  const fecha = buscar('fecha')
  // Buscamos "importe" antes que "saldo": las dos son columnas de dinero.
  const importe = buscar('importe', 'cantidad', 'cargo')

  return {
    concepto: concepto >= 0 ? concepto : 0,
    fecha: fecha >= 0 ? fecha : 1,
    importe: importe >= 0 ? importe : 2,
  }
}

/**
 * Lee el extracto y se queda con los movimientos de importe positivo. Los que
 * además coinciden con las palabras clave entran marcados; el resto se listan
 * desmarcados, para que se vea lo que se queda fuera en lugar de perderlo.
 */
export function parsearExtracto(
  buffer: ArrayBuffer,
  palabras: string[] = PALABRAS_INGRESO,
): ExtractoParseado {
  const texto = decodificar(buffer).replace(/^﻿/, '')
  const lineas = texto.split(/\r?\n/).filter((linea) => linea.trim() !== '')
  if (lineas.length < 2) {
    throw new Error('El CSV está vacío o solo tiene la cabecera.')
  }

  const separador = detectarSeparador(lineas[0])
  const cabecera = partirLinea(lineas[0], separador)
  const columnas = localizarColumnas(cabecera)

  const ingresos: Movimiento[] = []
  let totalMovimientos = 0

  for (const linea of lineas.slice(1)) {
    const campos = partirLinea(linea, separador)
    const importeTexto = campos[columnas.importe] ?? ''
    const importe = parsearImporte(importeTexto)
    if (Number.isNaN(importe)) continue

    totalMovimientos++
    if (importe <= 0) continue

    const fechaTexto = campos[columnas.fecha] ?? ''
    const concepto = campos[columnas.concepto] ?? ''
    ingresos.push({
      concepto,
      fecha: parsearFecha(fechaTexto),
      fechaTexto,
      importe,
      importeTexto,
      incluido: coincideConPalabras(concepto, palabras),
    })
  }

  return { ingresos, totalMovimientos }
}

/**
 * Subtítulo de la portada: los meses presentes en los movimientos, en orden
 * cronológico. Con un trimestre normal sale "Abril - Mayo - Junio".
 */
export function describirPeriodo(movimientos: Movimiento[]): string {
  const conFecha = movimientos.filter((m): m is Movimiento & { fecha: Date } => m.fecha !== null)
  if (conFecha.length === 0) return ''

  const claves = new Set<string>()
  for (const m of conFecha) {
    claves.add(`${m.fecha.getFullYear()}-${String(m.fecha.getMonth()).padStart(2, '0')}`)
  }

  const ordenadas = [...claves].sort()
  const nombres = ordenadas.map((clave) => MESES[Number(clave.split('-')[1])])
  // Si el periodo cruza de año, añadimos el año para que no se confunda.
  const anios = new Set(ordenadas.map((clave) => clave.split('-')[0]))
  if (anios.size > 1) {
    return ordenadas
      .map((clave) => `${MESES[Number(clave.split('-')[1])]} ${clave.split('-')[0]}`)
      .join(' - ')
  }
  return nombres.join(' - ')
}
