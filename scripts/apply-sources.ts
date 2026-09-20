import { applySourceReview } from "./lib/source-review";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--review") throw new Error("Use npm run sources:apply -- --review review-ID.");
  const count = await applySourceReview(process.cwd(), args[1]);
  console.log(`${count} snapshots atualizados com a versão revisada. Confira git diff e execute npm test e npm run eval:retrieval.`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Falha ao aplicar a revisão."); process.exitCode = 1; });
