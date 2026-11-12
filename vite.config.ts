import { defineConfig, type Plugin } from 'vite';

const productionCsp: Plugin = {
  name: 'fototo-production-csp',
  apply: 'build',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'";
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },
  },
};

export default defineConfig({
  base: './',
  plugins: [productionCsp],
  server: {
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://localhost:5173 ws://localhost:5173; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'",
    },
  },
  build: {
    outDir: 'dist',
  },
});
