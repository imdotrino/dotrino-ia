# Plan: `dotrino-ia`

> **Chat privado con tus agentes de IA** (Claude Code, OpenCode…) que corren en tu
> PC, desde el móvil. Sin Telegram, sin terceros: identidad por vault, transporte
> por proxy del ecosistema. **Es un fork conceptual de `dotrino-terminal`** donde, en
> vez de abrir un PTY, el agente lanza CLIs de IA, y la UI es un chat (no xterm).
>
> **Documento autosuficiente:** pensado para retomar la tarea en otra sesión sin
> esta conversación. Si llegás acá nuevo, leé esto entero + el `CHECKLIST.md` y
> empezá por **F0** (o por donde marque el checklist).

---

## 1. Resumen

`dotrino-ia` (subdominio **`ia.dotrino.com`**) es una PWA del ecosistema Dotrino que
te deja **conversar con los agentes de IA que corren en tu(s) PC**, desde cualquier
dispositivo. Los agentes (Claude Code, OpenCode, futuros) se **vinculan a tu vault**
igual que una máquina de `dotrino-terminal`; la app los descubre y abre un chat con
cada uno. Todo viaja **cifrado punto a punto** por `proxy.dotrino.com`; el relay solo
ve bytes cifrados.

**Por qué existe / misión:** Telegram (el `dotrino-telegram-claude-bot`) es un tercero
— rompe la promesa de privacidad de Dotrino, no streamea, ata la identidad a un chat-id
ajeno y no da control fino de sesiones. `dotrino-ia` hace lo mismo **dentro del
ecosistema**, reusando identidad + transporte + almacenamiento compartidos.

---

## 2. Decisiones de diseño (ya tomadas — no re-abrir)

Estas decisiones se acordaron con el dueño. **No volver a debatirlas** salvo cambio
explícito.

1. **Nombre y dominio:** `dotrino-ia`, subdominio `ia.dotrino.com`. (`ia` = IA,
   agnóstico al modelo: Claude hoy, OpenCode y otros mañana.)
2. **App separada de `dotrino-terminal`, NO integrada.** Razones: propósito y
   catálogo distintos (consola remota vs. chat con IA), threat model distinto (PTY
   = cualquier comando; IA = modos safe/auto/yolo + aprobación de tools), renderer
   distinto (xterm vs. UI de chat). En Dotrino **una app = un problema claro**.
3. **Middleware común extraído a un paquete** `@dotrino/remote-agent` (npm), consumido
   por terminal e ia. Es la regla de `CLAUDE.md` («si falta una característica, creá
   una herramienta compartida»). Así no se duplica el código delicado (handshake E2E,
   emparejamiento SAS, revocación).
4. **Autenticación = vinculación al vault**, exactamente como terminal. El agente se
   **empareja al vault** con código SAS; eso ES la autorización. **No** hay allowlist
   de pubkeys aparte (idea descartada). Quien controla el vault controla qué agentes
   existen.
5. **Descubrimiento = `listVaultDevices()` filtrado por label `ia-agent`**, igual que
   terminal filtra por `terminal-agent`. La UI lista los agentes vinculados y abrís
   un chat con cada uno (en terminal abrías una consola).
6. **Drivers de CLI con interfaz común** `AgentDriver`. Implementaciones iniciales:
   **Claude Code** (vía SDK `@anthropic-ai/claude-code`, no spawn crudo) y **OpenCode**
   (vía `opencode serve` + `opencode run --attach`). Agregar otro CLI = sumar un driver.
7. **Streaming de tokens por chunks discretos** sobre el proxy (que es mensajería
   discreta, no stream nativo). Mismo truco que terminal con `CMD/OUT`.
8. **Modos de permiso:** `safe` (pide aprobar editar/ejecutar en el chat), `auto`
   (autonomía de lectura), `yolo` (`--dangerously-skip-permissions`). El modo `yolo`
   lleva **advertencia roja** en la landing y la UI (como el bot de Telegram).
9. **Stack: Vite vanilla JS** (sin framework), igual que terminal. Plantilla = copia
   de `dotrino-terminal/`.

---

## 3. Arquitectura

```
┌──────────────────┐        proxy.dotrino.com (relay; solo ve cifrado)        ┌─────────────────────────┐
│   PWA chat       │ ─────────────── sendByPubkey ──────────────────────────▶ │  Agente en tu PC         │
│   ia.dotrino.com │                                                          │  @dotrino/ia-agent       │
│                  │ ◀──────── tokens en streaming (chunks cifrados) ──────── │   ├─ ClaudeDriver (SDK)  │
│  • vault         │                                                          │   └─ OpencodeDriver      │
│  • UI de chat    │                                                          │  sesión por cwd          │
│  • descubre      │                                                          │  + @dotrino/remote-agent │
│    agentes       │                                                          │    (handshake/E2E/SAS)   │
└──────────────────┘                                                          └─────────────────────────┘
```

Flujo de un mensaje:
1. La PWA descubre los agentes vinculados (`listVaultDevices()` → label `ia-agent`).
2. Abrís un chat con un agente → `AgentClient` (de `@dotrino/remote-agent`) hace el
   handshake E2E anti-MITM y levanta la clave de sesión (como terminal).
3. Escribís → el mensaje viaja cifrado por el proxy al agente.
4. El agente invoca el driver (Claude/OpenCode) con `--resume <sessionId>` en el `cwd`
   del proyecto, y **streamea** de vuelta los tokens como chunks.
5. La PWA reensambla y renderiza incremental (mensajes, markdown, diffs, tools).

---

## 4. Mapeo `dotrino-terminal` → `dotrino-ia`

Casi todo es idéntico. Solo cambian **la punta del agente** (PTY → driver IA) y **la
punta del renderer** (xterm → chat). El middleware queda intacto.

| `dotrino-terminal` | `dotrino-ia` | Notas |
|---|---|---|
| `node-pty` → `bash` (shell) | driver → `claude` / `opencode` | `agent/index.js` |
| xterm.js (render del shell) | UI de chat (mensajes + tokens + diffs) | `src/main.js` |
| `terminal.cmd` (teclas) | `ia.msg` (mensaje del usuario) | payload de dominio |
| `terminal.out` (stdout, streaming) | `ia.tok` (tokens, streaming) | payload de dominio |
| `terminal.error` | `ia.error` / `ia.tool` (acciones del agente) | payload de dominio |
| label `terminal-agent` | label `ia-agent` | filtro de descubrimiento |
| `open/input/resize/close` | `send(tok)/done/tool` | ciclo del driver |

**Queda intacto (se mueve a `@dotrino/remote-agent`):** `shared/e2e.js` (canal cifrado
isomórfico ECDH→HKDF→AES-GCM), handshake anti-MITM con `verifyChain` + anti-replay,
emparejamiento SAS (`agent/link.js`), revocación con auto-borrado, wiring proxy +
identity (`identify` firmado), autodescubrimiento por label, auditoría `sessions.log`,
handshake `HS/ACK/PING/PONG`.

### Referencias exactas en `dotrino-terminal` (para el fork)

- `src/agentClient.js:20` — constantes del protocolo `T = {HS, ACK, CMD, OUT, ERROR}`.
- `src/agentClient.js:22` — clase `AgentClient` (connect, handshake E2E, `_cmd`).
- `src/agentClient.js:68-73` — handler de mensajes entrantes (decrypt + dispatch).
- `src/agentClient.js:75-110` — handshake completo (efímera, signData, verifyChain).
- `shared/e2e.js` — `makeEphemeral/deriveKey/seal/open` (isomórfico, ~73 líneas).
- `agent/index.js:39` — `startAgent` (PTY + handshake + revocación + auditoría).
- `agent/index.js:123` — `handleHandshake` (anti-replay `ts` ±5 min, `verifyChain`).
- `agent/index.js:186` — `handleRevoked` (auto-borrado al revocar la máquina).
- `agent/link.js:63` — `enroll` (emparejamiento con código SAS aleatorio).
- `src/main.js:387` — `terminalScreen` (UI modo vault).
- `src/main.js:401-465` — autodescubrimiento (`listVaultDevices` + filtro label).
- `src/main.js:317` — `makeSessionHost` (gestor multi-consola; base del multi-chat).
- `vite.config.js:6` — plugin `commitMeta` (`<meta name="commit">`).
- `vite.config.js:25` — dedupe de `@dotrino/identity` + `@dotrino/proxy-client`.
- `agent/package.json` — modelo del paquete `@dotrino/ia-agent`.
- `package.json` — modelo de la PWA (deps del ecosistema).

---

## 5. Paquete `@dotrino/remote-agent` (código común)

Repo: `imdotrino/dotrino-remote-agent`. Carpeta local:
`/mnt/sda1/Dotrino/dotrino-remote-agent/`. Se extrae de `dotrino-terminal` (handshake,
E2E, SAS, revocación, wiring proxy/identity, descubrimiento, auditoría). Lo consumen
**terminal** (migrado, sin cambiar comportamiento) e **ia**.

**Subpath exports:**

```
@dotrino/remote-agent            → e2e + tipos de mensaje base + utilidades
@dotrino/remote-agent/agent      → startRemoteAgent()        (Node)
@dotrino/remote-agent/client     → RemoteAgentClient          (navegador)
@dotrino/remote-agent/link       → enroll / emparejamiento SAS (Node, agente)
@dotrino/remote-agent/discover   → listAgentsByLabel()        (navegador, cliente)
```

**API propuesta (borrador):**

```js
// Agente (Node) — en tu PC
import { startRemoteAgent } from '@dotrino/remote-agent/agent'
startRemoteAgent({
  label: 'ia-agent',          // o 'terminal-agent'
  proxyUrl: 'wss://proxy.dotrino.com',
  onSession: (sess) => {       // cada handshake exitoso abre una sesión cifrada
    // la app define qué hacer con cada mensaje de dominio:
    sess.on('msg', async ({ text }, reply) => { /* driver... reply.tok()/done() */ })
  }
})

// Cliente (navegador) — la PWA
import { RemoteAgentClient } from '@dotrino/remote-agent/client'
import { listAgentsByLabel } from '@dotrino/remote-agent/discover'
const agentes = await listAgentsByLabel(id, 'ia-agent')   // tarjetas en la UI
const chat = new RemoteAgentClient({ link, agentPubkey })
await chat.connect()                                       // handshake E2E
chat.onTok(t => renderAppend(t)).onTool(...).onDone(...)
chat.send('arreglá el bug en auth.js')
```

**Principio:** el paquete no sabe nada de PTY ni de IA. Solo da: canal cifrado por
sesión, despacho de mensajes de dominio, emparejamiento y revocación. Cada app pasa
sus handlers.

---

## 6. Protocolo de mensajes

Dos capas (igual que terminal):

1. **Envelope de transporte** (visible al proxy, `sid` + ciphertext):
   `{ type: 'ia.msg', sid, env }`.
2. **Payload de dominio** (dentro de `env`, cifrado AES-256-GCM con la key de sesión).

**Constantes propuestas** (prefijo `ia.`, análogo al `terminal.` de
`agentClient.js:20`):

```
HS  = 'ia.hs'        ACK = 'ia.hs.ack'      // handshake + ack (idénticos a terminal)
MSG = 'ia.msg'                              // mensaje del usuario (cliente → agente)
TOK = 'ia.tok'                              // chunk de tokens (agente → cliente, streaming)
TOOL= 'ia.tool'                             // acción del agente (llamada a tool / diff)
DONE= 'ia.done'                             // fin de respuesta: { usage, sessionId }
ERR = 'ia.error'                            // error
PING/PONG                                    // liveness (idénticos a terminal)
```

**Streaming:** el agente emite varios `TOK` con `{ sid, seq, text, final? }` para una
respuesta; el cliente reensambla en orden y renderiza incremental. Backpressure simple:
batch de tokens cada ~50 ms.

---

## 7. Drivers de CLI

Interfaz común:

```js
// drivers/base.js
export class AgentDriver {
  constructor ({ cwd, sessionId, mode /* safe|auto|yolo */, model }) {}
  async start () {}                       // arranca/adjunta la sesión
  async send (text, { onToken, onTool, onDone, onError }) {}
  get sessionId () {}
  async stop () {}
}
```

- **`ClaudeDriver`** — SDK `@anthropic-ai/claude-code`. Streaming real con callbacks,
  `resume(sessionId)`, control de tools/permisos según `mode`. Referencia de flags
  (`/compact`, límite de tokens, `--output-format`) en `dotrino-telegram-claude-bot/bot.js`.
- **`OpencodeDriver`** — `opencode serve` (headless server) levantado por el agente +
  `opencode run --attach http://localhost:PORT`. Sesiones concurrentes, streaming nativo.
- Futuros (Gemini, DeepSeek, Codex…): sumar un driver que implemente la interfaz.

---

## 8. Seguridad

- **Identidad por vault** + emparejamiento **SAS** (anti-MITM; el código no viaja). Copiar
  la postura de terminal (`agent/link.js`, `src/main.js` SAS).
- **El estar vinculado al vault es la autorización.** El agente solo atiende a
  dispositivos cuya cadena certifica la maestra pineada (`verifyChain` con
  `trustedIssuer`).
- **Modos de permiso** (safe / auto / yolo) por sesión. `yolo` = `--dangerously-skip-permissions`
  con **aviso rojo**: *quien controle tu móvil controla tu PC* (mismo copy que el bot de TG).
- **Auditoría** `sessions.log` (JSONL): cada mensaje y cada acción del agente (como terminal).
- **Sin `--dangerously-skip-permissions` por defecto.**

---

## 9. Estructura de archivos

```
dotrino-ia/                      # esta app
├── PLAN.md                      # este documento
├── CHECKLIST.md                 # checklist accionable por fases
├── index.html                   # entry Vite; topbar + <main id=app>; SEO
├── vite.config.js               # base './', commitMeta, dedupe (copia de terminal)
├── package.json                 # PWA (privada)
├── .npmrc                       # endurecido (ignore-scripts, save-exact)
├── .nojekyll
├── src/
│   ├── main.js                  # UI: choiceScreen → lista agentes → chat (i18n es/en)
│   ├── agentClient.js           # RemoteAgentClient + despacho ia.msg/ia.tok/...
│   ├── chat.js                  # renderer de chat (markdown, diffs, tools, burbujas)
│   ├── vault.js                 # enlace del dispositivo (de terminal)
│   ├── qr.js                    # QR de emparejamiento (de terminal)
│   └── style.css
├── shared/
│   └── e2e.js                   # → reexport de @dotrino/remote-agent (o copia temporal)
├── public/                      # manifest, sw.js, iconos, og.jpg, robots, sitemap, CNAME
├── agent/                       # paquete @dotrino/ia-agent (npm)
│   ├── index.js                 # startRemoteAgent({label:'ia-agent', onSession})
│   ├── drivers/{base.js, claude.js, opencode.js}
│   ├── stream.js                # batches de tokens → chunks ia.tok
│   ├── bin/cli.js               # npx @dotrino/ia-agent enroll / run
│   └── package.json
└── .github/workflows/deploy.yml # deploy Vite a Pages (build_type=workflow)

dotrino-remote-agent/            # paquete @dotrino/remote-agent (se extrae de terminal)
├── e2e.js                       # de terminal/shared/e2e.js
├── src/
│   ├── agent.js                 # startRemoteAgent (de terminal/agent/index.js)
│   ├── client.js                # RemoteAgentClient (de terminal/src/agentClient.js)
│   ├── link.js                  # emparejamiento SAS (de terminal/agent/link.js)
│   ├── discover.js              # listAgentsByLabel (de terminal/src/main.js discovery)
│   └── protocol.js              # constantes + handshake/ack/revoke
├── package.json                 # exports: ./agent ./client ./link ./discover
└── README.md
```

> **Durante F0** `shared/e2e.js` puede ser una copia temporal de terminal (para no
> bloquear el andamiaje). La meta es que viva en `@dotrino/remote-agent`.

---

## 10. Roadmap (fases)

Ver `CHECKLIST.md` para el detalle tachable. Resumen:

- **F0 — Andamiaje.** Copiar `dotrino-terminal/` → `dotrino-ia/`. Dejar middleware
  intacto. Cambiar label a `ia-agent` + filtro. Agente = driver **echo** (devuelve el
  texto recibido) para validar extremo a extremo.
- **F1 — UI de chat + driver Claude no-streaming.** Burbujas, markdown, una sesión,
  `claude -p "<msg>" --output-format json --resume <sid>` (patrón del bot de TG).
- **F2 — Streaming real.** Migrar a SDK de Claude con `onToken`; protocolo de chunks;
  render incremental.
- **F3 — Multi-sesión/proyecto + selector de modelo.** Cada agente con sus sesiones
  (cada una su `cwd`), switch Claude/OpenCode.
- **F4 — Driver OpenCode** (`opencode serve` + attach).
- **F5 — Aprobación de acciones** (tools/diffs con botones aprobar/rechazar en el chat).
- **F6 — Adornos + lanzamiento.** Adjuntos, historial, `/compact`, `<dotrino-support>`,
  registro en catálogo (`dotrino-home/src/data/apps.ts`), deploy a Pages, TWA opcional.

**Extracción de `@dotrino/remote-agent`:** idealmente **antes de F1** (al final de F0 o
principios de F1), para que ia consuma el paquete desde el inicio. Migrar terminal a
consumirlo después (no bloquea a ia). Si los tokens aprietan, F0 puede usar copia
temporal y la extracción queda primera tarea de la próxima sesión.

---

## 11. Cómo continuar esta tarea (instrucciones para retomar)

1. **Leé este `PLAN.md` entero** y el `CHECKLIST.md`. Las decisiones de la §2 **no se
   re-debaten** salvo orden explícita del dueño.
2. **Estado actual:** mirá el `CHECKLIST.md` (qué está tachado) y `git log`.
3. **Contexto técnico de terminal** (la plantilla): los reportes de exploración de
   `dotrino-terminal`, `dotrino-telegram-claude-bot`, `dotrino-tunnel` y los pilares
   `@dotrino/proxy-client` + `@dotrino/identity` viven en la sesión que creó este plan.
   Si no los tenés, volvé a explorar esos directorios (las referencias file:line de la
   §4 son el índice).
4. **Convenciones a cumplir:** `CLAUDE.md` + `CONVENCIONES-APPS.md` (raíz del
   ecosistema). Topbar, PWA, SEO, bilingüe es/en (tuteo neutro), GoatCounter,
   `<dotrino-support>`, `.npmrc`, `.nojekyll`.
5. **Regla de oro:** no reimplementar proxy/identity/store/E2E — usar los paquetes
   `@dotrino/*`. Si falta algo, extender el paquete.
6. **Al terminar cada fase:** commitear y pushear a `main` (remote
   `git@dotrino:imdotrino/dotrino-ia.git`). El push a `main` despliega en las apps Vite.

---

## 12. Caveats / riesgos conocidos

- **Scope `workflow` de `gh`:** al crear este plan, `gh auth status` (imdotrino) muestra
  solo `gist, read:org, repo` — **sin `workflow`**. El deploy por GitHub Actions
  (`build_type=workflow`, §11.3 de CONVENCIONES) podría rechazar el push del workflow.
  Solución si pasa: `gh auth refresh -h github.com -s workflow`, o caer al build por
  rama (§11.1) para F0–F5. **Resolver antes de F6** (deploy).
- **SDK de Claude (`@anthropic-ai/claude-code`):** verificar disponibilidad/versión en
  el momento de F1/F2 y su API de streaming + permisos. El spawn crudo
  (`claude -p --output-format stream-json`) es el fallback (lo usa el bot de TG).
- **`opencode serve`:** confirmar la API exacta de streaming/sesiones al llegar a F4.
