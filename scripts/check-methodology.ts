import { checkMethodologyDocument } from "./lib/methodology-check";

async function main() {
  if (process.argv.length !== 2) throw new Error("Use npm run methodology:check sem argumentos.");
  const result = await checkMethodologyDocument();
  console.log(result.unchanged ? "PDF metodológico: mesma versão de bytes usada na curadoria. Nenhum arquivo alterado."
    : "O PDF mudou. Releia as páginas citadas e revise os fatos antes de atualizar o hash local. Nenhum arquivo alterado.");
  console.log(`SHA-256 esperado: ${result.expectedHash}\nSHA-256 recebido: ${result.actualHash}`);
  if (!result.unchanged) process.exitCode = 1;
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Falha ao conferir o documento."); process.exitCode = 1; });
