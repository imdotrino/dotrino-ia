/**
 * init-docker.js — genera el andamiaje Docker (opcional) para correr el agente
 * AISLADO, sin clonar el repo. Lo usa el comando `dotrino-ia-agent init-docker`.
 *
 * Copia las plantillas de `templates/` al directorio destino con sus nombres reales
 * (con punto), inyecta la versión de ESTE agente en el Dockerfile, y crea las
 * carpetas de volúmenes `data/` y `workspace/` (así Docker no las crea como root).
 * No pisa archivos existentes salvo `--force`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

function agentVersion () {
  try { return JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8')).version }
  catch { return 'latest' }
}

// plantilla en templates/  →  nombre real que se escribe en el destino
const FILES = {
  Dockerfile: 'Dockerfile',
  'docker-compose.yml': 'docker-compose.yml',
  'env.example': '.env.example',
  gitignore: '.gitignore',
  dockerignore: '.dockerignore'
}
const DIRS = ['data', 'workspace'] // volúmenes montados (evita que Docker los cree como root)

/**
 * Escribe el andamiaje en `targetDir`.
 * @returns {{ written:string[], skipped:string[], dirs:string[], targetDir:string, version:string }}
 */
export function scaffold (targetDir = '.', { force = false } = {}) {
  const version = agentVersion()
  fs.mkdirSync(targetDir, { recursive: true })
  const written = []; const skipped = []
  for (const [src, dest] of Object.entries(FILES)) {
    const out = path.join(targetDir, dest)
    if (fs.existsSync(out) && !force) { skipped.push(dest); continue }
    let content = fs.readFileSync(path.join(HERE, 'templates', src), 'utf8')
    content = content.replace(/__IA_AGENT_VERSION__/g, version)
    fs.writeFileSync(out, content)
    written.push(dest)
  }
  for (const d of DIRS) fs.mkdirSync(path.join(targetDir, d), { recursive: true })
  return { written, skipped, dirs: DIRS, targetDir, version }
}

export default { scaffold }
