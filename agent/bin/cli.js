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
  dotrino-ia-agent            enlaza esta máquina (si falta) y corre el agente
  dotrino-ia-agent enroll     re-enlaza (sobrescribe el enlace) y corre el agente
  opciones: [--label <nombre>] [--proxy <wss://…>] [--dir <ruta>]

datos en ${dataDir('dotrino-ia-agent')} (override DOTRINO_REMOTE_AGENT_DIR)`)
  process.exit(0)
}

async function doEnroll (dir, label) {
  console.log('Enlazar esta máquina con tu vault.')
  console.log('El código lo generas en el CERTIFICADOR (tu vault). Hay dos formas:')
  console.log('  · Sin vault externo → abre https://ia.dotrino.com, elige')
  console.log('    "Usar este dispositivo como bóveda" → "Enlazar otra máquina" y copia el código.')
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
      console.log('    (en ia.dotrino.com escríbelo en el campo y pulsa "Aprobar";')
      console.log(`     en el PC del vault:  dotrino-vault approve ${code})\n`)
      console.log('  Esperando aprobación…')
    }
  })
  console.log('\n  ✓ Máquina enlazada — levantando el agente…\n')
}

try {
  const dir = opt('--dir')
  const label = opt('--label') || 'ia-agent'
  // El comando por defecto enrola SOLO si aún no está enlazada; `enroll` fuerza
  // re-enrolar (sobrescribe) aunque ya lo esté. En ambos casos, al terminar sigue
  // y LEVANTA el servicio.
  if (cmd === 'enroll' || !loadLink(dir)) {
    if (cmd === 'enroll' && loadLink(dir)) console.log('Re-enlazando esta máquina (sobrescribe el enlace actual).\n')
    await doEnroll(dir, label)
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
