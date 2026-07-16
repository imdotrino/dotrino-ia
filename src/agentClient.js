/**
 * agentClient.js — cliente de chat con un agente de IA, sobre `@dotrino/remote-agent`.
 *
 * Envuelve `RemoteAgentClient` (que hace handshake E2E + transporte por el proxy) y
 * expone la semántica de chat: `sendMsg(text)` y callbacks `onToken`/`onTool`/`onDone`/
 * `onError`. Los payloads de dominio son los del protocolo `ia.*` (ver PLAN.md §6):
 *   cliente → agente: { type:'msg', text, ... }
 *   agente → cliente: { type:'tok'|'tool'|'done'|'error', ... }
 */
import { RemoteAgentClient } from '@dotrino/remote-agent/client'

export class IaAgentClient {
  constructor (link, { agentPubkey, proxyUrl } = {}) {
    this.rc = new RemoteAgentClient(link, { agentPubkey, proxyUrl })
    this.agentPubkey = agentPubkey
    this.onToken = () => {}
    this.onTool = () => {}
    this.onDone = () => {}
    this.onError = () => {}
  }

  async connect () {
    await this.rc.connect()
    this.rc.on('message', (p) => {
      if (!p || typeof p !== 'object') return
      if (p.type === 'tok') this.onToken(p.text, p.final, p.seq)
      else if (p.type === 'tool') this.onTool(p)
      else if (p.type === 'done') this.onDone(p)
      else if (p.type === 'error') this.onError(new Error(p.message || p.error || 'error del agente'))
    })
    this.rc.on('error', (e) => this.onError(e))
    return this
  }

  sendMsg (text, opts = {}) { return this.rc.send({ type: 'msg', text, ...opts }) }
  approve (toolCallId, ok) { return this.rc.send({ type: 'tool.approve', id: toolCallId, ok }) }
  ping () { return this.rc.ping() }
  close () { return this.rc.close() }
}

export default { IaAgentClient }
