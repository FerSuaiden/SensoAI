import { createSourceReview } from "./lib/source-review";

async function main() {
  if (process.argv.length !== 2) throw new Error("Use npm run sources:check sem argumentos.");
  const { directory, review } = await createSourceReview(process.cwd());
  for (const entry of review.entries) console.log(`Tabela ${entry.table}: ${entry.changes.length} diferença(s) de conteúdo.`);
  console.log(`Relatório: ${directory}/review.md`);
  for (const error of review.errors) console.error(error);
  if (review.errors.length) process.exitCode = 1;
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Falha ao conferir as fontes."); process.exitCode = 1; });
