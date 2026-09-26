// `server-only` is not an npm dependency here: Next.js aliases it to its own compiled copy
// (next/dist/compiled/server-only — empty on the server, throws in a client bundle).
// TypeScript 6 checks side-effect imports by default, so declare the module for `tsc --noEmit`.
declare module "server-only";
