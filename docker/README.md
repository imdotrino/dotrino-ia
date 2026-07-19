# Dotrino IA — agente aislado en Docker (opcional)

Correr el agente de Dotrino IA dentro de un contenedor para **aislar el workspace**:
la IA (`claude`) puede ejecutar comandos, pero dentro del contenedor solo alcanza lo
que montes — tu proyecto en `/workspace` y el enlace al vault en `/data`. Nada más del
anfitrión. **El contenedor es la frontera de aislamiento**, por eso aquí es aceptable
correr Claude en modo "sin preguntar permisos" (`--dangerously-skip-permissions`).

> Es **opcional**. Si no te importa aislar, el camino normal sigue siendo
> `npx @dotrino/ia-agent` en tu máquina.

## Obtén los archivos (SIN clonar el repo)

Un comando deja el andamiaje en tu carpeta (no hace falta clonar nada):

```sh
npx @dotrino/ia-agent init-docker            # en la carpeta actual
# o en otra:  npx @dotrino/ia-agent init-docker mi-ia   &&   cd mi-ia
```

Crea `Dockerfile`, `docker-compose.yml`, `.env.example`, `.gitignore`, `.dockerignore`
(con la versión del agente ya pineada) y las carpetas `data/` y `workspace/`. No pisa
archivos existentes salvo que pases `--force`.

## Qué necesitas y cuándo

**Enrolar no necesita ningún archivo previo** (ni el `.env`): es solo el enlace al
vault, Claude ni se toca. El enroll **produce** `./data/link.json` — ese es el artefacto
"ya enrolado" que el contenedor consume después.

| Archivo | ¿Quién lo crea? | ¿Para enrolar? | ¿Para correr? |
|---|---|---|---|
| `Dockerfile`, `docker-compose.yml`, `.env.example` | `init-docker` | ❌ | ✅ |
| `.env` (token de Claude) | tú (`cp .env.example .env`) | ❌ | ✅ |
| `./data/link.json` | **el enroll** | ❌ lo produce | ✅ montado en `/data` |
| tu proyecto (→ `/workspace`) | tú | ❌ | ✅ |

Orden real: **0)** `init-docker` · **1)** enrolar → `link.json` · **2)** token en `.env`
· **3)** `docker compose up -d`.

## 1. Token de Claude (`.env`)

Lo lee **Docker** (no el agente ni `claude`) y lo inyecta al contenedor. Elige una
forma, ambas en `.env.example`:

| Variable | Qué usa | Cómo la obtienes |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Tu **suscripción** Claude (Pro/Max/Team) | En tu máquina (con Claude Code logueado): `claude setup-token`. Dura ~1 año. |
| `ANTHROPIC_API_KEY` | La **API** de Anthropic (pago por uso) | Una clave del [Console](https://platform.claude.com). Se factura aparte. |

```sh
cp .env.example .env
$EDITOR .env      # pega tu CLAUDE_CODE_OAUTH_TOKEN (o ANTHROPIC_API_KEY)
```

El `.env` está en `.gitignore`/`.dockerignore`: **no lo subas**. Con `docker compose`,
va **junto al `docker-compose.yml`**; con `docker run --env-file .env`, relativo a donde
corres el comando.

## 2. Enrola AFUERA (una vez) — el contenedor solo CORRE

Enrolar es interactivo (pegas un código y apruebas en el navegador), así que se hace
**fuera del contenedor** y al contenedor le entra el `link.json` **ya enrolado** por el
volumen `./data`. El agente **nunca** enrola dentro de Docker: si levantas sin
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
> está en `.gitignore`/`.dockerignore`).
>
> ¿No tienes Node? Enrola con un contenedor de una sola vez (con terminal, `-it`):
> `docker compose run --rm -it ia-agent enroll --enroll-only`. Escribe igual a `./data/link.json`.

## 3. Correr (usa el link ya enrolado)

Edita `docker-compose.yml` y apunta el volumen `/workspace` **al proyecto que quieres
que la IA pueda tocar** (por defecto `./workspace`).

```sh
docker compose up -d
docker compose logs -f
```

La máquina aparece sola en `https://ia.dotrino.com` para chatear con ella.

### Sin docker compose

```sh
docker build -t dotrino-ia-agent .
docker run -d --restart unless-stopped --name ia-agent --env-file .env \
  -v "$PWD/data:/data" -v "/ruta/a/tu/proyecto:/workspace" \
  dotrino-ia-agent
```

## Qué aísla (y qué no)

**Sí:**
- La IA solo lee/escribe dentro del contenedor y de `/workspace`. No toca tu home, otros
  proyectos ni archivos del anfitrión.
- Corre como usuario **no root** (uid 1000) dentro del contenedor.
- No abre puertos: el agente sale hacia el proxy del ecosistema, no escucha nada.

**Ojo (límites honestos):**
- **`/workspace` es totalmente escribible por la IA** — es a propósito, es lo que edita.
  Monta solo lo que estés dispuesto a que cambie.
- El contenedor **tiene salida a la red** (la necesita para el proxy y para Anthropic).
  Restringir eso requiere políticas de red aparte (fuera de este alcance).
- El **token del `.env`** da acceso a tu cuenta/plan de Claude (y facturación, si es API
  key). Cuídalo como cualquier secreto.
- **No** montes el socket de Docker ni corras el contenedor como `--privileged`.

## Actualizar

Las versiones de Claude Code y del agente están pineadas en el `Dockerfile` (`ARG
CLAUDE_VERSION`, `ARG IA_AGENT_VERSION`). Para actualizar, súbelas y reconstruye
(o vuelve a correr `init-docker --force` para regenerar el `Dockerfile` con la última
versión del agente):

```sh
docker compose build --build-arg CLAUDE_VERSION=latest
docker compose up -d
```
