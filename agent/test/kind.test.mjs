/**
 * La app encuentra este agente preguntándole QUÉ ES (`probeAgents`): el nombre que tiene
 * en el acta lo pone el dueño al emparejar y no dice nada. Si el pong dejara de decir
 * `ia-agent`, la máquina desaparecería de ia.dotrino.com sin ningún error a la vista.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { makeDeviceKey } from '@dotrino/identity/capabilities'
import { probeAgents } from '@dotrino/remote-agent/discover'
import { startIaAgent } from '../index.js'

/** Un transporte de mentira que lleva lo que se manda a los que escuchan. */
function fakeClient () {
  const handlers = []
  const c = {
    token: 'tok',
    on (ev, cb) { if (ev === 'message') handlers.push(cb); return () => handlers.splice(handlers.indexOf(cb), 1) },
    async identifyAs () {},
    send (_to, p) { for (const h of [...handlers]) h('agent', p) },
    sendByPubkey (_to, p) { setTimeout(() => { for (const h of [...handlers]) h('app', p) }, 1) },
    close () {}
  }
  return c
}

test('el agente contesta el ping diciendo que es ia-agent', async () => {
  const device = await makeDeviceKey({ label: 'ia-agent' })
  const link = { device, cert: { sub: device.publickey }, iss: device.publickey }
  const client = fakeClient()
  const agent = await startIaAgent({ link, client, quiet: true, dir: '/tmp/ia-agent-test-' + process.pid })
  const found = await probeAgents(client, [device.publickey], { timeoutMs: 200 })
  assert.equal(found.get(device.publickey)?.kind, 'ia-agent')
  agent.close()
})
