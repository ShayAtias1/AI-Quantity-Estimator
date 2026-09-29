// Lets `node --test` load the app's TypeScript sources as they are written for Vite: Node strips the
// types itself (erasableSyntaxOnly keeps that possible), and this hook resolves the extensionless
// and directory imports (`./quantities`, `../types`) that Vite resolves on its own.
import { registerHooks } from 'node:module';

const RETRY = new Set(['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT']);

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (!RETRY.has(err?.code) || !(specifier.startsWith('.') || specifier.startsWith('/'))) throw err;
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        try {
          return nextResolve(candidate, context);
        } catch {
          // try the next candidate
        }
      }
      throw err;
    }
  },
});
