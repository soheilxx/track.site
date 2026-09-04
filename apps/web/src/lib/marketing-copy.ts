/**
 * Compatibility shim: the marketing copy moved to ./marketing-copy/ (one module per area, see
 * marketing-copy/index.ts for the module map). Existing imports of "@/lib/marketing-copy" resolve
 * to this file first and keep working unchanged. `src/lib/brand-guard.test.ts` scans both this file
 * and `src/lib/marketing-copy/**`; delete this shim once every import points at the directory.
 */
export * from "./marketing-copy/index";
