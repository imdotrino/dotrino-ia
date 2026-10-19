/**
 * scaffold.js — lo común de `init-podman` e `init-docker`: copia las plantillas de
 * `templates/` al directorio destino con sus nombres reales (con punto), inyecta la
 * versión de ESTE agente y crea las carpetas de volúmenes (así el motor de
 * contenedores no las crea con otro dueño). No pisa archivos existentes salvo `force`.
 * Cada init solo dice qué plantillas lleva.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export function agentVersion () {
  return JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8')).version
}

/**
 * Escribe el andamiaje en `targetDir`.
 * @param {string} targetDir
 * @param {{ force?: boolean }} opts
 * @param {{ files: Record<string,string>, dirs: string[] }} layout  plantilla → nombre real; carpetas a crear
 * @returns {{ written:string[], skipped:string[], dirs:string[], targetDir:string, version:string }}
 */
export function scaffold (targetDir, { force = false } = {}, { files, dirs }) {
  const version = agentVersion()
  fs.mkdirSync(targetDir, { recursive: true })
  const written = []; const skipped = []
  for (const [src, dest] of Object.entries(files)) {
    const out = path.join(targetDir, dest)
    if (fs.existsSync(out) && !force) { skipped.push(dest); continue }
    let content = fs.readFileSync(path.join(HERE, 'templates', src), 'utf8')
    content = content.replace(/__IA_AGENT_VERSION__/g, version)
    fs.writeFileSync(out, content)
    written.push(dest)
  }
  for (const d of dirs) fs.mkdirSync(path.join(targetDir, d), { recursive: true })
  return { written, skipped, dirs, targetDir, version }
}
