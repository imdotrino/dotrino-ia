/**
 * init-podman.js — genera el andamiaje Podman (opcional) para correr el agente
 * AISLADO, sin clonar el repo. Lo usa el comando `dotrino-ia-agent init-podman`.
 * La copia la hace scaffold.js; aquí solo va la lista de plantillas.
 */
import { scaffold as write } from './scaffold.js'

// plantilla en templates/  →  nombre real que se escribe en el destino
const FILES = {
  Containerfile: 'Containerfile',
  'compose.yaml': 'compose.yaml',
  'env.example': '.env.example',
  gitignore: '.gitignore',
  containerignore: '.containerignore'
}
const DIRS = ['data', 'workspace'] // volúmenes montados

export function scaffold (targetDir = '.', opts = {}) {
  return write(targetDir, opts, { files: FILES, dirs: DIRS })
}

export default { scaffold }
