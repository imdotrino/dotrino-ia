/**
 * @dotrino/ia-agent — agente de Dotrino IA (Node).
 *
 * Expone tus CLIs de IA (Claude, OpenCode…) al chat remoto, sobre
 * `@dotrino/remote-agent` (handshake E2E, emparejamiento con vault, revocación).
 *
 * F1: driver Claude (no-streaming) — `claude -p --output-format json --resume`.
 * F2: migrar a SDK con streaming de tokens. F4: driver OpenCode.
 *
 * Configuración (env):
 *   IA_CWD         directorio donde opera Claude (default: el cwd al lanzar).
 *   CLAUDE_BIN     binario (default 'claude').
 *   CLAUDE_FLAGS   flags extra, ej. '--dangerously-skip-permissions' (modo yolo).
 *   CLAUDE_TIMEOUT segundos, 0 = sin límite.
 */
import { startRemoteAgent } from '@dotrino/remote-agent/agent'
import { ClaudeDriver } from './drivers/claude.js'

const CWD = process.env.IA_CWD || process.cwd()
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
const CLAUDE_FLAGS = (process.env.CLAUDE_FLAGS || '').split(/\s+/).filter(Boolean)
const CLAUDE_TIMEOUT = Number(process.env.CLAUDE_TIMEOUT || 0) * 1000

export async function startIaAgent (opts = {}) {
  return startRemoteAgent({
    label: 'ia-agent',
    proxyUrl: opts.proxyUrl,
    dir: opts.dir,
    quiet: opts.quiet,
    onReady: opts.onReady,
    onRevoked: opts.onRevoked,
    onSession (session) {
      // Un driver por sesión: cada chat abre su propio hilo de Claude con su contexto.
      const driver = new ClaudeDriver({ cwd: CWD, bin: CLAUDE_BIN, flags: CLAUDE_FLAGS, timeoutMs: CLAUDE_TIMEOUT })
      session.on('message', async (msg) => {
        if (msg?.type !== 'msg' || typeof msg.text !== 'string') return
        try {
          const r = await driver.send(msg.text)
          await session.send({ type: 'done', text: r.text, sessionId: r.sessionId, tokens: r.tokens })
        } catch (e) {
          await session.send({ type: 'error', message: e.message })
        }
      })
    }
  })
}

export default { startIaAgent }
