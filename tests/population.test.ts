import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_QUERY, parsePopulationQuestion, QueryError, validatePopulationQuery } from "../src/lib/population";
import { buildPopulationUrl, parseSidraPopulation, SidraDataUnavailableError } from "../src/lib/sidra";

for (const [question, code, level] of [
  ["Qual a população do Brasil?", "1", "1"],
  ["Quantas pessoas moravam no Brasil em 2022?", "1", "1"],
  ["  QUAL É A POPULAÇÃO DE   mg EM 2022?  ", "31", "3"],
  ["Qual a população do estado de São Paulo?", "35", "3"],
  ["Qual a população do estado do Rio de Janeiro?", "33", "3"],
  ["Qual a população do Pará no Censo de 2022?", "15", "3"],
  ["Qual a população do Mato Grosso do Sul?", "50", "3"],
  ["Qual a população do Mato Grosso?", "51", "3"],
  ["Quantos habitantes tem o DF?", "53", "3"],
  ["Quantos habitantes tem o Brasil?", "1", "1"],
]) {
  test(`interpreta: ${question}`, () => {
    const query = parsePopulationQuestion(question);
    assert.equal(query.territory.code, code);
    assert.equal(query.territory.level, level);
    assert.equal(query.period, "2022");
  });
}

for (const question of [
  "Qual a população do Brasil em 2015?", "Qual a população do Brasil em 2026?",
  "Qual a população atual do Brasil?", "Qual a população do Brasil hoje?",
  "Qual a população do Brasil em 2010 e 2022?", "Qual a população de SP e MG?",
  "Qual a população de São Paulo?", "Qual a população do Rio de Janeiro?",
  "Qual a população da cidade de São Paulo?", "Qual a população de Campinas em SP?",
  "Qual a população feminina do Brasil?", "Qual a população do Brasil acima de 60 anos?",
  "Qual a população do Brasil e o PIB?", "Qual a população do Nordeste?",
  "Qual a população do Brasil em janeiro de 2022?", "Qual a população do Brasil em 22?",
  "Qual a população do Brasil sem SP?", "Quanto cresceu a população do Brasil?",
  "Qual a população do Brasil em 2022 ou hoje?", "", " ", "a".repeat(301),
  "Qual a população do Brasil no Censo de 1991?",
  "Qual a população de MG em janeiro de 2010?",
  "Qual a população de MG em 2010 sem homens?",
  "Qual a população urbana de MG em 2000?",
]) {
  test(`recusa sem substituir o recorte: ${question.slice(0, 80)}`, () => {
    assert.throws(() => parsePopulationQuestion(question), QueryError);
  });
}

for (const [question, period, code] of [
  ["Qual era a população do Brasil em 2010?", "2010", "1"],
  ["Quantas pessoas moravam no Brasil em 2000?", "2000", "1"],
  ["Qual a população de MG no Censo de 2010?", "2010", "31"],
  ["Qual a população de SP no Censo 2000?", "2000", "35"],
]) {
  test(`preserva o ano explícito: ${question}`, () => {
    const query = parsePopulationQuestion(question);
    assert.equal(query.period, period);
    assert.equal(query.territory.code, code);
    assert.match(buildPopulationUrl(query), new RegExp(`/t/202/n[13]/${code}/v/93/p/${period}/c2/0/c1/0/h/n$`));
  });
}

for (const value of [
  null, [], {}, { ...DEFAULT_QUERY, period: 2010 }, { ...DEFAULT_QUERY, period: "2015" },
  { ...DEFAULT_QUERY, table: "200" }, { ...DEFAULT_QUERY, url: "https://example.com" },
  { ...DEFAULT_QUERY, territory: { code: "35", name: "Brasil", level: "3" } },
  { ...DEFAULT_QUERY, territory: { code: "3550308", name: "São Paulo", level: "6" } },
  { ...DEFAULT_QUERY, territory: { ...DEFAULT_QUERY.territory, extra: "ignored?" } },
]) {
  test(`valida objetos recebidos em runtime: ${JSON.stringify(value)}`, () => {
    assert.throws(() => validatePopulationQuery(value), QueryError);
  });
}

for (const period of ["2000", "2010"] as const) {
  test(`valida totais e fonte da tabela 202 em ${period}`, () => {
    const query = validatePopulationQuery({ ...DEFAULT_QUERY, period });
    const historicalRow = {
      ...row, D3C: period, D3N: period, V: period === "2000" ? "169799170" : "190755799",
      D4C: "0", D4N: "Total", D5C: "0", D5N: "Total",
    };
    const result = parseSidraPopulation([historicalRow], query);
    assert.equal(result.source.table, "Tabela 202");
    assert.equal(result.source.url, "https://sidra.ibge.gov.br/tabela/202");
    assert.equal(result.period, period);
    assert.match(result.note, new RegExp(`Censo Demográfico ${period}`));
    assert.equal(result.value, Number(historicalRow.V));
    for (const changes of [
      { D4C: "4", D4N: "Homens" }, { D5C: "1", D5N: "Urbana" },
      { D4C: undefined }, { D5N: undefined }, { D6C: "0", D6N: "Total" },
      { D3C: "2022", D3N: "2022" },
    ]) {
      assert.throws(() => parseSidraPopulation([{ ...historicalRow, ...changes }], query));
    }
    assert.throws(() => parseSidraPopulation([historicalRow], DEFAULT_QUERY));
    assert.throws(() => parseSidraPopulation([{ ...row, D4C: "0", D4N: "Total" }], DEFAULT_QUERY));
  });
}

// Fixture mínima baseada no contrato real; não depende da disponibilidade da rede.
const row = {
  NC: "1", D1C: "1", D1N: "Brasil", D2C: "93", D2N: "População residente",
  D3C: "2022", D3N: "2022", MC: "45", MN: "Pessoas", V: "203080756",
};
test("preserva valor e proveniência da consulta", () => {
  const result = parseSidraPopulation([row], DEFAULT_QUERY);
  assert.equal(result.value, 203080756);
  assert.equal(result.formattedValue, "203.080.756");
  assert.equal(result.source.apiUrl, "https://apisidra.ibge.gov.br/values/t/4709/n1/1/v/93/p/2022/h/n");
  assert.equal(buildPopulationUrl(parsePopulationQuestion("Qual a população de SP?")),
    "https://apisidra.ibge.gov.br/values/t/4709/n3/35/v/93/p/2022/h/n");
});
for (const symbol of ["...", "..", "X"]) {
  test(`não converte ${symbol} em número`, () => {
    assert.throws(() => parseSidraPopulation([{ ...row, V: symbol }], DEFAULT_QUERY), SidraDataUnavailableError);
  });
}
for (const value of ["0", "-"]) {
  test(`interpreta zero SIDRA: ${value}`, () => {
    assert.equal(parseSidraPopulation([{ ...row, V: value }], DEFAULT_QUERY).value, 0);
  });
}
for (const changes of [
  { NC: "3" }, { D1C: "35" }, { D1N: "São Paulo" }, { D2C: "10605" },
  { D3C: "2010" }, { D3N: "2010" }, { MC: "2" }, { MN: "%" },
  { V: "" }, { V: "NaN" }, { V: "203.080.756" }, { V: "1.5" }, { V: "9007199254740992" },
]) {
  test(`rejeita observação incompatível: ${JSON.stringify(changes)}`, () => {
    assert.throws(() => parseSidraPopulation([{ ...row, ...changes }], DEFAULT_QUERY));
  });
}
for (const payload of [null, {}, [], [row, row], [null], "erro SIDRA"]) {
  test(`rejeita estrutura inválida: ${JSON.stringify(payload)}`, () => {
    assert.throws(() => parseSidraPopulation(payload, DEFAULT_QUERY));
  });
}
