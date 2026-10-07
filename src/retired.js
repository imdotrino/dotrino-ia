/**
 * retired.js — lo único que carga ia.dotrino.com desde que la app se retiró
 * (2026-10-07): la barra del ecosistema y el aviso bilingüe. La PWA vieja sigue en
 * main.js por historial, pero no se importa.
 */
import '@dotrino/topbar'

const show = (lang) => {
  const l = lang === 'en' ? 'en' : 'es'
  document.documentElement.lang = l
  for (const s of document.querySelectorAll('main [data-lang]')) s.hidden = s.dataset.lang !== l
}
const topbar = document.getElementById('topbar')
show(topbar?.lang || localStorage.getItem('dotrino-lang') || document.documentElement.lang)
topbar?.addEventListener('dotrino-lang', (e) => show(e.detail?.lang || e.detail))

// El service worker viejo guardaba la app entera: se da de baja para que nadie se
// quede con la versión anterior cacheada.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()))
  if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)))
}

const style = document.createElement('style')
style.textContent = `
  :root { color-scheme: dark; }
  body { margin: 0; background: #0e0b1a; color: #ece9f5; font-family: system-ui, sans-serif; }
  main.retired { max-width: 40rem; margin: 0 auto; padding: 3rem 1rem; line-height: 1.6; }
  main.retired h1 { font-size: 1.7rem; margin-bottom: 1rem; }
  main.retired .cta { display: inline-block; padding: 0.7rem 1.3rem; border-radius: 10px;
    background: #7c5cff; color: #fff; text-decoration: none; font-weight: 600; }
  main.retired .dim { color: #a9a3c2; font-size: 0.92rem; }
  main.retired code { font-size: 0.9em; }
`
document.head.append(style)
