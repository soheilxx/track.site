import { evaluateScope, explainScope } from "../scope.ts";

/** `pnpm --filter @track-site/ai exec tsx src/evals/explain.ts "message"` — prints the verdict and the refusing rule id (never content). */
for (const message of process.argv.slice(2)) {
  process.stdout.write(`${JSON.stringify(evaluateScope({ message }))} ${JSON.stringify(explainScope(message))}\n`);
}
