# Dotrino IA — ia.dotrino.com

Habla desde tu teléfono con los asistentes de IA (Claude, OpenCode…) que corren
en **tu propia computadora**. La conversación va cifrada de punta a punta y solo
entra un dispositivo que hayas enlazado a tu bóveda. Sin cuentas y sin rastreo.

Son **dos piezas**: la app web (este repo, `src/`) y el **agente** (`agent/`),
que es lo que se instala en la máquina donde vive el CLI de IA.

Documentación de uso:
[wiki.dotrino.com/herramientas/ia](https://wiki.dotrino.com/herramientas/ia/).

## Cómo encaja

- La app **no** habla con ningún modelo: habla con **tu** agente.
- El enlace entre teléfono y máquina lo hace `@dotrino/remote-agent`
  (emparejamiento con la bóveda, certificado de dispositivo, revocación).
- El transporte es `@dotrino/proxy-client`; la identidad, `@dotrino/identity`.
- El descubrimiento de máquinas usa `@dotrino/remote-agent/discover`: se pregunta a los miembros del acta qué son (`probeAgents`) y salen los que contestan `ia-agent`. El nombre del acta lo pone el dueño y no sirve para esto.

## Stack

Vite (sin framework) + `vite-plugin-pwa`. Pilares: `@dotrino/identity`,
`@dotrino/remote-agent`, `@dotrino/proxy-client`, `@dotrino/store`,
`@dotrino/reputation`, `@dotrino/topbar`, `@dotrino/nav`, `@dotrino/install`.

## Desarrollo

```sh
npm install
npm run dev        # http://localhost:3400
npm run build      # → dist/
npm run type-check
```

El agente se desarrolla aparte:

```sh
cd agent && npm install && node bin/cli.js --help
```

## Deploy

GitHub Actions construye `dist/` y lo publica en Pages bajo
**`https://ia.dotrino.com/`** (`.github/workflows/deploy.yml`). El agente se
publica en npm por separado.

## Privacidad

Los prompts y las respuestas viajan cifrados entre tu teléfono y tu máquina; el
proxio solo enruta. Ninguna conversación se guarda en un servidor de Dotrino.

## Licencia

MIT — © Dotrino
