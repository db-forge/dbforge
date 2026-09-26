// Test-only module hook for `node --test` (Node >= 23.6 strips TypeScript natively): resolves Next.js-style
// extensionless relative imports ("./errors") to "<path>.ts" / "<path>/index.ts". package.json stays untouched.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
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
