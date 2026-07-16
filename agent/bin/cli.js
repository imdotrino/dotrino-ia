#!/usr/bin/env node
/**
 * dotrino-ia-agent — CLI del agente de IA.
 *   enroll <qr-json | ->   enropa esta máquina al vault como agente 'ia-agent'
 *   run                    arranca el agente (escucha chats desde la PWA)
 */
import { enroll, parseQr, dataDir } from '@dotrino/remote-agent/link'
import { startIaAgent } from '../index.js'

const DIR = dataDir('dotrino-ia-agent')
const cmd = process.argv[2]

function readStdin () {
  return new Promise((resolve) => {
    let d = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => { d += c })
    process.stdin.on('end', () => resolve(d.trim()))
  })
}

if (cmd === 'enroll') {
  let qrText = process.argv[3]
  if (!qrText || qrText === '-') qrText = await readStdin()
  if (!qrText) { console.error('Uso: dotrino-ia-agent enroll "<qr-json>"   (o pega el QR por stdin con -)'); process.exit(1) }
  try {
    const link = await enroll({
      qr: parseQr(qrText),
      label: 'ia-agent',
      dir: DIR,
      onChallenge: ({ deviceId, code }) => console.log(`\nMáquina ${deviceId}\n  Tipeá este código en el vault: ${code}\n`)
    })
    console.log(`\n✓ Enrolado como 'ia-agent' (vault ${link.iss.slice(0, 16)}…).\n  Ahora arranca el agente: dotrino-ia-agent run\n`)
  } catch (e) { console.error('Error:', e.message); process.exit(1) }
} else if (cmd === 'run' || !cmd) {
  try {
    await startIaAgent({ dir: DIR })
    console.log('(Ctrl+C para detener)')
  } catch (e) { console.error('Error:', e.message); process.exit(1) }
} else {
  console.error('Comandos:\n  dotrino-ia-agent enroll "<qr-json>" | -\n  dotrino-ia-agent run')
  process.exit(1)
}
