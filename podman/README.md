# Dotrino IA — agente aislado en Podman (opcional)

Correr el agente de Dotrino IA dentro de un contenedor para **aislar el workspace**:
la IA (`claude`) puede ejecutar comandos, pero dentro del contenedor solo alcanza lo
que montes — tu proyecto en `/workspace` y el enlace al vault en `/data`. Nada más del
anfitrión. **El contenedor es la frontera de aislamiento**, por eso aquí es aceptable
correr Claude en modo "sin preguntar permisos" (`--dangerously-skip-permissions`).

Se usa **Podman** (rootless, sin daemon): no hay un proceso root corriendo detrás
esperando órdenes (a diferencia de Docker, que necesita `dockerd` como root), así que
esta capa de aislamiento suma otra: aunque escaparas del contenedor, seguirías siendo
tu usuario normal en el host, no root.

> Es **opcional**. Si no te importa aislar, el camino normal sigue siendo
> `npx @dotrino/ia-agent` en tu máquina.

## Obtén los archivos (SIN clonar el repo)

Un comando deja el andamiaje en tu carpeta (no hace falta clonar nada; necesitas
[Podman](https://podman.io/docs/installation) instalado):

```sh
npx @dotrino/ia-agent init-podman            # en la carpeta actual
# o en otra:  npx @dotrino/ia-agent init-podman mi-ia   &&   cd mi-ia
```

Crea `Containerfile`, `compose.yaml`, `.env.example`, `.gitignore`, `.containerignore`
(con la versión del agente ya pineada) y las carpetas `data/` y `workspace/`. No pisa
archivos existentes salvo que pases `--force`.

## Qué necesitas y cuándo

**Enrolar no necesita ningún archivo previo** (ni el `.env`): es solo el enlace al
vault, Claude ni se toca. El enroll **produce** `./data/link.json` — ese es el artefacto
"ya enrolado" que el contenedor consume después.

| Archivo | ¿Quién lo crea? | ¿Para enrolar? | ¿Para correr? |
|---|---|---|---|
| `Containerfile`, `compose.yaml`, `.env.example` | `init-podman` | ❌ | ✅ |
| `.env` (token de Claude) | tú (`cp .env.example .env`) | ❌ | ✅ |
| `./data/link.json` | **el enroll** | ❌ lo produce | ✅ montado en `/data` |
| tu proyecto (→ `/workspace`) | tú | ❌ | ✅ |

Orden real: **0)** `init-podman` · **1)** enrolar → `link.json` · **2)** token en `.env`
· **3)** `podman run`/`podman compose up -d`.

## 1. Token de Claude (`.env`)

Lo lee **Podman** (no el agente ni `claude`) y lo inyecta al contenedor. Elige una
forma, ambas en `.env.example`:

| Variable | Qué usa | Cómo la obtienes |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Tu **suscripción** Claude (Pro/Max/Team) | En tu máquina (con Claude Code logueado): `claude setup-token`. Dura ~1 año. |
| `ANTHROPIC_API_KEY` | La **API** de Anthropic (pago por uso) | Una clave del [Console](https://platform.claude.com). Se factura aparte. |

```sh
cp .env.example .env
$EDITOR .env      # pega tu CLAUDE_CODE_OAUTH_TOKEN (o ANTHROPIC_API_KEY)
```

El `.env` está en `.gitignore`/`.containerignore`: **no lo subas**. Con `podman
compose`, va **junto al `compose.yaml`**; con `podman run --env-file .env`, relativo a
donde corres el comando.

## 2. Enrola AFUERA (una vez) — el contenedor solo CORRE

Enrolar es interactivo (pegas un código y apruebas en el navegador), así que se hace
**fuera del contenedor** y al contenedor le entra el `link.json` **ya enrolado** por el
volumen `./data`. El agente **nunca** enrola dentro del contenedor: si levantas sin
`link.json`, avisa y sale (no se cuelga).

```sh
npx @dotrino/ia-agent enroll --enroll-only --dir ./data
```

Te pedirá el **código de emparejamiento**: lo generas en
`https://profile.dotrino.com/myvault` ("Activar como bóveda" → "Generar código de
emparejamiento"), o con `dotrino-vault pair` si tienes vault en un PC. El agente muestra
un **código SAS** que escribes en `profile.dotrino.com/myvault` para aprobar. Al
aprobar, `--enroll-only` guarda `./data/link.json` y **sale**.

> `link.json` contiene la **clave de este dispositivo**: trátalo como un secreto (ya
> está en `.gitignore`/`.containerignore`).
>
> ¿No tienes Node? Enrola con un contenedor de una sola vez (con terminal, `-it`):
> `podman run --rm -it -v ./data:/data dotrino-ia-agent enroll --enroll-only`
> (necesita la imagen ya construida, ver abajo). Escribe igual a `./data/link.json`.

## 3. Correr (usa el link ya enrolado)

### `podman run` (recomendado — sin pasos extra)

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
puede escribir en `./data`/`./workspace` (`Permission denied`) — el uid 1000 de dentro
(el usuario `node`) se remapea a otro uid del host que no es dueño de esas carpetas.
Con `--userns=keep-id`, tu propio usuario del host queda mapeado 1:1 al uid 1000 de
dentro: los archivos que la IA cree quedan con tu dueño real, no root ni un uid
ilegible.

**Que sobreviva a un reinicio/logout** (equivalente al `restart: unless-stopped` de
Docker, que funciona solo porque `dockerd` es un servicio de sistema; Podman rootless
no tiene eso por defecto):

```sh
systemctl --user enable --now podman-restart.service   # reinicia contenedores al volver a loguear
loginctl enable-linger "$USER"                          # (servidor/SSH) mantiene tu sesión systemd viva sin login activo
```

### Alternativa: `podman compose`

Si prefieres el flujo de compose, necesita el **socket** de Podman activo (una vez):

```sh
systemctl --user enable --now podman.socket
```

Edita `compose.yaml` y apunta el volumen `/workspace` **al proyecto que quieres que la
IA pueda tocar** (por defecto `./workspace`; `userns_mode: keep-id` ya viene puesto).

```sh
podman compose up -d
podman compose logs -f
```

La máquina aparece sola en `https://ia.dotrino.com` para chatear con ella.

## Qué aísla (y qué no)

**Sí:**
- La IA solo lee/escribe dentro del contenedor y de `/workspace`. No toca tu home, otros
  proyectos ni archivos del anfitrión.
- Corre como usuario **no root** (uid 1000) dentro del contenedor, y **sin daemon root**
  detrás (Podman rootless: el proceso del contenedor es un hijo de tu propio usuario).
- No abre puertos: el agente sale hacia el proxy del ecosistema, no escucha nada.

**Ojo (límites honestos):**
- **`/workspace` es totalmente escribible por la IA** — es a propósito, es lo que edita.
  Monta solo lo que estés dispuesto a que cambie.
- El contenedor **tiene salida a la red** (la necesita para el proxy y para Anthropic).
  Restringir eso requiere políticas de red aparte (fuera de este alcance).
- El **token del `.env`** da acceso a tu cuenta/plan de Claude (y facturación, si es API
  key). Cuídalo como cualquier secreto.
- **No** montes el socket de Podman dentro del propio contenedor ni corras con
  `--privileged`.
- Sin `loginctl enable-linger` (en un servidor/SSH), el contenedor se detiene al cerrar
  tu sesión — no es exclusivo de Podman, pasa con cualquier servicio de systemd --user.

## Actualizar

Las versiones de Claude Code y del agente están pineadas en el `Containerfile` (`ARG
CLAUDE_VERSION`, `ARG IA_AGENT_VERSION`). Para actualizar, súbelas y reconstruye
(o vuelve a correr `init-podman --force` para regenerar el `Containerfile` con la
última versión del agente):

```sh
podman build -t dotrino-ia-agent --build-arg CLAUDE_VERSION=latest .
podman run -d --restart unless-stopped --userns=keep-id --env-file .env \
  -v "$PWD/data:/data" -v "$PWD/workspace:/workspace" dotrino-ia-agent
```
