import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const GOOGLE_ORIGIN = 'https://generativelanguage.googleapis.com';

/**
 * Extra API origins this build is allowed to contact, from `VITE_API_ORIGINS`
 * (comma-separated). This is a *build-time* decision on purpose.
 *
 * A meta CSP can only ever be tightened at runtime, never relaxed, so the set of
 * reachable hosts has to be fixed when the bundle is produced. `src/lib/
 * apiConfig.js` reads the same variable and mirrors this list, so a rejected
 * endpoint produces a readable sentence in Settings instead of a silent console
 * violation. Both must agree — change them together.
 */
function apiOrigins(env) {
  const extra = String(env.VITE_API_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try { return new URL(s).origin; } catch { return null; }
    })
    .filter(Boolean);
  return [...new Set([GOOGLE_ORIGIN, ...extra])];
}

/**
 * Content-Security-Policy for the shipped bundle.
 *
 * Injected at build time only: Vite's dev server needs inline scripts for the
 * react-refresh preamble, and a meta CSP in index.html would apply there too.
 *
 * - `connect-src` is the important one: even if something managed to inject a
 *   script, it could not post the user's API key or health log anywhere except
 *   the AI endpoints this build was compiled to allow.
 * - `style-src 'unsafe-inline'` is required because React writes inline style
 *   attributes (the progress bar widths).
 * - `object-src 'none'` / `base-uri 'none'` / `form-action 'none'` close off
 *   plugin embedding, base-tag hijacking and off-origin form posts.
 */
function buildCsp(origins) {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${origins.join(' ')}`,
    "media-src 'self' data: blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const csp = buildCsp(apiOrigins(env));

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'inject-csp',
        apply: 'build',
        transformIndexHtml(html) {
          return html.replace(
            '<head>',
            `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
          );
        },
      },
    ],
    build: {
      // Capacitor copies `dist` into the Android assets directory.
      outDir: 'dist',
      sourcemap: false,
      target: 'es2020',
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.js'],
    },
  };
});
