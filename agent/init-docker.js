/**
 * init-docker.js — genera el andamiaje Docker (opcional) para correr el agente
 * AISLADO, sin clonar el repo. Lo usa el comando `dotrino-ia-agent init-docker`.
 * La copia la hace scaffold.js; aquí solo va la lista de plantillas.
 */
import { scaffold as write } from './scaffold.js'

// plantilla en templates/  →  nombre real que se escribe en el destino
const FILES = {
  Dockerfile: 'Dockerfile',
  'docker-compose.yml': 'docker-compose.yml',
  'env.example': '.env.example',
  gitignore: '.gitignore',
  dockerignore: '.dockerignore'
}
const DIRS = ['data', 'workspace'] // volúmenes montados (evita que Docker los cree como root)

export function scaffold (targetDir = '.', opts = {}) {
  return write(targetDir, opts, { files: FILES, dirs: DIRS })
}

export default { scaffold }
