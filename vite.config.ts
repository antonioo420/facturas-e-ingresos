import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build` genera un único dist/index.html autocontenido (JS y CSS
// incrustados) para poder abrirlo con doble clic, sin servidor.
export default defineConfig({
  // GitHub Pages sirve desde /facturas-e-ingresos/, no desde la raiz del
  // dominio. Hoy no cambia nada porque el plugin lo incrusta todo, pero evita
  // rutas rotas si algun dia se quita.
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2020' },
})
