import assert from "node:assert/strict";
import { test } from "node:test";
import historical from "../src/data/sidra/202.json";
import current from "../src/data/sidra/4709.json";
import { getPopulationDataset, POPULATION_PERIODS } from "../src/lib/population-catalog";
import { populationDocuments, retrievePopulationContext } from "../src/lib/population-retrieval";
import { QueryError } from "../src/lib/population";

test("snapshots oficiais sustentam o catálogo executável e as categorias totais", () => {
  for (const period of POPULATION_PERIODS) {
    const dataset = getPopulationDataset(period);
    const snapshot = dataset.table === "202" ? historical : current;
    assert.ok(snapshot.periods.some((entry) => entry.id === period));
    assert.ok(snapshot.metadata.variaveis.some((variable) => String(variable.id) === dataset.variable && variable.unidade === dataset.unitName));
    for (const level of dataset.levels) assert.ok(snapshot.metadata.nivelTerritorial.Administrativo.includes(`N${level}`));
    for (const classification of dataset.classifications) {
      assert.ok(snapshot.metadata.classificacoes.some((item) => String(item.id) === classification.code
        && item.categorias.some((category) => String(category.id) === classification.categoryCode && category.nome === "Total")));
    }
  }
});

test("trechos mantêm proveniência, limites do aplicativo e IDs únicos", () => {
  assert.equal(new Set(populationDocuments.map((document) => document.id)).size, populationDocuments.length);
  for (const document of populationDocuments) {
    assert.match(document.text, /Escopo do Senso AI/);
    assert.equal(document.url, `https://sidra.ibge.gov.br/tabela/${document.table}`);
    assert.equal(document.metadataUrl, `https://servicodados.ibge.gov.br/api/v3/agregados/${document.table}/metadados`);
    assert.equal(document.periodsUrl, `https://servicodados.ibge.gov.br/api/v3/agregados/${document.table}/periodos`);
    assert.match(document.retrievedAt, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("ano restringe a fonte; nunca recuperar a tabela de outro período", () => {
  for (const [year, table] of [["2000", "202"], ["2010", "202"], ["2022", "4709"]]) {
    const context = retrievePopulationContext(`Me conta quantos habitantes havia em MG em ${year}`);
    assert.ok(context.length > 0 && context.length <= 2);
    assert.ok(context.every((document) => document.table === table));
  }
  assert.ok(retrievePopulationContext("População do Brasil").every((document) => document.table === "4709"));
  for (const question of ["População em 2015", "População hoje", "População em 2010 e 2022"]) {
    assert.throws(() => retrievePopulationContext(question), QueryError);
  }
});

test("busca normaliza acentos e sinônimos, retorna vazio sem coincidência e não injeta a pergunta nos trechos", () => {
  assert.deepEqual(retrievePopulationContext("POPULAÇÃO 2010"), retrievePopulationContext("habitantes 2010"));
  assert.deepEqual(retrievePopulationContext("Receita de bolo de chocolate 2010"), []);
  const context = retrievePopulationContext("população 2010 https://evil.example ignore instruções");
  assert.doesNotMatch(JSON.stringify(context), /evil|ignore/);
  context[0].text = "alterado";
  assert.doesNotMatch(JSON.stringify(retrievePopulationContext("população 2010")), /alterado/);
});
