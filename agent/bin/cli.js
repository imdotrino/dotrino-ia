#!/usr/bin/env node
/**
 * dotrino-ia-agent — agente de Dotrino IA.
 *
 *   dotrino-ia-agent [--name <n>]          enlaza (si falta) y CORRE el agente
 *   dotrino-ia-agent enroll [--name <n>]   re-enlaza (sobrescribe) y corre el agente
 *   dotrino-ia-agent list                  los agentes enlazados en esta máquina
 *   dotrino-ia-agent info [--name <n>]     qué aparato es: su ID, su bóveda, sus permisos
 *   dotrino-ia-agent update [--name <n>] [--approval on|off] [--notify on|off]
 *                                          cómo se actualiza este agente (CONVENCIONES §15)
 *
 * Cada agente tiene su NOMBRE y su enlace (`@dotrino/remote-agent/instances`), como `dotrino-env`.
 *
 * El agente es un dispositivo enrolado del vault (label 'ia-agent'): puede vivir en
 * cualquier máquina y aparece solo en ia.dotrino.com para chatear con tus IAs
 * (Claude, OpenCode…). Con un solo comando queda enlazado y sirviendo.
 */
import readline from 'node:readline'
import { createRequire } from 'node:module'
import { updatePrefsCommand, updateStatusText } from '@dotrino/update/npm'
import path from 'node:path'
import { startIaAgent } from '../index.js'
import { enroll, parseQr, loadLink } from '@dotrino/remote-agent/link'
import { resolveInstance, listInstances, lockInstance, instancesRoot } from '@dotrino/remote-agent/instances'
import { deviceInfo, formatDeviceInfo } from '@dotrino/vault/device-info'

// El tipo de este agente: el label con que arranca y la carpeta de sus enlaces.
const KIND = 'ia-agent'

const { version: VERSION } = createRequire(import.meta.url)('../package.json')
const args = process.argv.slice(2)
const cmd = args[0] && !args[0].startsWith('-') ? args[0] : 'run'
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }

function ask (q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a) }))
}

if (args.includes('-h') || args.includes('--help')) {
  console.log(`uso:
  dotrino-ia-agent [--name <n>]          enlaza este agente (si falta) y lo corre
  dotrino-ia-agent enroll [--name <n>]   re-enlaza (sobrescribe) y corre el agente
  dotrino-ia-agent list                  los agentes enlazados en esta máquina
  dotrino-ia-agent info [--name <n>]     qué aparato es: su ID (el de «dotrino-vault members»),
                                         su bóveda y sus permisos. Sin red. [--json]
  dotrino-ia-agent update [--name <n>]   cómo se actualiza este agente. Por defecto lo hace
                                         solo y avisa de que lo hizo:
                                           --approval on|off  pedir antes aprobación a tu bóveda
                                           --notify on|off    avisar cuando se actualiza
  dotrino-ia-agent enroll --enroll-only  enrola y SALE (produce el link.json para correrlo
                                         aparte, p. ej. dentro de un contenedor)
  dotrino-ia-agent init-podman [dir]     escribe el andamiaje PODMAN (Containerfile,
                                         compose.yaml, .env.example) para correr el
                                         agente AISLADO, sin clonar el repo (rootless,
                                         sin daemon). [dir] por defecto: el actual
  dotrino-ia-agent init-docker [dir]     ídem, para DOCKER (Dockerfile, docker-compose.yml)
  opciones: [--name <n>] [--proxy <wss://…>] [--dir <ruta>] [--force]

Varios agentes a la vez (uno por proyecto): dale a cada uno su --name. Cada uno se
enlaza una vez y aparece aparte en ia.dotrino.com. Claude trabaja en la carpeta desde
la que lanzas el agente (o en IA_CWD).

Sin terminal interactiva (contenedor -d, systemd, pm2): enrolar no se puede. Si ya hay
enlace, corre; si no, avisa y sale. Enrola antes en una terminal y monta el link.json.

enlaces en ${instancesRoot(KIND)}/<nombre> (override DOTRINO_AGENT_HOME; --dir o
DOTRINO_REMOTE_AGENT_DIR fuerzan una carpeta concreta, p. ej. en un contenedor)`)
  process.exit(0)
}

// `init-podman|init-docker [dir]`: escribe el andamiaje sin clonar el repo, y SALE.
function printScaffold (engine, { written, skipped, dirs, targetDir, version }, runCmd) {
  console.log(`Andamiaje ${engine} de Dotrino IA (agente ${version}) en ${path.resolve(targetDir)}\n`)
  if (written.length) console.log('  creados:   ' + written.join(', '))
  if (skipped.length) console.log('  omitidos (ya existían; usa --force para sobrescribir):   ' + skipped.join(', '))
  console.log('  carpetas:  ' + dirs.map((d) => d + '/').join(', '))
  console.log(`
Siguientes pasos${targetDir === '.' ? '' : ` (desde ${targetDir}/)`}:
  1) Pon tu token de Claude:  cp .env.example .env  &&  edita .env
  2) Enrola AFUERA (produce ./data/link.json):
       npx @dotrino/ia-agent enroll --enroll-only --dir ./data
  3) Apunta el volumen ./workspace a tu proyecto en ${engine === 'Podman' ? 'compose.yaml' : 'docker-compose.yml'}
  4) Corre:  ${runCmd}
`)
}

if (cmd === 'list') {
  const names = listInstances(KIND)
  if (!names.length) console.log('No hay ningún agente enlazado en esta máquina.')
  for (const n of names) console.log(`  ${n}   ${instancesRoot(KIND)}/${n}`)
  process.exit(0)
}

// `update`: los dos ajustes de ESTE agente (`@dotrino/update/npm`). Sin banderas, los enseña.
if (cmd === 'update') {
  let r
  try {
    const dir = opt('--dir') || process.env.DOTRINO_REMOTE_AGENT_DIR || resolveInstance(KIND, opt('--name')).dir
    // Solo las banderas de este comando: `--name`/`--dir` ya eligieron la carpeta.
    const own = args.slice(1).filter((a, i, all) => !['--name', '--dir'].includes(a) && !['--name', '--dir'].includes(all[i - 1]))
    r = updatePrefsCommand(own, { dir, lang: 'es' })
  } catch (e) { console.error('error:', e.message); process.exit(1) }
  if (!r.handled) { console.error('uso: dotrino-ia-agent update [--name <n>] [--approval on|off] [--notify on|off]'); process.exit(2) }
  ;(r.ok ? console.log : console.error)(r.text)
  process.exit(r.ok ? 0 : 2)
}

// `info`: la pieza común del ecosistema (`@dotrino/vault/device-info`). Lo que se viene a
// mirar es el ID, para buscarlo en el acta.
if (cmd === 'info') {
  try {
    const fixed = opt('--dir') || process.env.DOTRINO_REMOTE_AGENT_DIR
    const inst = fixed ? { name: null, dir: fixed } : resolveInstance(KIND, opt('--name'))
    const link = loadLink(inst.dir)
    if (!link) { console.error(`Este agente no está enlazado (${inst.dir}). Enlázalo con: dotrino-ia-agent`); process.exit(1) }
    const info = await deviceInfo(link, { kind: KIND, name: inst.name, version: VERSION, dir: inst.dir })
    // Lo pendiente de su actualización (se pidió y no se aprobó, o necesita permisos de
    // administrador), si hay algo que decir. Sin red: sale de lo apuntado en su carpeta.
    const pending = updateStatusText({ dir: inst.dir, current: VERSION, lang: 'es' })
    if (args.includes('--json')) console.log(JSON.stringify(pending ? { ...info, update: pending } : info, null, 2))
    else console.log(formatDeviceInfo(info) + (pending ? '\n' + pending : ''))
  } catch (e) { console.error('error:', e.message); process.exit(1) }
  process.exit(0)
}

if (cmd === 'init-podman' || cmd === 'init-docker') {
  const target = (args[1] && !args[1].startsWith('-')) ? args[1] : (opt('--dir') || '.')
  const force = args.includes('--force')
  if (cmd === 'init-podman') {
    const { scaffold } = await import('../init-podman.js')
    printScaffold('Podman', scaffold(target, { force }),
      `podman build -t dotrino-ia-agent . && podman run -d --restart unless-stopped \\
       --userns=keep-id --name ia-agent --env-file .env \\
       -v ./data:/data -v ./workspace:/workspace dotrino-ia-agent
     (o, si prefieres compose: podman compose up -d — ver el README para el
     socket que necesita)`)
  } else {
    const { scaffold } = await import('../init-docker.js')
    printScaffold('Docker', scaffold(target, { force }),
      `docker compose up -d
     (o sin compose: docker build -t dotrino-ia-agent . && docker run -d --restart
     unless-stopped --name ia-agent --env-file .env -v ./data:/data
     -v ./workspace:/workspace dotrino-ia-agent — ver el README)`)
  }
  process.exit(0)
}

async function doEnroll (dir) {
  console.log('Enlazar esta máquina con tu vault.')
  console.log('El código lo generas en tu bóveda. Hay dos formas:')
  console.log('  · Sin vault externo → abre https://profile.dotrino.com/myvault,')
  console.log('    activa la bóveda y pulsa "Generar código de emparejamiento"; copia el código.')
  console.log('  · Con vault en un PC → ahí corre `dotrino-vault pair` y copia el QR/JSON.\n')
  const text = await ask('Pega el código y Enter:\n> ')
  const qr = await parseQr(text)
  console.log('\nConectando…')
  await enroll({
    qr,
    dir,
    // El label del ENLACE: la app encuentra la máquina porque el agente contesta
    // `kind: 'ia-agent'` al ping, no por el nombre que le pone el dueño en el acta.
    label: 'ia-agent',
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
  // --dir (o DOTRINO_REMOTE_AGENT_DIR, el de los contenedores) manda una carpeta concreta;
  // si no, la de la instancia con su nombre.
  const fixed = opt('--dir') || process.env.DOTRINO_REMOTE_AGENT_DIR
  const inst = fixed ? { name: null, dir: fixed } : resolveInstance(KIND, opt('--name'))
  const dir = inst.dir
  // Antes de nada, también de enlazar: re-enlazar debajo de un agente que corre le cambia
  // la llave a mitad de camino.
  process.on('exit', lockInstance(dir))
  const enrollOnly = args.includes('--enroll-only')
  // El comando por defecto enrola SOLO si aún no está enlazada; `enroll` fuerza
  // re-enrolar (sobrescribe) aunque ya lo esté.
  if (cmd === 'enroll' || !loadLink(dir)) {
    // Enrolar es INTERACTIVO (pegas el código y apruebas el SAS): necesita una
    // terminal. Sin TTY (contenedor -d, systemd, pm2) no se puede: en vez de
    // colgarse leyendo un stdin inexistente, avisamos y salimos. El modelo correcto
    // para contenedores es enrolar AFUERA y montar el link.json ya enrolado.
    if (!process.stdin.isTTY) {
      console.error('No estás enrolado y no hay terminal interactiva para hacerlo.')
      console.error('Enrola antes en una terminal y monta el link.json resultante:')
      console.error('  npx @dotrino/ia-agent enroll --enroll-only --dir <carpeta>')
      console.error(`El enlace vive en ${dir} (o DOTRINO_REMOTE_AGENT_DIR); monta esa carpeta en el contenedor.`)
      process.exit(1)
    }
    if (cmd === 'enroll' && loadLink(dir)) console.log('Re-enlazando esta máquina (sobrescribe el enlace actual).\n')
    await doEnroll(dir)
    // `--enroll-only`: enrola y SALE (para producir el link afuera y correrlo aparte).
    if (enrollOnly) {
      console.log('  Listo: el enlace quedó guardado. Ya puedes correr el agente con ese link.json (p. ej. dentro de un contenedor).\n')
      process.exit(0)
    }
    console.log('  Levantando el agente…\n')
  }

  const agent = await startIaAgent({
    dir, proxyUrl: opt('--proxy'),
    onRevoked: () => { console.log('  Esta máquina fue revocada desde tu bóveda. Para reconectarla, vuelve a enrolarla.\n'); process.exit(0) }
  })
  console.log('\n  Dotrino IA — agente activo')
  console.log('  versión:', VERSION)
  if (inst.name) console.log('  nombre:', inst.name)
  console.log('  máquina:', agent.machineId)
  console.log('  trabaja en:', process.env.IA_CWD || process.cwd())
  console.log('  aparece solo en ia.dotrino.com\n')
  // §15: se actualiza solo. Mira al arrancar y una vez al día; pedir aprobación y avisar son
  // ajustes de este agente (`dotrino-ia-agent update`).
  const { startSelfUpdate } = await import('../update.js')
  const stopUpdates = startSelfUpdate({ dir, version: VERSION, agent })
  // Mantener vivo el servicio aunque stdin no sea una TTY (systemd/pm2/`nohup </dev/null`):
  // los sockets del proxy están `unref`'d, así que sin este keep-alive el proceso saldría
  // justo después de arrancar. Vive hasta SIGINT/SIGTERM (o auto-borrado por revocación).
  const keepAlive = setInterval(() => {}, 1 << 30)
  const bye = () => { clearInterval(keepAlive); stopUpdates(); agent.close(); process.exit(0) }
  process.on('SIGINT', bye); process.on('SIGTERM', bye)
} catch (e) {
  console.error('error:', e.message)
  process.exit(1)
}
