import "server-only";
import historical from "../data/sidra/202.json";
import current from "../data/sidra/4709.json";
import census2022 from "../data/methodology/censo-2022.json";
import { getPopulationDataset, POPULATION_PERIODS } from "./population-catalog";
import { normalizePopulationQuestion, QueryError, validateQuestionText } from "./population";

export type SourceFact = {
  id: string;
  table: string;
  topic: string;
  period?: string;
  text: string;
  evidence: string;
  evidenceType?: string;
  source: { title: string; url: string; retrievedAt: string; locator?: string };
};

const metadataFacts: SourceFact[] = [historical, current].flatMap((snapshot) => {
  const { metadata, periods } = snapshot;
  const table = String(metadata.id);
  const supportedYears = POPULATION_PERIODS.filter((period) => getPopulationDataset(period).table === table);
  const variable = metadata.variaveis.find((v) => v.id === 93)!;
  const fact = (topic: string, text: string, evidence: string, url = snapshot.metadataUrl): SourceFact => ({
    id: `${table}-${topic}`, table, topic, text, evidence,
    source: { title: `IBGE · Tabela ${table} · ${metadata.nome}`, url, retrievedAt: snapshot.retrievedAt },
  });
  return [
    fact("table", `Para consultar população residente nos anos ${supportedYears.join(" e ")}, o Senso AI usa a tabela ${table}, da pesquisa ${metadata.pesquisa}. Seu título oficial é “${metadata.nome}”.`,
      `Tabela ${table}; pesquisa: ${metadata.pesquisa}; título: ${metadata.nome}.`),
    fact("periods", `A fonte da tabela ${table} lista os anos ${periods.map((p) => p.id).join(", ")}. O Senso AI habilita ${supportedYears.join(" e ")} nessa tabela. A presença de outros anos na fonte não habilita automaticamente essas consultas no aplicativo.`,
      `IDs dos períodos disponíveis: ${periods.map((p) => p.id).join(", ")}.`, snapshot.periodsUrl),
    fact("unit", `Na tabela ${table}, a variável ${variable.id} é “${variable.nome}” e sua unidade é ${variable.unidade}. Essa é a variável usada nas consultas de população do Senso AI.`,
      `Variável ${variable.id}: ${variable.nome}; unidade: ${variable.unidade}.`),
    fact("scope", `A tabela ${table} oferece os níveis territoriais ${metadata.nivelTerritorial.Administrativo.join(", ")}. O Senso AI habilita somente Brasil (N1) e unidades da federação (N3), incluindo o Distrito Federal.`,
      `Níveis administrativos disponíveis: ${metadata.nivelTerritorial.Administrativo.join(", ")}.`),
    fact("classifications", metadata.classificacoes.length
      ? `A tabela ${table} possui as classificações ${metadata.classificacoes.map((c) => c.nome).join(" e ")}. Para população total, o Senso AI seleciona a categoria Total (0) em ambas. Consultas por sexo ou situação do domicílio ainda não estão habilitadas no aplicativo.`
      : `A tabela ${table} não possui classificações adicionais. Para obter população residente, o Senso AI seleciona a variável 93 e os filtros de período e território.`,
      metadata.classificacoes.length ? metadata.classificacoes.map((c) => `${c.nome} (${c.id}): ${c.categorias.map((v) => `${v.nome} (${v.id})`).join(", ")}`).join("; ") : "Classificações: lista vazia."),
  ];
});

export const sourceFacts: SourceFact[] = [...metadataFacts, ...census2022.facts.map((fact) => ({
  id: fact.id, table: fact.table, period: fact.period, topic: fact.topic,
  text: fact.text, evidence: fact.evidence, evidenceType: fact.evidenceType,
  source: {
    title: census2022.title, url: `${census2022.url}#page=${fact.pdfPage}`, retrievedAt: census2022.retrievedAt,
    locator: `${fact.section} · p. ${fact.printedPage} impressa (p. ${fact.pdfPage} do PDF)`,
  },
}))];

/** Referências explícitas são filtros, nunca anos deduzidos de um código de tabela. */
export function retrieveSourceFacts(input: string): SourceFact[] {
  const question = normalizePopulationQuestion(validateQuestionText(input));
  const references = [...question.matchAll(/\btabela\s+(\d+)\b/g)].map((match) => match[1]);
  if (references.some((table) => table !== "202" && table !== "4709")) {
    throw new QueryError("A base de fontes contém somente as tabelas 202 e 4709.");
  }
  if (new Set(references).size > 1) throw new QueryError("Pergunte sobre uma tabela por vez.");
  const withoutTables = question.replace(/\btabela\s+\d+\b/g, "");
  const years = [...new Set(withoutTables.match(/\b\d{4}\b/g) ?? [])];
  if (years.length > 1) throw new QueryError("Indique um único ano ou pergunte pelos períodos de uma tabela.");
  let table = references[0];
  if (years.length) {
    const matching = [historical, current].filter((snapshot) => snapshot.periods.some((p) => p.id === years[0]));
    if (!matching.length || (table && !matching.some((s) => String(s.metadata.id) === table))) {
      throw new QueryError("Não há referência compatível com essa combinação de tabela e ano na base local.");
    }
    table ||= String(matching[0].metadata.id);
  }
  if (!table) throw new QueryError("Indique a tabela 202 ou 4709, ou um ano, como 2010 ou 2022, para identificar a fonte.");
  // Base pequena: preservar os fatos da tabela, respeitando o ano de notas metodológicas.
  return sourceFacts.filter((fact) => fact.table === table && (!fact.period || !years.length || fact.period === years[0]));
}
