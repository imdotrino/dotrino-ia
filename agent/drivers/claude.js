/**
 * drivers/claude.js — invoca la CLI `claude` (Claude Code) en modo headless.
 *
 * F1: NO streaming. Lanza `claude -p "<texto>" --output-format json [--resume <sid>]`
 * y devuelve el resultado completo cuando termina (igual que dotrino-telegram-claude-bot).
 * F2 migrará esto al SDK (@anthropic-ai/claude-code) con onToken para streaming real.
 *
 * Memoria de sesión: guarda el `session_id` que devuelve Claude y lo pasa como
 * `--resume` en la siguiente vuelta (hilo continuo). Si la sesión se invalida,
 * arranca una nueva.
 */
import { spawn } from 'node:child_process'
import { dirname } from 'node:path'

// PATH robusto para systemd/PM2 (PATH mínimo): node + ~/.local/bin (donde vive `claude`).
const EXTRA_PATH = [dirname(process.execPath), `${process.env.HOME || ''}/.local/bin`].filter(Boolean).join(':')

export class ClaudeDriver {
  /**
   * @param {object} opts
   * @param {string} [opts.cwd]      directorio donde opera Claude (el proyecto). Default process.cwd().
   * @param {string} [opts.bin='claude']  binario a invocar.
   * @param {string[]} [opts.flags=[]]    flags extra (p. ej. ['--dangerously-skip-permissions'] para yolo).
   * @param {number} [opts.timeoutMs=0]   0 = sin límite.
   */
  constructor ({ cwd, bin = 'claude', flags = [], timeoutMs = 0 } = {}) {
    this.cwd = cwd || process.cwd()
    this.bin = bin
    this.flags = flags
    this.timeoutMs = timeoutMs
    this.sessionId = null
  }

  /** Envía un mensaje y devuelve { text, sessionId, tokens } cuando termina. */
  async send (text) {
    let out
    try {
      out = await this._run(this._args(text, this.sessionId))
    } catch (e) {
      // Sesión inválida/inexistente → empezar una nueva en vez de fallar.
      if (this.sessionId && /no conversation found|session/i.test(e.message || '')) {
        this.sessionId = null
        out = await this._run(this._args(text, null))
      } else throw e
    }
    let result = out, sid = this.sessionId, tokens = 0
    try {
      const j = JSON.parse(out)
      result = (j.result ?? out)
      sid = j.session_id || sid
      tokens = contextTokens(j)
    } catch {}
    if (sid) this.sessionId = sid
    return { text: String(result || '(sin respuesta)'), sessionId: sid, tokens }
  }

  _args (text, sid) {
    const args = ['-p', text, '--output-format', 'json', ...this.flags]
    if (sid) args.push('--resume', sid)
    return args
  }

  _run (args) {
    return new Promise((resolve, reject) => {
      // stdin cerrado para que `claude -p` no espere por él.
      const p = spawn(this.bin, args, {
        cwd: this.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PATH: `${process.env.PATH || ''}:${EXTRA_PATH}` }
      })
      let out = '', err = ''
      p.stdout.on('data', (d) => { out += d })
      p.stderr.on('data', (d) => { err += d })
      const to = this.timeoutMs > 0
        ? setTimeout(() => { try { p.kill('SIGKILL') } catch {}; reject(new Error('timeout')) }, this.timeoutMs)
        : null
      p.on('error', (e) => { if (to) clearTimeout(to); reject(new Error(`no se pudo ejecutar '${this.bin}' (¿instalado y en PATH?): ${e.message}`)) })
      p.on('close', (code) => {
        if (to) clearTimeout(to)
        if (code === 0) resolve(out)
        else reject(new Error(err.slice(0, 500) || `claude salió con código ${code}`))
      })
    })
  }
}

/** Tamaño aproximado del contexto de la última vuelta (tokens enviados). */
function contextTokens (j) {
  const u = j && j.usage
  if (!u) return 0
  return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
}

export default { ClaudeDriver }
