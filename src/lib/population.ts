import {
  DEFAULT_POPULATION_PERIOD, getPopulationDataset, isPopulationPeriod,
  POPULATION_PERIODS, type PopulationPeriod,
} from "./population-catalog";

export type Territory = { code: string; name: string; level: "1" | "3" };

// Códigos conferidos na tabela 4709 do SIDRA.
const states = [
  ["RO", "11", "Rondônia"], ["AC", "12", "Acre"],
  ["AM", "13", "Amazonas"], ["RR", "14", "Roraima"],
  ["PA", "15", "Pará"], ["AP", "16", "Amapá"],
  ["TO", "17", "Tocantins"], ["MA", "21", "Maranhão"],
  ["PI", "22", "Piauí"], ["CE", "23", "Ceará"],
  ["RN", "24", "Rio Grande do Norte"], ["PB", "25", "Paraíba"],
  ["PE", "26", "Pernambuco"], ["AL", "27", "Alagoas"],
  ["SE", "28", "Sergipe"], ["BA", "29", "Bahia"],
  ["MG", "31", "Minas Gerais"], ["ES", "32", "Espírito Santo"],
  ["RJ", "33", "Rio de Janeiro"], ["SP", "35", "São Paulo"],
  ["PR", "41", "Paraná"], ["SC", "42", "Santa Catarina"],
  ["RS", "43", "Rio Grande do Sul"], ["MS", "50", "Mato Grosso do Sul"],
  ["MT", "51", "Mato Grosso"], ["GO", "52", "Goiás"],
  ["DF", "53", "Distrito Federal"],
] as const;

export type PopulationQuery = { territory: Territory; period: PopulationPeriod };
export type PopulationResult = {
  statistic: string;
  value: number;
  formattedValue: string;
  unit: string;
  geography: string;
  geographyLevel: string;
  period: string;
  note: string;
  source: { name: string; table: string; url: string; apiUrl: string };
};

export class QueryError extends Error {}

export function normalizePopulationQuestion(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");
}

const normalize = normalizePopulationQuestion;

export function validateQuestionText(question: unknown): string {
  if (typeof question !== "string" || !question.trim() || question.length > 300) {
    throw new QueryError("Escreva uma pergunta com até 300 caracteres.");
  }
  return question.trim();
}

export const DEFAULT_QUERY: PopulationQuery = {
  territory: { code: "1", name: "Brasil", level: "1" }, period: DEFAULT_POPULATION_PERIOD,
};

const supportedPeriodsMessage = `Consulte um dos censos disponíveis no Senso: ${POPULATION_PERIODS.join(", ")}.`;

export function getQuestionPeriod(question: string): PopulationPeriod {
  const text = normalize(question);
  if (/\b(hoje|atual|atualmente|agora)\b/.test(text)) {
    throw new QueryError(`Os dados são censitários, não uma estimativa da população atual. ${supportedPeriodsMessage}`);
  }
  const years = text.match(/\b\d{4}\b/g) ?? [];
  if (years.length > 1) {
    throw new QueryError("Consulte um ano por vez. Comparações entre censos ainda não são suportadas.");
  }
  const period = years[0] ?? DEFAULT_POPULATION_PERIOD;
  if (!isPopulationPeriod(period)) throw new QueryError(supportedPeriodsMessage);
  return period;
}

export function getPopulationTerritories(): Territory[] {
  return [
    { ...DEFAULT_QUERY.territory },
    ...states.map(([, code, name]): Territory => ({ code, name, level: "3" })),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Valida também objetos em tempo de execução, antes de qualquer acesso à fonte.
// Um futuro interpretador poderá usar este contrato sem escolher URLs ou tabelas.
export function validatePopulationQuery(value: unknown): PopulationQuery {
  if (!isRecord(value) || Object.keys(value).some((key) => !["territory", "period"].includes(key))) {
    throw new QueryError("A consulta deve conter apenas território e período.");
  }
  if (!isPopulationPeriod(value.period)) throw new QueryError(supportedPeriodsMessage);
  const territory = value.territory;
  if (!isRecord(territory) || Object.keys(territory).some((key) => !["code", "name", "level"].includes(key))) {
    throw new QueryError("Território inválido. Consulte Brasil ou uma UF.");
  }
  const knownTerritories = getPopulationTerritories();
  const known = knownTerritories.find((item) => item.code === territory.code
    && item.name === territory.name && item.level === territory.level);
  if (!known || !getPopulationDataset(value.period).levels.includes(known.level)) {
    throw new QueryError("O território não corresponde a um recorte permitido para esse período.");
  }
  return { territory: { ...known }, period: value.period };
}

export function parsePopulationQuestion(question: string): PopulationQuery {
  validateQuestionText(question);
  let text = normalize(question).replace(/[?.!]+$/, "").trim();
  const period = getQuestionPeriod(question);
  text = text.replace(/ (?:em \d{4}|no censo(?: de)? \d{4})$/, "");
  // Reconhecemos a frase inteira: não descartamos filtros desconhecidos.
  const match = text.match(/^qual (?:e |era |foi )?a populacao (?:residente |total )?(?:do|da|de|no|na|em) (.+)$/)
    ?? text.match(/^quantas pessoas (?:moram|moravam|vivem|viviam|residem|residiam) (?:no|na|em) (.+)$/)
    ?? text.match(/^quantos habitantes (?:tem|tinha|ha em) (?:o |a |no |na )?(.+)$/);
  if (!match) {
    throw new QueryError("Ainda reconheço apenas perguntas simples sobre população total. Exemplo: Qual a população de MG em 2022? Não aceito filtros por idade, sexo ou comparações.");
  }
  const location = match[1];
  if (location === "brasil") return validatePopulationQuery({ territory: DEFAULT_QUERY.territory, period });
  const explicitState = /^(?:estado|uf) (?:de|do|da) /.test(location);
  const name = location.replace(/^(?:estado|uf) (?:de|do|da) /, "");
  const state = states.find(([abbreviation, , fullName]) =>
    normalize(abbreviation) === name || normalize(fullName) === name);
  if (!state) {
    throw new QueryError("Consulte Brasil ou uma UF por nome ou sigla, uma por vez. Municípios, regiões e outros recortes ainda não são suportados.");
  }
  if (!explicitState && ["sao paulo", "rio de janeiro"].includes(name)) {
    throw new QueryError("Você quer o estado ou a cidade? Por enquanto consulto estados: use SP, RJ ou escreva ‘estado de São Paulo’ / ‘estado do Rio de Janeiro’.");
  }
  return validatePopulationQuery({ territory: { code: state[1], name: state[2], level: "3" }, period });
}
