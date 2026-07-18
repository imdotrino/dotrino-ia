# Checklist `dotrino-ia`

> Accionable y tachable por fases. Mirá aquí el estado; el detalle de diseño está en
> `PLAN.md`. Marcar `[x]` solo cuando el paso esté **hecho y verificado**.

## 0. Plan + repo (setup inicial)

- [x] Escribir `PLAN.md` (autosuficiente)
- [x] Escribir `CHECKLIST.md` (este archivo)
- [x] Crear repo `imdotrino/dotrino-ia` (público) vía `gh repo create`
- [x] `git init -b main`, commit inicial con `PLAN.md` + `CHECKLIST.md`
- [x] Agregar remote `git@dotrino:imdotrino/dotrino-ia.git` (alias SSH `dotrino`)
- [x] Push a `main` → https://github.com/imdotrino/dotrino-ia (commit `6869676`)

## 1. Extracción de `@dotrino/remote-agent` (código común) — HECHO (parcial)

> Paquete creado y pusheado: https://github.com/imdotrino/dotrino-remote-agent
> Smoke test OK (los 5 entrypoints importan limpios). Faltan 2 ítems verificados abajo.

- [x] Crear repo `imdotrino/dotrino-remote-agent` + carpeta local
- [x] `package.json` con `exports`: `.` `/agent` `/client` `/link` `/discover`
- [x] Mover `dotrino-terminal/shared/e2e.js` → `@dotrino/remote-agent/e2e.js` (info string → `dotrino-remote-agent-e2e`)
- [x] Extraer `startRemoteAgent` de `terminal/agent/index.js` → `src/agent.js` (sin PTY; entrega sesiones vía `onSession`)
- [x] Extraer `AgentClient` de `terminal/src/agentClient.js` → `src/client.js` (`RemoteAgentClient` con `send(payload)`/`on('message')`)
- [x] Extraer `enroll` SAS de `terminal/agent/link.js` → `src/link.js` (`dataDir(name)` + `label` param)
- [x] Extraer descubrimiento por label de `terminal/src/main.js:401-465` → `src/discover.js` (`listAgentsByLabel`)
- [x] Generalizar el label (`terminal-agent` / `ia-agent`) como parámetro
- [x] Protocolo: constantes base `ra.*` (`HS/ACK/DATA/PING/PONG/ERROR`) en `protocol.js`; payloads de dominio libres
- [x] README del paquete con la API
- [x] **Publicar en npm** — HECHO: `@dotrino/remote-agent@0.1.0` y `@dotrino/ia-agent@0.1.0` publicadas (tag `v0.1.0` en cada repo). `npx @dotrino/ia-agent enroll/run` disponible. (La propagación de lectura del CDN puede tardar 1–2 min tras publicar; si `npx` da 404, reintenta en un par de minutos.)
- [ ] Migrar `dotrino-terminal` a consumir `@dotrino/remote-agent` (sin cambiar comportamiento) — tarea **verificable aparte** (requiere probar terminal con vault+proxy reales; no bloquea a ia, que consume el paquete desde F0)
- [ ] Verificar que terminal sigue funcionando igual (probar handshake + una consola)

## F0 — Andamiaje de `dotrino-ia` — HECHO (falta prueba E2E manual)

> Commit `88ad83d`. Build Vite OK, smoke del agente OK. Faltan: iconos propios y la
> prueba extremo a extremo con vault+agente reales (la hace el dueño).

- [x] Copiar `dotrino-terminal/` → `dotrino-ia/` (middleware intacto)
- [x] Renombrar en `package.json` (`name: dotrino-ia`, `description`, `0.1.0`)
- [x] `index.html`: título/description/canonical/OG/Twitter/JSON-LD → `ia.dotrino.com`
- [x] `public/`: SW `CACHE = 'ia-v1'`; **iconos + `og.jpg` son PLACEHOLDER heredados de terminal** (regenerar en F6)
- [x] `public/CNAME` → `ia.dotrino.com`
- [x] `robots.txt` + `sitemap.xml` apuntando a `ia.dotrino.com`
- [x] `<dotrino-topbar>` con `support-repo="imdotrino/dotrino-ia"` + perfil
- [x] GoatCounter (cookieless, dominio por delante)
- [x] `.npmrc` endurecido + `.nojekyll`
- [x] Cambiar label a `ia-agent` (agente + `listAgentsByLabel`)
- [x] Reemplazar `node-pty` por **driver echo** (`agent/index.js`)
- [x] Reemplazar xterm por **UI de chat** (`src/main.js` + `agentClient.js`)
- [x] `npm install && npm run build` OK (30 módulos, sin errores)
- [ ] **Probar extremo a extremo** (lo hace el dueño): `dotrino-ia-agent enroll` → abrir PWA → ver el agente → chat echo
- [x] Commit + push (`88ad83d`)

## F1 — UI de chat + driver Claude (no-streaming) — HECHO (falta prueba del dueño)

> Commit `654e713`, publicado `@dotrino/ia-agent@0.2.0`. El driver lanza
> `claude -p --output-format json --resume`; el chat muestra "pensando…" hasta la
> respuesta completa. F2 lo sube a streaming real.

- [x] Renderer de chat: burbujas usuario/agente, bloques de código (de F0)
- [x] Una sesión por agente; `sessionId` lo mantiene el `ClaudeDriver` por sesión
- [x] `ClaudeDriver` con spawn `claude -p "<msg>" --output-format json --resume <sid>` (`agent/drivers/claude.js`, patrón del bot de TG)
- [x] Parsear `{result, session_id, usage}` → `session.send({type:'done', text, sessionId, tokens})`
- [x] `pensando…` mientras corre (chatScreen `setThinking`)
- [x] Recuperación de sesión inválida (borra sid y reintenta)
- [ ] Selector de `cwd`/`mode` por sesión en la UI (hoy por env: `IA_CWD`, `CLAUDE_FLAGS` → a la UI en F3)
- [ ] **Probar (dueño):** `IA_CWD=/tu/proyecto CLAUDE_FLAGS='--dangerously-skip-permissions' npx @dotrino/ia-agent` → chat desde `ia` → responde Claude
- [x] Commit + push (`654e713`, tag `v0.2.0`, npm `@dotrino/ia-agent@0.2.0`)

## F2 — Streaming real — HECHO (falta prueba del dueño)

> Commit `9949f48`, npm `@dotrino/ia-agent@0.3.0`. Streaming token a token vía CLI
> `stream-json` (sin dep SDK); el chat ya lo renderiza incremental (`onToken` de F0).
> Pendiente: botón stop/cancelar.

- [x] Migrar `ClaudeDriver` a streaming — `--output-format stream-json --verbose` y parseo de `content_block_delta`/`text_delta` (sin añadir dependencia SDK)
- [x] `onToken(tok)` → emite `ia.tok {text}` al cliente por cada delta
- [x] Backpressure: batch de tokens cada ~60 ms (no saturar el rate-limit del proxy)
- [x] Cliente: render incremental (append, ya venía de F0; `chatScreen.onToken`)
- [x] `ia.done {sessionId, tokens}` al cerrar; fallback al `result` si no hubo deltas
- [ ] Cancelar generación (botón stop → matar el driver `claude`)
- [ ] **Probar (dueño):** `IA_CWD=... CLAUDE_FLAGS='--dangerously-skip-permissions' npx @dotrino/ia-agent@0.3.0` → chat → los tokens aparecen uno a uno
- [x] Commit + push (`9949f48`, tag `v0.3.0`)

## F3 — Multi-sesión/proyecto + selector de modelo

- [ ] Lista de sesiones por agente (cada una su `cwd`, `mode`, `model`, `sessionId`)
- [ ] Persistir sesiones en `@dotrino/store` (no localStorage)
- [ ] Selector de modelo/agente por sesión (Claude / OpenCode cuando exista)
- [ ] Cambiar de sesión sin perder el handshake (o re-handshake por sesión)
- [ ] Commit + push

## F4 — Driver OpenCode

- [ ] Confirmar API de `opencode serve` + `opencode run --attach` (streaming/sesiones)
- [ ] `OpencodeDriver` implementando la interfaz `AgentDriver`
- [ ] Selector Claude/OpenCode funcional en F3
- [ ] Probar chat con OpenCode extremo a extremo
- [ ] Commit + push

## F5 — Aprobación de acciones

- [ ] `ia.tool` y `ia.diff` del agente al cliente (cada acción de tool / cambio de archivo)
- [ ] UI: tarjeta de acción con botones **Aprobar / Rechazar** (modo safe)
- [ ] Respuesta del cliente al agente (`ia.tool.approve` / `ia.tool.deny`)
- [ ] Modo auto: tools de lectura auto-aprobadas; escritura pide confirmación
- [ ] Modo yolo: sin confirmación (aviso rojo visible)
- [ ] Registrar cada acción aprobada/ejecutada en `sessions.log`
- [ ] Commit + push

## F6 — Adornos + lanzamiento

- [ ] Adjuntos (imágenes/archivos) en el chat (como `telegram-claude-bot/bot.js:96-165`)
- [ ] Historial navegable por sesión
- [ ] `/compact` de contexto (triggers por tokens y por inactividad, `bot.js:208-248`)
- [ ] `<dotrino-support>` en topbar; `<dotrino-install>` en slot end
- [ ] Bilingüe es/en completo (tuteo neutro, sin voseo)
- [ ] SEO completo (OG, Twitter, JSON-LD `DeveloperApplication`), `<meta name="commit">`
- [ ] Resolver caveat del scope `workflow` de `gh` (ver PLAN.md §12) → deploy por Actions
- [ ] Activar Pages (`build_type=workflow`) + fijar `CNAME=ia.dotrino.com` (cname al final)
- [ ] Verificar `curl https://ia.dotrino.com/` → 200 + `<meta name="commit">` correcto
- [ ] Registrar en catálogo: `dotrino-home/src/data/apps.ts` + logo en `src/assets/apps/` (cat `developers`)
- [ ] Commit + push de `dotrino-home`; verificar tarjeta en `https://dotrino.com/`
- [ ] (Opcional) TWA Android si hace falta (ver `TWA.md`)
- [ ] (Opcional) Forzar HTTPS cuando GitHub emita el cert del subdominio

## 2. Emparejador self — SUPERSEDED (migrado al iframe de identity)

> **Histórico (2026-07-16):** el modo "este dispositivo como vault" + el emparejamiento
> de agentes se centralizaron en `vault.dotrino.com/pair` (multi-page Vite en
> `dotrino-vault/web/`).
>
> **Superseeded (2026-07-18):** `/pair` fue eliminado. El daemon device-vault ahora
> vive dentro del **iframe de identity** (`id.dotrino.com`), y la UI de gestión está en
> **`profile.dotrino.com/#myvault`** (activar, QR+SAS, listar/revocar). ia y terminal
> derivan su botón self a `profile.dotrino.com/?back=<origin>#myvault`. Detalle del
> pivot en `PLAN.md` §13 y commits en `dotrino-identity` (fases 1-3), `dotrino_profile`
> (fase 3), `dotrino-ia`/`dotrino-terminal` (fase 4) y `dotrino-vault` (fase 5: borrado).

- [x] ~~`vault.dotrino.com/pair`~~ → eliminado (fase 5). La UI equivalente vive en `profile.dotrino.com/#myvault`.
- [x] ~~`dotrino-ia`: botón self abre `/pair`~~ → ahora abre `profile.dotrino.com/#myvault` (fase 4).
- [x] ~~`dotrino-terminal`: botón self deriva a `/pair`~~ → ahora a `profile.dotrino.com/#myvault` (fase 4).
- [x] El daemon self-vault ya NO requiere mantener `vault.dotrino.com/pair` abierta: vive en el iframe de identity (`navigator.locks` por pestaña visible).
- [ ] Verificación E2E del dueño: en ia/terminal elegir self → abre `profile.dotrino.com/#myvault` → activa + enlaza agente → vuelve y lo ve.
  - Revisión de código (2026-07-18): la cadena a nivel de app es coherente (goSelf,
    `?back=`, formato del código base64url en `parseQr`/`normalizeQr`, eco-de-SAS,
    los 10 `selfVault*` de `@dotrino/identity@0.22.1`, `listAgentsByLabel`). Falta la
    prueba con hardware (daemon del iframe + proxy).
  - ⚠️ Hallazgo: **terminal** no cierra el bucle "vuelve y lo ve" — su `render()` no
    detecta self (`getSelfLink`+`listAgentsByLabel`) como sí lo hace ia (main.js:246).
    Tras enlazar por profile, terminal muestra el `choiceScreen`. Hueco preexistente
    (no lo causó quitar el `selfTerminalScreen` muerto). Completarlo = añadir la rama
    self en `render()` reusando `terminalScreen(selfLink)`.
- [x] Copy del CLI apunta a `profile.dotrino.com/#myvault` (no ia/terminal.dotrino.com):
  `@dotrino/ia-agent@0.3.2` + `@dotrino/terminal-agent@0.2.12` publicados (2026-07-18).
- [x] `dotrino-terminal`: `selfTerminalScreen` (código muerto) removido; build OK,
  desplegado (2026-07-18).
