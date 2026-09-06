import "server-only";
import historical from "../data/sidra/202.json";
import current from "../data/sidra/4709.json";
import { getQuestionPeriod, normalizePopulationQuestion, validateQuestionText } from "./population";
import { getPopulationDataset, POPULATION_PERIODS } from "./population-catalog";

export type PopulationSnippet = {
  id: string;
  table: string;
  title: string;
  text: string;
  url: string;
  metadataUrl: string;
  periodsUrl: string;
  retrievedAt: string;
};

// Cada trecho conserva sua fonte e separa capacidades do IBGE do escopo do aplicativo.
export const populationDocuments = [historical, current].flatMap((snapshot) => {
  const { metadata, periods } = snapshot;
  const table = String(metadata.id);
  const allowed = POPULATION_PERIODS.filter((period) => getPopulationDataset(period).table === table);
  const common = {
    table, url: metadata.URL, metadataUrl: snapshot.metadataUrl,
    periodsUrl: snapshot.periodsUrl, retrievedAt: snapshot.retrievedAt,
  };
  return [
    {
      ...common, id: `${table}-overview`, title: `Tabela ${table} — descrição e períodos`,
      text: `Título oficial: ${metadata.nome}. Pesquisa: ${metadata.pesquisa}. `
        + `Períodos listados pelo IBGE: ${periods.map((period) => period.id).join(", ")}. `
        + `Variáveis oficiais: ${metadata.variaveis.map((v) => `${v.nome} (${v.id}), unidade ${v.unidade}`).join("; ")}. `
        + `Escopo do Senso AI: população residente total (variável 93), nos anos ${allowed.join(", ")}. `
        + "Outras variáveis e anos listados na fonte não estão habilitados no aplicativo.",
    },
    {
      ...common, id: `${table}-scope`, title: `Tabela ${table} — recortes e classificações`,
      text: `A tabela ${table}, da pesquisa ${metadata.pesquisa}, oferece população residente. `
        + `Níveis administrativos oficiais: ${metadata.nivelTerritorial.Administrativo.join(", ")}. `
        + (metadata.classificacoes.length
          ? `Classificações oficiais: ${metadata.classificacoes.map((c) => `${c.nome} (${c.id}): ${c.categorias.map((category) => `${category.nome} (${category.id})`).join(", ")}`).join("; ")}. `
          : "A tabela não possui classificações adicionais. ")
        + "Escopo do Senso AI: Brasil (N1) e UFs (N3), incluindo o Distrito Federal. "
        + (metadata.classificacoes.length
          ? "Para população total, selecionamos Total (0) em Sexo (2) e Situação do domicílio (1). "
          : "Selecionamos somente a variável população residente (93). ")
        + "Municípios, comparações, crescimento e filtros demográficos não estão habilitados no aplicativo.",
    },
  ];
});

const stopWords = new Set(["qual", "quais", "quantos", "quantas", "como", "para", "pela", "pelo", "uma", "com", "que", "dos", "das", "nos", "nas", "por", "sobre", "havia", "era", "tem", "tinha", "diga", "conta", "gostaria", "saber"]);
function tokens(text: string) {
  const normalized = normalizePopulationQuestion(text)
    .replace(/\b(habitantes?|moradores?|pessoas|brasileiros|brasileiras)\b/g, "populacao");
  return new Set((normalized.match(/[a-z]+/g) ?? []).filter((word) => word.length > 2 && !stopWords.has(word)));
}

/** Busca lexical de referência: ano como filtro exato, interseção de termos como ranking. */
export function retrievePopulationContext(input: string): PopulationSnippet[] {
  const question = validateQuestionText(input);
  const period = getQuestionPeriod(question);
  const table = getPopulationDataset(period).table;
  const queryTokens = tokens(question);
  return populationDocuments.filter((document) => document.table === table)
    .map((document) => {
      const documentTokens = tokens(`${document.title} ${document.text}`);
      const score = [...queryTokens].filter((token) => documentTokens.has(token)).length;
      return { document, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.document.id.localeCompare(b.document.id))
    .slice(0, 2)
    .map(({ document }) => ({ ...document }));
}
