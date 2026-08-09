import { PDFDocument } from 'pdf-lib'

export interface Factura {
  nombre: string
  bytes: ArrayBuffer
}

export interface ResultadoFusion {
  bytes: Uint8Array
  /** Facturas que no se pudieron leer (corruptas o con contraseña). */
  omitidas: string[]
}

/**
 * Copia las páginas de cada factura, en orden, detrás del documento de
 * ingresos. Una factura ilegible se salta y se avisa de ella, en vez de
 * tirar todo el proceso.
 */
export async function anadirFacturas(
  pdf: PDFDocument,
  facturas: Factura[],
): Promise<ResultadoFusion> {
  const omitidas: string[] = []

  for (const factura of facturas) {
    try {
      const origen = await PDFDocument.load(factura.bytes, { ignoreEncryption: true })
      const paginas = await pdf.copyPages(origen, origen.getPageIndices())
      for (const pagina of paginas) pdf.addPage(pagina)
    } catch {
      omitidas.push(factura.nombre)
    }
  }

  return { bytes: await pdf.save(), omitidas }
}

/** Lanza la descarga del PDF resultante. */
export function descargar(bytes: Uint8Array, nombreArchivo: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  // Damos margen a que el navegador arranque la descarga antes de revocar.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** "Abril - Mayo - Junio" -> "ingresos_facturas_abril-mayo-junio.pdf" */
export function nombrarArchivo(subtitulo: string): string {
  const base = subtitulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return base ? `ingresos_facturas_${base}.pdf` : 'ingresos_facturas.pdf'
}
