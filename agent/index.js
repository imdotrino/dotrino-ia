/**
 * @dotrino/ia-agent — agente de Dotrino IA (Node).
 *
 * Expone tus CLIs de IA (Claude, OpenCode…) al chat remoto, sobre
 * `@dotrino/remote-agent` (handshake E2E, emparejamiento con vault, revocación).
 *
 * F0: driver ECHO — devuelve el texto recibido. Sirve para validar el flujo extremo
 * a extremo (enrolamiento → descubrimiento → handshake → chat) antes de meter el
 * driver de Claude (F1). Reemplazar el cuerpo de `onSession` por el driver.
 */
import { startRemoteAgent } from '@dotrino/remote-agent/agent'

export async function startIaAgent (opts = {}) {
  return startRemoteAgent({
    label: 'ia-agent',
    proxyUrl: opts.proxyUrl,
    dir: opts.dir,
    quiet: opts.quiet,
    onReady: opts.onReady,
    onRevoked: opts.onRevoked,
    onSession (session) {
      session.on('message', async (msg) => {
        if (msg?.type === 'msg' && typeof msg.text === 'string') {
          // F0 — ECHO. F1+: session es un canal cifrado; pasalo al driver:
          //   const reply = await claudeDriver.send(msg.text, { sessionId, onToken })
          //   session.send({ type: 'done', text: reply })
          await session.send({ type: 'done', text: 'echo: ' + msg.text })
        }
      })
    }
  })
}

export default { startIaAgent }
