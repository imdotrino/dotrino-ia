/**
 * drivers/claude.js — invoca la CLI `claude` (Claude Code) con STREAMING real.
 *
 * F2: usa `--output-format stream-json --verbose` y parsea los eventos NDJSON que
 * Claude re-emite del streaming de Anthropic. Los `content_block_delta` /
 * `text_delta` son los tokens ⇒ los pasamos a `onToken` conforme se generan.
 * El evento `result` final da `session_id`, `usage` y el texto completo (fallback).
 *
 * Memoria de sesión: `--resume <sid>` con el `session_id` del `result`. Si la sesión
 * se invalida, arranca una nueva. Mismo patrón que dotrino-telegram-claude-bot.
 */
import { spawn } from 'node:child_process'
import { dirname } from 'node:path'

// PATH robusto para systemd/PM2 (PATH mínimo): node + ~/.local/bin (donde vive `claude`).
const EXTRA_PATH = [dirname(process.execPath), `${process.env.HOME || ''}/.local/bin`].filter(Boolean).join(':')

export class ClaudeDriver {
  /**
   * @param {object} opts
   * @param {string} [opts.cwd]         directorio donde opera Claude (el proyecto).
   * @param {string} [opts.bin='claude']
   * @param {string[]} [opts.flags=[]]  flags extra (p. ej. '--dangerously-skip-permissions').
   * @param {number} [opts.timeoutMs=0] 0 = sin límite.
   */
  constructor ({ cwd, bin = 'claude', flags = [], timeoutMs = 0 } = {}) {
    this.cwd = cwd || process.cwd()
    this.bin = bin
    this.flags = flags
    this.timeoutMs = timeoutMs
    this.sessionId = null
  }

  /**
   * Envía un mensaje. `onToken(text)` recibe los tokens conforme se generan.
   * Devuelve { text, sessionId, tokens } al terminar.
   */
  async send (text, { onToken } = {}) {
    try {
      return await this._send(text, this.sessionId, onToken)
    } catch (e) {
      // Sesión inválida/inexistente → empezar una nueva en vez de fallar.
      if (this.sessionId && /no conversation found|session/i.test(e.message || '')) {
        this.sessionId = null
        return this._send(text, null, onToken)
      }
      throw e
    }
  }

  async _send (text, sid, onToken) {
    const args = ['-p', text, '--output-format', 'stream-json', '--verbose', ...this.flags]
    if (sid) args.push('--resume', sid)

    let streamed = ''
    let finalEv = null
    let stderrText = ''

    await this._runStream(args, {
      onLine (line) {
        let ev
        try { ev = JSON.parse(line) } catch { return }
        // Streaming real: deltas de texto del modelo (Anthropic content_block_delta).
        const se = ev.event
        if (ev.type === 'stream_event' && se?.type === 'content_block_delta' && se.delta?.type === 'text_delta' && se.delta.text) {
          streamed += se.delta.text
          onToken?.(se.delta.text)
          return
        }
        // Resultado final: session_id + usage (+ result como fallback de texto).
        if (ev.type === 'result') finalEv = ev
      },
      onStderr (d) { stderrText += d }
    })

    let out = streamed
    let nextSid = sid
    let tokens = 0
    if (finalEv) {
      if (!out && finalEv.result) out = String(finalEv.result)          // fallback: respuesta completa
      if (finalEv.session_id) nextSid = finalEv.session_id
      tokens = contextTokens(finalEv)
    }
    if (!out) {
      if (finalEv?.is_error) throw new Error(String(finalEv.result || 'claude reportó un error'))
      if (stderrText) throw new Error(stderrText.slice(0, 500))
      throw new Error('claude no devolvió respuesta')
    }
    if (nextSid) this.sessionId = nextSid
    return { text: out, sessionId: nextSid, tokens }
  }

  _runStream (args, { onLine, onStderr }) {
    return new Promise((resolve, reject) => {
      const p = spawn(this.bin, args, {
        cwd: this.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PATH: `${process.env.PATH || ''}:${EXTRA_PATH}` }
      })
      let buf = ''
      p.stdout.setEncoding('utf8')
      p.stdout.on('data', (d) => {
        buf += d
        const lines = buf.split('\n')
        buf = lines.pop()                         // último fragmento (posiblemente incompleto)
        for (const ln of lines) if (ln.trim()) onLine(ln)
      })
      let errBuf = ''
      p.stderr.on('data', (d) => { errBuf += d; onStderr?.(d) })
      const to = this.timeoutMs > 0
        ? setTimeout(() => { try { p.kill('SIGKILL') } catch {}; reject(new Error('timeout')) }, this.timeoutMs)
        : null
      p.on('error', (e) => { if (to) clearTimeout(to); reject(new Error(`no se pudo ejecutar '${this.bin}' (¿instalado y en PATH?): ${e.message}`)) })
      p.on('close', (code) => {
        if (to) clearTimeout(to)
        // stream-json puede escribir su 'result' final y salir 0; errores no cero ⇒ rechazar.
        if (code === 0 || code === null) resolve()
        else reject(new Error(errBuf.slice(0, 500) || `claude salió con código ${code}`))
      })
    })
  }
}

function contextTokens (ev) {
  const u = ev && ev.usage
  if (!u) return 0
  return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
}

export default { ClaudeDriver }
