# @dotrino/ia-agent

Agente de [Dotrino IA](https://ia.dotrino.com): expone Claude Code de esta máquina al chat
de `ia.dotrino.com`, solo para los aparatos de tu cuenta y cifrado de punta a punta. Lo
común (enrolamiento, saludo contra el acta, canal cifrado, revocación, renovación, dónde
vive el enlace) es [`@dotrino/remote-agent`](https://www.npmjs.com/package/@dotrino/remote-agent);
esto añade el driver de Claude.

**Cómo se usa:** [wiki.dotrino.com/herramientas/ia](https://wiki.dotrino.com/herramientas/ia/).

```sh
npx @dotrino/ia-agent                        # enlaza (si falta) y corre
npx @dotrino/ia-agent enroll                 # re-enlaza y corre
npx @dotrino/ia-agent --name proyecto-a      # otro agente, con su propio enlace
npx @dotrino/ia-agent list                   # los enlazados en esta máquina
npx @dotrino/ia-agent init-podman            # andamiaje para correrlo aislado (o init-docker)
#   [--proxy wss://…] [--dir /ruta] [--enroll-only]
```

| Variable | Qué hace | Por defecto |
|---|---|---|
| `IA_CWD` | carpeta donde trabaja Claude | la carpeta desde la que se lanza |
| `CLAUDE_BIN` | binario de Claude Code | `claude` |
| `CLAUDE_FLAGS` | flags extra (`--dangerously-skip-permissions` = sin preguntar nada) | ninguno |
| `CLAUDE_TIMEOUT` | segundos por respuesta, `0` = sin límite | `0` |

Enlaces en `~/.dotrino/agent/ia-agent/<nombre>/` (el estándar de
`@dotrino/remote-agent/instances`; raíz con `DOTRINO_AGENT_HOME`). `--dir` o
`DOTRINO_REMOTE_AGENT_DIR` fuerzan una carpeta concreta, como en los contenedores. El
`link.json` guarda la llave privada de la máquina: trátalo como una llave SSH.

Protocolo (dentro de la sesión cifrada): `{type:'msg',text}` → `{type:'tok',text}`… y
`{type:'done',sessionId,tokens,text?}` (`text` solo si no llegó ningún token) o
`{type:'error',message}`. El pong del agente lleva `kind: 'ia-agent'`: así lo encuentra la
PWA (`probeAgents`), no por el nombre del acta.

MIT.
