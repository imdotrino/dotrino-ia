/**
 * main.js — PWA de Dotrino IA.
 *
 * Estados (espejo de dotrino-terminal, cambiando consola → chat):
 *   1. choiceScreen  — elegir modo (vault externo / self). Por ahora solo vault externo.
 *   2. iaScreen      — descubre los agentes IA vinculados al vault (label 'ia-agent')
 *                      y abre un chat con cada uno.
 *   3. chatScreen    — chat con un agente (IaAgentClient sobre @dotrino/remote-agent).
 *
 * El middleware (handshake E2E, emparejamiento, revocación) lo da
 * @dotrino/remote-agent; esta app solo define el dominio (chat) y el renderer.
 */
import './style.css'
import { identity, getLink, selfModeEnabled, setSelfMode } from './vault.js'
import { IaAgentClient } from './agentClient.js'
import { listAgentsByLabel } from '@dotrino/remote-agent/discover'
import { pubkeyId, avatarDataUri } from '@dotrino/identity/capabilities'
import { createVaultReputation } from '@dotrino/reputation'

import '@dotrino/topbar'
import '@dotrino/install'
import '@dotrino/nav'

const I18N = {
  es: {
    app_title: 'IA', tagline: 'Habla con tus agentes de IA que corren en tu PC',
    choose: '¿Cómo quieres conectarte?',
    vault: 'Vault externo', vault_desc: 'Tu identidad vive en otro dispositivo (recomendado).',
    self: 'Este dispositivo como vault', self_desc: 'Tu navegador es su propio vault.',
    soon: 'Próximamente',
    self_soon: 'El modo “este dispositivo como vault” aún no está listo en IA. Usa vault externo por ahora.',
    back: 'Volver',
    link_loading: 'Cargando…', not_linked: 'Sin enlace al vault',
    not_linked_desc: 'Empareja este navegador con tu vault primero.',
    link_expired: 'Tu enlace al vault venció. Vuelve a enlazarlo.',
    pair_here: 'Emparejar en profile.dotrino.com',
    agents_loading: 'Buscando tus agentes…',
    agents_none: 'Aún no tienes agentes de IA vinculados.',
    agents_title: 'Tus agentes', agents_sub: 'Máquinas con el agente IA enrolado a tu vault.',
    setup_title: 'Instala el agente en tu PC',
    setup_body: 'En la máquina donde corren tus proyectos, ejecuta:',
    setup_s1: 'Escanea el QR del vault con el agente y tipea el código de emparejamiento.',
    setup_s2: 'El agente aparece aquí automáticamente.',
    machine_checking: 'comprobando…', machine_online: 'en línea', machine_offline: 'desconectado',
    chat_placeholder: 'Escribe un mensaje…', send: 'Enviar', you: 'tú',
    connecting: 'Conectando…', conn_fail: 'No se pudo conectar: ', thinking: 'pensando…',
    disconnected: 'Desconectado', retry: 'Reintentar'
  },
  en: {
    app_title: 'IA', tagline: 'Talk to your AI agents running on your PC',
    choose: 'How do you want to connect?',
    vault: 'External vault', vault_desc: 'Your identity lives on another device (recommended).',
    self: 'This device as vault', self_desc: 'Your browser is its own vault.',
    soon: 'Soon',
    self_soon: '“This device as vault” mode is not ready in IA yet. Use external vault for now.',
    back: 'Back',
    link_loading: 'Loading…', not_linked: 'Not linked to vault',
    not_linked_desc: 'Pair this browser with your vault first.',
    link_expired: 'Your vault link expired. Re-pair it.',
    pair_here: 'Pair at profile.dotrino.com',
    agents_loading: 'Looking for your agents…',
    agents_none: 'You have no IA agents linked yet.',
    agents_title: 'Your agents', agents_sub: 'Machines with the IA agent enrolled to your vault.',
    setup_title: 'Install the agent on your PC',
    setup_body: 'On the machine where your projects run, run:',
    setup_s1: 'Scan the vault QR with the agent and type the pairing code.',
    setup_s2: 'The agent shows up here automatically.',
    machine_checking: 'checking…', machine_online: 'online', machine_offline: 'offline',
    chat_placeholder: 'Type a message…', send: 'Send', you: 'you',
    connecting: 'Connecting…', conn_fail: 'Could not connect: ', thinking: 'thinking…',
    disconnected: 'Disconnected', retry: 'Retry'
  }
}

let lang = (document.documentElement.lang === 'en') ? 'en' : 'es'
const t = (k, ...a) => { let s = I18N[lang][k] ?? k; a.forEach((x, i) => { s = s.replace(`{${i}}`, x) }); return s }

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const app = document.getElementById('app')

// --- Topbar: identidad + reputación + idioma ---
async function wireTopbar () {
  const tb = document.getElementById('topbar')
  try {
    const id = await identity()
    const reputation = createVaultReputation({ identity: id })
    tb.identity = id
    tb.reputation = reputation
    tb.setAttribute('lang', lang)
  } catch (_) {}
  tb.addEventListener('dotrino-lang', (e) => {
    lang = e.detail?.lang === 'en' ? 'en' : 'es'
    document.documentElement.lang = lang
    try { localStorage.setItem('dotrino-lang', lang) } catch {}
    render()
  })
}

// --- Pantalla: elección de modo ---
function choiceScreen () {
  app.replaceChildren(el(`
    <section class="card">
      <h1 style="margin:.2em 0">${t('app_title')}</h1>
      <p class="status">${t('tagline')}</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px">
        <button class="primary" id="goVault">${t('vault')}<br><span class="hint">${t('vault_desc')}</span></button>
        <button class="link" id="goSelf">${t('self')} — <span class="hint">${t('self_desc')}</span></button>
      </div>
    </section>`))
  app.querySelector('#goVault').addEventListener('click', () => { setSelfMode(false); render() })
  app.querySelector('#goSelf').addEventListener('click', () => { setSelfMode(true); render() })
}

// --- Pantalla: lista de agentes descubiertos (modo vault externo) ---
async function iaScreen (link) {
  const node = el(`<section class="card">
    <div id="agents"><span class="status">${t('agents_loading')}</span></div>
    <span class="hint">${t('agents_sub')}</span>
  </section>`)
  app.replaceChildren(node)
  const box = node.querySelector('#agents')
  try {
    const list = await listAgentsByLabel(link.id, 'ia-agent')
    if (!list.length) {
      box.innerHTML = `<p class="status">${t('agents_none')}</p>
        <div class="setup"><b>${t('setup_title')}</b>
        <p class="status">${t('setup_body')}</p>
        <pre>npx @dotrino/ia-agent enroll</pre>
        <p class="status">1 · ${t('setup_s1')}</p>
        <p class="status">2 · ${t('setup_s2')}</p></div>`
      return
    }
    box.innerHTML = `<b>${t('agents_title')}</b><div class="machine-list"></div>`
    const holder = box.querySelector('.machine-list')
    for (const d of list) {
      const name = `${d.label} · ${d.deviceId}`
      const row = el(`<div class="machine-row" data-sub="${esc(d.sub)}">
        <button class="machine" data-testid="agent-item" title="${esc(d.deviceId)}">
          <span class="mdot"></span>🤖 ${esc(name)}
        </button></div>`)
      row.querySelector('.machine').addEventListener('click', () => chatScreen(link, d))
      holder.appendChild(row)
    }
  } catch (e) {
    box.innerHTML = `<span class="status">${esc(e.message)}</span>`
  }
}

// --- Pantalla: chat con un agente ---
async function chatScreen (link, agent) {
  const name = `${agent.label} · ${agent.deviceId}`
  const node = el(`<section class="card chat">
    <div class="chat-head">
      <button class="back" id="back" data-testid="chat-back">${t('back')}</button>
      <h2>🤖 ${esc(name)}</h2>
    </div>
    <div class="transcript" id="transcript" data-testid="transcript"></div>
    <div class="composer">
      <textarea id="input" rows="1" placeholder="${esc(t('chat_placeholder'))}" data-testid="composer"></textarea>
      <button class="primary" id="send" data-testid="send">${t('send')}</button>
    </div>
  </section>`)
  app.replaceChildren(node)

  const transcript = node.querySelector('#transcript')
  const input = node.querySelector('#input')
  const sendBtn = node.querySelector('#send')
  node.querySelector('#back').addEventListener('click', () => { try { client?.close() } catch {}; iaScreen(link) })

  const addMsg = (role, text, { streaming } = {}) => {
    const m = el(`<div class="msg ${role} ${streaming ? 'streaming' : ''}">${esc(text)}</div>`)
    transcript.appendChild(m)
    transcript.scrollTop = transcript.scrollHeight
    return m
  }
  const setThinking = (on) => {
    const old = transcript.querySelector('.typing')
    if (old) old.remove()
    if (on) { const t2 = el(`<div class="typing">${t('thinking')}</div>`); transcript.appendChild(t2); transcript.scrollTop = transcript.scrollHeight }
  }

  let client
  let currentAgentMsg = null
  try {
    sendBtn.disabled = true; sendBtn.textContent = t('connecting')
    client = new IaAgentClient(link, { agentPubkey: agent.sub, proxyUrl: link.proxy })
    client.onToken = (text) => {
      if (!currentAgentMsg) { setThinking(false); currentAgentMsg = addMsg('agent', '', { streaming: true }) }
      currentAgentMsg.textContent += text
      transcript.scrollTop = transcript.scrollHeight
    }
    client.onDone = (p) => {
      setThinking(false)
      if (currentAgentMsg) { currentAgentMsg.classList.remove('streaming'); currentAgentMsg = null }
      else if (p.text) addMsg('agent', p.text)
    }
    client.onError = (e) => {
      setThinking(false)
      if (currentAgentMsg) { currentAgentMsg.classList.remove('streaming'); currentAgentMsg = null }
      addMsg('agent', '⚠ ' + e.message)
    }
    await client.connect()
    sendBtn.disabled = false; sendBtn.textContent = t('send')
  } catch (e) {
    transcript.replaceChildren(el(`<div class="msg agent">${t('conn_fail')}${esc(e.message)}</div>`))
    sendBtn.textContent = t('retry'); sendBtn.disabled = false
    sendBtn.addEventListener('click', () => chatScreen(link, agent))
    return
  }

  const send = async () => {
    const text = input.value.trim()
    if (!text) return
    addMsg('user', text)
    input.value = ''; input.style.height = 'auto'
    setThinking(true); currentAgentMsg = null
    try { await client.sendMsg(text) } catch (e) { setThinking(false); addMsg('agent', '⚠ ' + e.message) }
  }
  sendBtn.addEventListener('click', send)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  })
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px' })
  input.focus()
}

// --- Render principal ---
async function render () {
  app.replaceChildren(el(`<section class="card"><span class="status">${t('link_loading')}</span></section>`))
  try {
    if (selfModeEnabled()) {
      app.replaceChildren(el(`<section class="card">
        <h2>${t('self')} <span class="hint">(${t('soon')})</span></h2>
        <p class="status">${t('self_soon')}</p>
        <p><button class="link" id="exitSelf">${t('back')}</button></p></section>`))
      app.querySelector('#exitSelf').addEventListener('click', () => { setSelfMode(false); render() })
      return
    }
    const link = await getLink()
    if (!link.paired) {
      const why = link.expired ? t('link_expired') : t('not_linked_desc')
      app.replaceChildren(el(`<section class="card">
        <b>${t('not_linked')}</b>
        <p class="status">${esc(why)}</p>
        <p><a class="primary" style="display:inline-block;text-decoration:none" href="https://profile.dotrino.com/#vault" target="_blank" rel="noopener">${t('pair_here')}</a></p>
      </section>`))
      return
    }
    await iaScreen(link)
  } catch (e) {
    app.replaceChildren(el(`<section class="card"><span class="status">${esc(e.message)}</span></section>`))
  }
}

// --- Service worker + botón instalar (§3 CONVENCIONES) ---
async function setupPWA () {
  const btn = document.getElementById('installBtn')
  if (btn) {
    let deferred
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; btn.hidden = false })
    btn.addEventListener('click', async () => { if (deferred) { await deferred.prompt(); deferred = null; btn.hidden = true } })
    window.addEventListener('appinstalled', () => { btn.hidden = true })
  }
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js')
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000)
    } catch (_) {}
  }
}

// --- Boot ---
(async () => {
  const saved = (() => { try { return localStorage.getItem('dotrino-lang') } catch { return null } })()
  if (saved === 'en' || saved === 'es') { lang = saved; document.documentElement.lang = lang }
  await wireTopbar()
  await render()
  setupPWA()
})()
