import { retrievePopulationContext } from "../src/lib/population-retrieval";

// Baseline local, sem LLM e sem rede. Preservar estas perguntas ao comparar embeddings.
const cases = [
  { question: "Qual tabela tem população em 2010?", expected: ["202-overview", "202-scope"] },
  { question: "Me conta quantos habitantes havia em MG em 2000", expected: ["202-overview", "202-scope"] },
  { question: "Gostaria de saber o total de moradores do Brasil em 2010", expected: ["202-overview", "202-scope"] },
  { question: "População residente em 2022", expected: ["4709-overview", "4709-scope"] },
  { question: "Quantos habitantes tem o Brasil?", expected: ["4709-overview", "4709-scope"] },
  { question: "Categorias Mulheres Urbana em 2010", expected: ["202-scope"] },
  { question: "Níveis administrativos da população em 2022", expected: ["4709-scope"] },
  { question: "Períodos do Censo em 2000", expected: ["202-overview"] },
  { question: "Receita de bolo de chocolate", expected: [] },
  { question: "Como instalar uma impressora em 2010?", expected: [] },
];
let top1 = 0;
let found = 0;
for (const item of cases) {
  const result = retrievePopulationContext(item.question);
  // Consultas gerais admitem ambos os trechos da tabela; consultas específicas exigem seu tópico.
  const first = item.expected.length ? item.expected.includes(result[0]?.id) : result.length === 0;
  const hit = item.expected.length ? result.some((document) => item.expected.includes(document.id)) : result.length === 0;
  top1 += Number(first);
  found += Number(hit);
  console.log(`${first ? "PASS" : "FAIL"}: ${item.question} -> ${result.map((document) => document.id).join(", ") || "sem referência"}`);
}
console.log(`Primeiro resultado correto (incluindo buscas vazias): ${top1}/${cases.length}. Referência esperada entre os dois trechos ou vazio correto: ${found}/${cases.length}.`);
console.log("O ano já filtra a tabela. Esta base pequena mede comportamento, não ganho de qualidade do RAG nem compreensão semântica geral.");
if (top1 !== cases.length) process.exitCode = 1;
