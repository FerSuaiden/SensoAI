import assert from "node:assert/strict";
import { test } from "node:test";
import document from "../src/data/methodology/censo-2022.json";
import { retrieveSourceFacts, sourceFacts } from "../src/lib/source-facts";
import { validateSourceSelection } from "../src/lib/source-explanation";
import { InterpretationError } from "../src/lib/population-interpretation";
import { checkMethodologyDocument } from "../scripts/lib/methodology-check";

test("notas de 2022 só estão disponíveis no contexto correspondente", () => {
  for (const question of ["População residente no Censo 2010", "Data de referência em 2000", "Conceito na tabela 202"]) {
    const context = retrieveSourceFacts(question);
    assert.ok(context.every((fact) => fact.period !== "2022"));
    assert.throws(() => validateSourceSelection({ status: "supported", factIds: ["2022-resident-definition"] }, context), InterpretationError);
  }
  for (const question of ["População residente no Censo 2022", "Data de referência na tabela 4709"]) {
    const context = retrieveSourceFacts(question);
    assert.ok(context.some((fact) => fact.id === "2022-resident-definition"));
    assert.ok(context.some((fact) => fact.id === "2022-reference-date"));
  }
});

test("proveniência metodológica inclui versão, página física e página do PDF", () => {
  assert.match(document.sha256, /^[a-f0-9]{64}$/);
  assert.equal(document.publishedYear, "2023");
  assert.equal(new Set(sourceFacts.map((fact) => fact.id)).size, sourceFacts.length);
  for (const fact of document.facts) {
    assert.equal(fact.period, "2022");
    assert.equal(fact.table, "4709");
    assert.equal(fact.printedPage, 11);
    assert.equal(fact.pdfPage, 16);
    const source = sourceFacts.find((item) => item.id === fact.id)!.source;
    assert.equal(source.url, `${document.url}#page=16`);
    assert.match(source.locator!, /11 impressa.*16 do PDF/);
    assert.equal(source.retrievedAt, document.retrievedAt);
  }
});

test("checagem do PDF detecta mudança, falha HTTP e resposta HTML sem chamar LLM", async () => {
  const changed = await checkMethodologyDocument(async (input, init) => {
    assert.equal(String(input), document.url);
    assert.equal(init?.redirect, "error");
    return new Response("%PDF-1.7\nversão diferente");
  });
  assert.equal(changed.unchanged, false);
  assert.equal(changed.expectedHash, document.sha256);
  await assert.rejects(() => checkMethodologyDocument(async () => new Response("indisponível", { status: 503 })), /HTTP 503/);
  await assert.rejects(() => checkMethodologyDocument(async () => new Response("<html>erro</html>")), /não retornou um PDF/);
});
