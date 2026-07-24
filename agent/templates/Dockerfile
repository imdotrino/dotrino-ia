# Dotrino IA — agente en contenedor (OPCIONAL, para AISLAR el workspace).
#
# El agente ejecuta `claude` (Claude Code) que puede correr comandos en la máquina.
# Corriéndolo dentro de un contenedor, la IA solo alcanza lo que montes: el
# proyecto en /workspace y el enlace al vault en /data. El contenedor ES la frontera
# de aislamiento — por eso aquí es aceptable el modo "sin preguntar permisos".
#
# Generado por `dotrino-ia-agent init-docker`.
# Build:   docker compose build   (o: docker build -t dotrino-ia-agent .)
# Guía:    https://github.com/imdotrino/dotrino-ia/tree/main/container

FROM node:22-bookworm-slim

# Herramientas que Claude Code usa (git, ripgrep para búsquedas) + certificados.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates ripgrep less \
    && rm -rf /var/lib/apt/lists/*

# Versión de Claude Code (pineada para builds reproducibles; override con
# --build-arg CLAUDE_VERSION=latest). El agente de Dotrino IA va pineado exacto.
ARG CLAUDE_VERSION=2.1.215
ARG IA_AGENT_VERSION=__IA_AGENT_VERSION__
RUN npm install -g --no-fund \
      "@anthropic-ai/claude-code@${CLAUDE_VERSION}" \
      "@dotrino/ia-agent@${IA_AGENT_VERSION}"

# Usuario NO root: `claude --dangerously-skip-permissions` se niega a correr como
# root por seguridad. La imagen `node` ya trae el usuario 'node' (uid 1000): lo usamos.
RUN mkdir -p /workspace /data && chown -R node:node /workspace /data
USER node
ENV HOME=/home/node

# Config del agente. El contenedor es el sandbox → el modo yolo va aquí por defecto.
#   IA_CWD                     dónde opera Claude (tu proyecto montado).
#   DOTRINO_REMOTE_AGENT_DIR   dónde persiste el enlace al vault (volumen /data).
#   CLAUDE_FLAGS               flags de claude; yolo porque el contenedor aísla.
ENV IA_CWD=/workspace \
    DOTRINO_REMOTE_AGENT_DIR=/data \
    CLAUDE_FLAGS=--dangerously-skip-permissions

WORKDIR /workspace
# La AUTENTICACIÓN (ANTHROPIC_API_KEY o CLAUDE_CODE_OAUTH_TOKEN) se pasa en runtime
# con --env-file .env; NUNCA se hornea en la imagen.
ENTRYPOINT ["dotrino-ia-agent"]
