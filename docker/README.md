# Dotrino IA — agente aislado en Docker (opcional)

Correr el agente de Dotrino IA dentro de un contenedor para **aislar el workspace**:
la IA (`claude`) puede ejecutar comandos, pero dentro del contenedor solo alcanza lo
que montes — tu proyecto en `/workspace` y el enlace al vault en `/data`. Nada más del
anfitrión. **El contenedor es la frontera de aislamiento**, por eso aquí es aceptable
correr Claude en modo "sin preguntar permisos" (`--dangerously-skip-permissions`).

> Es **opcional**. Si no te importa aislar, el camino normal sigue siendo
> `npx @dotrino/ia-agent` en tu máquina (ver el README del repo).

## 1. Autenticar Claude (el token va en `.env`)

Sí: **pones el token de Claude en un `.env`** y el contenedor lo usa. Dos formas
(elige una), ambas en [`.env.example`](./.env.example):

| Variable | Qué usa | Cómo la obtienes |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Tu **suscripción** Claude (Pro/Max/Team) | En tu máquina (con Claude Code ya logueado): `claude setup-token` → pega el token. Dura ~1 año. |
| `ANTHROPIC_API_KEY` | La **API** de Anthropic (pago por uso) | Una clave del [Console](https://platform.claude.com). Se factura aparte. |

```sh
cd dotrino-ia/docker      # trabaja desde esta carpeta
cp .env.example .env
$EDITOR .env              # pega tu CLAUDE_CODE_OAUTH_TOKEN (o ANTHROPIC_API_KEY)
```

### ¿Dónde va el `.env`?

Lo lee **Docker** (no el agente ni `claude`): Docker lo lee en el host e **inyecta las
variables** al proceso del contenedor. El archivo se queda en el host y **no** se copia
a la imagen. Dónde ponerlo depende de cómo lances:

- **Con `docker compose`** (lo normal aquí): `env_file: .env` se resuelve **relativo al
  `docker-compose.yml`**, así que el `.env` va **junto al compose**, es decir en esta
  carpeta `docker/`. Corre `docker compose …` desde aquí.
- **Con `docker run --env-file .env`**: la ruta es **relativa a la carpeta desde donde
  corres el comando**. Ponlo ahí, o pasa una ruta absoluta: `--env-file /ruta/.env`.
- **Sin Docker (`npx @dotrino/ia-agent`)**: no hay `.env` automático; exporta las
  variables (`export CLAUDE_CODE_OAUTH_TOKEN=…` o `CLAUDE_CODE_OAUTH_TOKEN=… npx …`).

El `.env` está en `.gitignore`/`.dockerignore`: **no lo subas** ni al repo ni al daemon.

## 2. Construir

```sh
docker compose build
# o sin compose:  docker build -t dotrino-ia-agent .
```

## 3. Enrolar AFUERA (una vez) — el contenedor solo CORRE

Enrolar es interactivo (pegas un código y apruebas en el navegador), así que se hace
**fuera del contenedor** y al contenedor le entra el `link.json` **ya enrolado** por el
volumen `./data`. El agente **nunca** enrola dentro de Docker: si levantas sin
`link.json`, avisa y sale (no se cuelga).

En tu máquina (solo necesita Node; `npx` no instala nada permanente):

```sh
npx @dotrino/ia-agent enroll --enroll-only --dir ./data
```

Te pedirá el **código de emparejamiento**: lo generas en
`https://profile.dotrino.com/myvault` ("Activar como bóveda" → "Generar código de
emparejamiento"), o con `dotrino-vault pair` si tienes vault en un PC. El agente muestra
un **código SAS** que escribes en `profile.dotrino.com/myvault` para aprobar. Al
aprobar, `--enroll-only` guarda `./data/link.json` y **sale**.

> `link.json` contiene la **clave de este dispositivo**: es el artefacto "ya enrolado" y
> lo único que el contenedor necesita para ser "esta máquina" en tu vault. Trátalo como
> un secreto (ya está en `.gitignore`/`.dockerignore`).
>
> ¿No tienes Node en tu máquina? Enrola con un contenedor de una sola vez (con terminal,
> `-it`): `docker compose run --rm -it ia-agent enroll --enroll-only`. Escribe igual a
> `./data/link.json`.

## 4. Correr (usa el link ya enrolado)

Edita [`docker-compose.yml`](./docker-compose.yml) y apunta el volumen `/workspace`
**al proyecto que quieres que la IA pueda tocar** (por defecto `./workspace`). El
`./data` con tu `link.json` ya está montado.

```sh
docker compose up -d
docker compose logs -f
```

La máquina aparece sola en `https://ia.dotrino.com` para chatear con ella.

### Sin docker compose

```sh
docker build -t dotrino-ia-agent .
# 1) enrolar AFUERA (produce ./data/link.json)
npx @dotrino/ia-agent enroll --enroll-only --dir ./data
# 2) correr (solo corre; usa el link)
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
- El contenedor **tiene salida a la red** (la necesita para el proxy y para Anthropic),
  así que la IA puede hacer llamadas de red. Restringir eso requiere políticas de red
  aparte (fuera de este alcance).
- El **token del `.env`** da acceso a tu cuenta/plan de Claude (y facturación, si es API
  key). Cuídalo como cualquier secreto.
- **No** montes el socket de Docker ni corras el contenedor como `--privileged`: eso
  rompería el aislamiento.

## Actualizar

Las versiones de Claude Code y del agente están pineadas en el `Dockerfile`
(`ARG CLAUDE_VERSION`, `ARG IA_AGENT_VERSION`). Para actualizar, súbelas y reconstruye:

```sh
docker compose build --build-arg CLAUDE_VERSION=latest
docker compose up -d
```
