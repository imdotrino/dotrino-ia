# Dotrino IA — agente aislado en un contenedor (opcional)

Correr el agente de Dotrino IA dentro de un contenedor para **aislar el workspace**:
la IA (`claude`) puede ejecutar comandos, pero dentro del contenedor solo alcanza lo
que montes — tu proyecto en `/workspace` y el enlace al vault en `/data`. Nada más del
anfitrión. **El contenedor es la frontera de aislamiento**, por eso aquí es aceptable
correr Claude en modo "sin preguntar permisos" (`--dangerously-skip-permissions`).

Soporta **Podman** y **Docker** — elige uno. Es **opcional**: si no te importa aislar,
el camino normal sigue siendo `npx @dotrino/ia-agent` en tu máquina.

## ¿Podman o Docker?

| | Podman (rootless) | Docker |
|---|---|---|
| Daemon root corriendo siempre | No (más aislamiento) | Sí (`dockerd`) |
| `build` + `run` de una | Igual de simple | Igual de simple |
| Flag extra necesario para que la IA pueda escribir en los volúmenes | `--userns=keep-id` (**obligatorio**, ver abajo) | Ninguno |
| Sobrevive solo a un reinicio/logout | No por defecto — necesita 1-2 pasos únicos (ver abajo) | Sí, gratis (dockerd ya es un servicio de sistema) |
| `compose` funciona directo | Necesita el socket activo (1 paso único) | Sí, directo |

Ninguno es "mejor" en general: Podman te da una capa extra de aislamiento (nada corre
como root, ni el propio motor) a cambio de un par de pasos únicos de configuración;
Docker te ahorra esos pasos porque su daemon ya corre como root permanentemente.

## Obtén los archivos (SIN clonar el repo)

Un comando deja el andamiaje en tu carpeta (no hace falta clonar nada):

```sh
npx @dotrino/ia-agent init-podman            # para Podman
# o:
npx @dotrino/ia-agent init-docker            # para Docker
# en otra carpeta:  npx @dotrino/ia-agent init-podman mi-ia   &&   cd mi-ia
```

`init-podman` crea `Containerfile`, `compose.yaml`, `.env.example`, `.gitignore`,
`.containerignore`. `init-docker` crea `Dockerfile`, `docker-compose.yml`,
`.env.example`, `.gitignore`, `.dockerignore`. Ambos con la versión del agente ya
pineada, y las carpetas `data/` y `workspace/`. No pisan archivos existentes salvo que
pases `--force`.

## Qué necesitas y cuándo

**Enrolar no necesita ningún archivo previo** (ni el `.env`): es solo el enlace al
vault, Claude ni se toca. El enroll **produce** `./data/link.json` — ese es el artefacto
"ya enrolado" que el contenedor consume después.

| Archivo | ¿Quién lo crea? | ¿Para enrolar? | ¿Para correr? |
|---|---|---|---|
| `Containerfile`/`Dockerfile`, `compose.yaml`/`docker-compose.yml`, `.env.example` | `init-podman`/`init-docker` | ❌ | ✅ |
| `.env` (token de Claude) | tú (`cp .env.example .env`) | ❌ | ✅ |
| `./data/link.json` | **el enroll** | ❌ lo produce | ✅ montado en `/data` |
| tu proyecto (→ `/workspace`) | tú | ❌ | ✅ |

Orden real: **0)** `init-podman`/`init-docker` · **1)** enrolar → `link.json` · **2)**
token en `.env` · **3)** correr.

## 1. Token de Claude (`.env`)

Lo lee **el motor de contenedores** (no el agente ni `claude`) y lo inyecta al
contenedor. Elige una forma, ambas en `.env.example`:

| Variable | Qué usa | Cómo la obtienes |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Tu **suscripción** Claude (Pro/Max/Team) | En tu máquina (con Claude Code logueado): `claude setup-token`. Dura ~1 año. |
| `ANTHROPIC_API_KEY` | La **API** de Anthropic (pago por uso) | Una clave del [Console](https://platform.claude.com). Se factura aparte. |

```sh
cp .env.example .env
$EDITOR .env      # pega tu CLAUDE_CODE_OAUTH_TOKEN (o ANTHROPIC_API_KEY)
```

El `.env` está en `.gitignore`/`.containerignore`/`.dockerignore`: **no lo subas**. Con
`compose` (Podman o Docker), va **junto al archivo compose**; con `run --env-file .env`,
relativo a donde corres el comando. Con compose, el archivo debe **existir** aunque esté
vacío — si no, `up` falla con *"env file .env not found"*.

## 2. Enrola AFUERA (una vez) — el contenedor solo CORRE

Enrolar es interactivo (pegas un código y apruebas en el navegador), así que se hace
**fuera del contenedor** y al contenedor le entra el `link.json` **ya enrolado** por el
volumen `./data`. El agente **nunca** enrola dentro del contenedor: si levantas sin
`link.json`, avisa y sale (no se cuelga) — funciona igual con Podman o Docker.

```sh
npx @dotrino/ia-agent enroll --enroll-only --dir ./data
```

Te pedirá el **código de emparejamiento**: lo generas en
`https://profile.dotrino.com/myvault` ("Activar como bóveda" → "Generar código de
emparejamiento"), o con `dotrino-vault pair` si tienes vault en un PC. El agente muestra
un **código SAS** que escribes en `profile.dotrino.com/myvault` para aprobar. Al
aprobar, `--enroll-only` guarda `./data/link.json` y **sale**.

> `link.json` contiene la **clave de este dispositivo**: trátalo como un secreto.
>
> ¿No tienes Node? Enrola con un contenedor de una sola vez (con terminal, `-it`), tras
> construir la imagen (ver abajo): `podman run --rm -it -v ./data:/data
> dotrino-ia-agent enroll --enroll-only` (o `docker run` igual). Escribe igual a
> `./data/link.json`.

## 3. Correr (usa el link ya enrolado)

### Con Podman

```sh
podman build -t dotrino-ia-agent .

podman run -d --restart unless-stopped --name ia-agent \
  --userns=keep-id \
  --env-file .env \
  -v "$PWD/data:/data" -v "/ruta/a/tu/proyecto:/workspace" \
  dotrino-ia-agent

podman logs -f ia-agent
```

**`--userns=keep-id` es obligatorio** en Podman rootless: sin él, el contenedor no
puede escribir en `./data`/`./workspace` (`Permission denied`, comprobado) — el uid 1000
de dentro (el usuario `node`) se remapea a otro uid del host que no es dueño de esas
carpetas. Con `--userns=keep-id`, tu propio usuario del host queda mapeado 1:1 al uid
1000 de dentro: los archivos que la IA cree quedan con tu dueño real.

**Que sobreviva a un reinicio/logout** (con Docker esto es gratis porque `dockerd` es un
servicio de sistema; Podman rootless no tiene daemon, así que no hay quién lo reviva
solo — necesitas decírselo una vez):

```sh
systemctl --user enable --now podman-restart.service   # reinicia contenedores al volver a loguear
loginctl enable-linger "$USER"                          # (servidor/SSH) mantiene tu sesión systemd viva sin login activo
```

**Alternativa: `podman compose`** — necesita el **socket** de Podman activo (una vez;
comprobado: sin esto, `podman compose up` falla directo con *"failed to connect to the
docker API"*):

```sh
systemctl --user enable --now podman.socket
```

Edita `compose.yaml` y apunta el volumen `/workspace` **al proyecto que quieres que la
IA pueda tocar** (por defecto `./workspace`; `userns_mode: keep-id` ya viene puesto).

```sh
podman compose up -d
podman compose logs -f
```

### Con Docker

```sh
docker build -t dotrino-ia-agent .

docker run -d --restart unless-stopped --name ia-agent \
  --env-file .env \
  -v "$PWD/data:/data" -v "/ruta/a/tu/proyecto:/workspace" \
  dotrino-ia-agent

docker logs -f ia-agent
```

Docker rootful **no necesita** `--userns=keep-id`: no remapea uids por defecto, así que
el uid 1000 (`node`) de dentro se ve directo como uid 1000 en el host. Si tu usuario del
host **no** es uid 1000, los archivos que la IA cree en los volúmenes quedan con ese uid
1000 literal — puede no coincidir con tu usuario (revisa con `id -u`); es un caso poco
común (la mayoría de instalaciones de un solo usuario en Linux ya usan uid 1000) pero
vale saberlo. `restart: unless-stopped` sí sobrevive solo a un reinicio, sin pasos
extra, porque `dockerd` corre como servicio de sistema.

**Alternativa: `docker compose`** (funciona directo, sin pasos previos):

```sh
docker compose up -d
docker compose logs -f
```

En ambos casos, edita el archivo compose y apunta `/workspace` a tu proyecto.

La máquina aparece sola en `https://ia.dotrino.com` para chatear con ella.

## Qué aísla (y qué no)

**Sí:**
- La IA solo lee/escribe dentro del contenedor y de `/workspace`. No toca tu home, otros
  proyectos ni archivos del anfitrión.
- Corre como usuario **no root** (uid 1000) dentro del contenedor.
- Con Podman rootless, además **sin daemon root** detrás (el proceso del contenedor es
  un hijo de tu propio usuario) — una capa más que Docker no tiene, porque `dockerd`
  corre como root.
- No abre puertos: el agente sale hacia el proxy del ecosistema, no escucha nada.

**Ojo (límites honestos):**
- **`/workspace` es totalmente escribible por la IA** — es a propósito, es lo que edita.
  Monta solo lo que estés dispuesto a que cambie.
- El contenedor **tiene salida a la red** (la necesita para el proxy y para Anthropic).
  Restringir eso requiere políticas de red aparte (fuera de este alcance).
- El **token del `.env`** da acceso a tu cuenta/plan de Claude (y facturación, si es API
  key). Cuídalo como cualquier secreto.
- **No** montes el socket del motor (Podman/Docker) dentro del propio contenedor ni
  corras con `--privileged`.
- Con Podman, sin `loginctl enable-linger` (en un servidor/SSH), el contenedor se
  detiene al cerrar tu sesión — no es un bug, pasa con cualquier servicio de
  systemd --user sin linger.

## Actualizar

Las versiones de Claude Code y del agente están pineadas en el `Containerfile`/
`Dockerfile` (`ARG CLAUDE_VERSION`, `ARG IA_AGENT_VERSION`). Para actualizar, súbelas y
reconstruye (o vuelve a correr `init-podman`/`init-docker --force` para regenerarlo con
la última versión del agente):

```sh
podman build -t dotrino-ia-agent --build-arg CLAUDE_VERSION=latest .   # o docker build
```
