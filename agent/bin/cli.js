#!/usr/bin/env node
/**
 * dotrino-ia-agent — agente de Dotrino IA.
 *
 *   dotrino-ia-agent            enlaza (si falta) y CORRE el agente
 *   dotrino-ia-agent enroll     re-enlaza (sobrescribe) y corre el agente
 *   opciones: [--label <nombre>] [--proxy <wss://…>] [--dir <ruta>]
 *
 * El agente es un dispositivo enrolado del vault (label 'ia-agent'): puede vivir en
 * cualquier máquina y aparece solo en ia.dotrino.com para chatear con tus IAs
 * (Claude, OpenCode…). Con un solo comando queda enlazado y sirviendo.
 */
import readline from 'node:readline'
import path from 'node:path'
import { startIaAgent } from '../index.js'
import { enroll, parseQr, loadLink, dataDir } from '@dotrino/remote-agent/link'

const args = process.argv.slice(2)
const cmd = args[0] && !args[0].startsWith('-') ? args[0] : 'run'
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }

function ask (q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a) }))
}

if (args.includes('-h') || args.includes('--help')) {
  console.log(`uso:
  dotrino-ia-agent                       enlaza esta máquina (si falta) y corre el agente
  dotrino-ia-agent enroll                re-enlaza (sobrescribe) y corre el agente
  dotrino-ia-agent enroll --enroll-only  enrola y SALE (produce el link.json para correrlo
                                         aparte, p. ej. dentro de Docker)
  dotrino-ia-agent init-docker [dir]     escribe el andamiaje Docker (Dockerfile, compose,
                                         .env.example) para correr el agente AISLADO, sin
                                         clonar el repo. [dir] por defecto: el actual
  opciones: [--label <nombre>] [--proxy <wss://…>] [--dir <ruta>] [--force]

Sin terminal interactiva (Docker -d, systemd, pm2): enrolar no se puede. Si ya hay
enlace, corre; si no, avisa y sale. Enrola antes en una terminal y monta el link.json.

datos en ${dataDir('dotrino-ia-agent')} (override DOTRINO_REMOTE_AGENT_DIR)`)
  process.exit(0)
}

// `init-docker [dir]`: escribe el andamiaje Docker sin clonar el repo, y SALE.
if (cmd === 'init-docker') {
  const target = (args[1] && !args[1].startsWith('-')) ? args[1] : (opt('--dir') || '.')
  const { scaffold } = await import('../init-docker.js')
  const { written, skipped, dirs, targetDir, version } = scaffold(target, { force: args.includes('--force') })
  console.log(`Andamiaje Docker de Dotrino IA (agente ${version}) en ${path.resolve(targetDir)}\n`)
  if (written.length) console.log('  creados:   ' + written.join(', '))
  if (skipped.length) console.log('  omitidos (ya existían; usa --force para sobrescribir):   ' + skipped.join(', '))
  console.log('  carpetas:  ' + dirs.map((d) => d + '/').join(', '))
  console.log(`
Siguientes pasos${targetDir === '.' ? '' : ` (desde ${targetDir}/)`}:
  1) Pon tu token de Claude:  cp .env.example .env  &&  edita .env
  2) Enrola AFUERA (produce ./data/link.json):
       npx @dotrino/ia-agent enroll --enroll-only --dir ./data
  3) Apunta el volumen ./workspace a tu proyecto en docker-compose.yml
  4) Corre:  docker compose up -d
`)
  process.exit(0)
}

async function doEnroll (dir, label) {
  console.log('Enlazar esta máquina con tu vault.')
  console.log('El código lo generas en tu bóveda. Hay dos formas:')
  console.log('  · Sin vault externo → abre https://profile.dotrino.com/myvault,')
  console.log('    activa la bóveda y pulsa "Generar código de emparejamiento"; copia el código.')
  console.log('  · Con vault en un PC → ahí corre `dotrino-vault pair` y copia el QR/JSON.\n')
  const text = await ask('Pega el código y Enter:\n> ')
  const qr = parseQr(text)
  console.log('\nConectando…')
  await enroll({
    qr,
    dir,
    label,
    onChallenge: ({ deviceId, code }) => {
      console.log('\n  Escribe ESTE código en tu bóveda para aprobar esta máquina:')
      console.log(`    código: ${code}`)
      console.log(`    máquina: ${deviceId}`)
      console.log('    (en profile.dotrino.com/myvault escríbelo en el campo y pulsa "Aprobar";')
      console.log(`     en el PC del vault:  dotrino-vault approve ${code})\n`)
      console.log('  Esperando aprobación…')
    }
  })
  console.log('\n  ✓ Máquina enlazada.\n')
}

try {
  const dir = opt('--dir')
  const label = opt('--label') || 'ia-agent'
  const enrollOnly = args.includes('--enroll-only')
  // El comando por defecto enrola SOLO si aún no está enlazada; `enroll` fuerza
  // re-enrolar (sobrescribe) aunque ya lo esté.
  if (cmd === 'enroll' || !loadLink(dir)) {
    // Enrolar es INTERACTIVO (pegas el código y apruebas el SAS): necesita una
    // terminal. Sin TTY (Docker -d, systemd, pm2) no se puede: en vez de colgarse
    // leyendo un stdin inexistente, avisamos y salimos. El modelo correcto para
    // Docker es enrolar AFUERA y montar el link.json ya enrolado.
    if (!process.stdin.isTTY) {
      console.error('No estás enrolado y no hay terminal interactiva para hacerlo.')
      console.error('Enrola antes en una terminal y monta el link.json resultante:')
      console.error('  npx @dotrino/ia-agent enroll --enroll-only --dir <carpeta>')
      console.error(`El enlace vive en ${dataDir('dotrino-ia-agent')} (o DOTRINO_REMOTE_AGENT_DIR); monta esa carpeta en el contenedor.`)
      process.exit(1)
    }
    if (cmd === 'enroll' && loadLink(dir)) console.log('Re-enlazando esta máquina (sobrescribe el enlace actual).\n')
    await doEnroll(dir, label)
    // `--enroll-only`: enrola y SALE (para producir el link afuera y correrlo aparte).
    if (enrollOnly) {
      console.log('  Listo: el enlace quedó guardado. Ya puedes correr el agente con ese link.json (p. ej. dentro de Docker).\n')
      process.exit(0)
    }
    console.log('  Levantando el agente…\n')
  }

  const agent = await startIaAgent({
    dir, proxyUrl: opt('--proxy'),
    onRevoked: () => { console.log('  Esta máquina fue revocada desde tu bóveda. Para reconectarla, vuelve a enrolarla.\n'); process.exit(0) }
  })
  console.log('\n  Dotrino IA — agente activo')
  console.log('  máquina:', agent.machineId)
  console.log('  aparece solo en ia.dotrino.com\n')
  // Mantener vivo el servicio aunque stdin no sea una TTY (systemd/pm2/`nohup </dev/null`):
  // los sockets del proxy están `unref`'d, así que sin este keep-alive el proceso saldría
  // justo después de arrancar. Vive hasta SIGINT/SIGTERM (o auto-borrado por revocación).
  const keepAlive = setInterval(() => {}, 1 << 30)
  const bye = () => { clearInterval(keepAlive); agent.close(); process.exit(0) }
  process.on('SIGINT', bye); process.on('SIGTERM', bye)
} catch (e) {
  console.error('error:', e.message)
  process.exit(1)
}
