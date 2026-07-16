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

## 1. Extracción de `@dotrino/remote-agent` (código común)

> Prioridad: alta. Idealmente antes de F1, para que ia lo consuma desde el inicio.
> Si los tokens aprietan, F0 puede usar copia temporal y dejar esto como primera
> tarea de la próxima sesión.

- [ ] Crear repo `imdotrino/dotrino-remote-agent` + carpeta local
- [ ] `package.json` con `exports`: `.` `/agent` `/client` `/link` `/discover`
- [ ] Mover `dotrino-terminal/shared/e2e.js` → `@dotrino/remote-agent` (raíz)
- [ ] Extraer `startRemoteAgent` de `terminal/agent/index.js` → `remote-agent/agent`
- [ ] Extraer `AgentClient` de `terminal/src/agentClient.js` → `remote-agent/client` (renombrar a `RemoteAgentClient`)
- [ ] Extraer `enroll` SAS de `terminal/agent/link.js` → `remote-agent/link`
- [ ] Extraer descubrimiento por label de `terminal/src/main.js:401-465` → `remote-agent/discover`
- [ ] Generalizar el label (`terminal-agent` / `ia-agent`) como parámetro, no hardcodeado
- [ ] Protocolo: exponer constantes base `HS/ACK/PING/PONG` + hook para msgs de dominio
- [ ] README del paquete con la API (ver §5 del PLAN.md)
- [ ] Publicar en npm (`commit → tag → npm publish`)
- [ ] Migrar `dotrino-terminal` a consumir `@dotrino/remote-agent` (sin cambiar comportamiento)
- [ ] Verificar que terminal sigue funcionando igual (probar handshake + una consola)

## F0 — Andamiaje de `dotrino-ia`

- [ ] Copiar `dotrino-terminal/` → `dotrino-ia/` (menos `.git`, `node_modules`, `dist`)
- [ ] Renombrar en `package.json` (`name`, `description`, versión `0.1.0`)
- [ ] `index.html`: título/description/canonical/OG/Twitter/JSON-LD → `ia.dotrino.com`
- [ ] `public/`: renombrar `CACHE` del SW a `ia-v1`, regenerar iconos + `og.jpg` (§10 CONVENCIONES)
- [ ] `public/CNAME` → `ia.dotrino.com`
- [ ] `robots.txt` + `sitemap.xml` apuntando a `ia.dotrino.com`
- [ ] `<dotrino-topbar>` con `support-repo="imdotrino/dotrino-ia"` + perfil
- [ ] GoatCounter (cookieless, dominio por delante)
- [ ] `.npmrc` endurecido + `.nojekyll`
- [ ] Cambiar label `terminal-agent` → `ia-agent` en agente y filtro del cliente
- [ ] Reemplazar `node-pty` del agente por **driver echo** (devuelve el texto recibido)
- [ ] Reemplazar xterm por UI mínima (input + área de texto) que renderice el echo
- [ ] `npm install && npm run build` (verifica que compila)
- [ ] Probar extremo a extremo: enrolar agente → descubrirlo desde la PWA → chat echo
- [ ] Commit + push

## F1 — UI de chat + driver Claude (no-streaming)

- [ ] Renderer de chat real: burbujas usuario/agente, markdown, bloques de código
- [ ] Estado: una sesión por agente, persistir `sessionId` en el store/localStorage
- [ ] `ClaudeDriver` con spawn `claude -p "<msg>" --output-format json --resume <sid>` (patrón `telegram-claude-bot/bot.js:219-226`)
- [ ] Parsear `{result, session_id, usage}` y mostrar `result` al final (no streaming aún)
- [ ] `typing…` mientras corre (indicador, no colgado)
- [ ] Recuperación de sesión inválida (borrar sid y reintentar, `bot.js:199-205`)
- [ ] Selector de `cwd` (proyecto) y `mode` (safe/auto/yolo) por sesión
- [ ] Probar: mensaje → respuesta completa de Claude → continuidad con `--resume`
- [ ] Commit + push

## F2 — Streaming real

- [ ] Migrar `ClaudeDriver` al SDK `@anthropic-ai/claude-code` (verificar API/versión)
- [ ] `onToken` callback → emitir `ia.tok {sid, seq, text, final?}` al cliente
- [ ] Backpressure: batch de tokens cada ~50 ms
- [ ] Cliente: reensamblar `seq` y renderizar incremental (append, no reemplazar)
- [ ] `ia.done {usage, sessionId}` al cerrar la respuesta
- [ ] Cancelar generación (botón stop → matar/abortar el driver)
- [ ] Probar streaming en vivo (respuesta larga token a token)
- [ ] Commit + push

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
