// Test-only module hooks for `node --test` (Node >= 23.6 strips TypeScript types natively).
// package.json is shared and stays untouched, so these two gaps are closed here instead:
//  1. Next.js-style extensionless relative imports ("./errors") → try "<path>.ts" / "<path>/index.ts".
//  2. `import "server-only"` → Next's own empty module (the same alias Next's server compiler applies).
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(${JSON.stringify(import.meta.url)});
const SERVER_ONLY_EMPTY = pathToFileURL(require.resolve("next/dist/compiled/server-only/empty.js")).href;

export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: SERVER_ONLY_EMPTY, shortCircuit: true };
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  if (relative && context.parentURL && context.parentURL.startsWith("file:") && !/\\.[cm]?[jt]s$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const candidate of [base.href + ".ts", base.href + "/index.ts"]) {
      if (existsSync(fileURLToPath(candidate))) return { url: candidate, shortCircuit: true };
    }
  }
  return next(specifier, context);
}
`),
  import.meta.url,
);
