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

export type PopulationQuery = { territory: Territory; period: "2022" };
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

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");
}

export const DEFAULT_QUERY: PopulationQuery = {
  territory: { code: "1", name: "Brasil", level: "1" }, period: "2022",
};

export function parsePopulationQuestion(question: string): PopulationQuery {
  if (!question.trim() || question.length > 300) {
    throw new QueryError("Escreva uma pergunta com até 300 caracteres.");
  }
  let text = normalize(question).replace(/[?.!]+$/, "").trim();
  if (/\b(hoje|atual|atualmente|agora)\b/.test(text)) {
    throw new QueryError("Este recorte mostra o Censo 2022, não a população atual. Pergunte pela população em 2022.");
  }
  const years = text.match(/\b\d{4}\b/g) ?? [];
  if (years.some((year) => year !== "2022") || years.length > 1) {
    throw new QueryError("Este recorte da tabela 4709 oferece apenas 2022. Outros anos e comparações ainda não são suportados.");
  }
  text = text.replace(/ (?:em 2022|no censo(?: de)? 2022)$/, "");
  // Reconhecemos a frase inteira: não descartamos filtros desconhecidos.
  const match = text.match(/^qual (?:e |era |foi )?a populacao (?:residente |total )?(?:do|da|de|no|na|em) (.+)$/)
    ?? text.match(/^quantas pessoas (?:moram|moravam|vivem|viviam|residem|residiam) (?:no|na|em) (.+)$/)
    ?? text.match(/^quantos habitantes (?:tem|tinha|ha em) (?:o |a |no |na )?(.+)$/);
  if (!match) {
    throw new QueryError("Ainda reconheço apenas perguntas simples sobre população total. Exemplo: Qual a população de MG em 2022? Não aceito filtros por idade, sexo ou comparações.");
  }
  const location = match[1];
  if (location === "brasil") return DEFAULT_QUERY;
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
  return { territory: { code: state[1], name: state[2], level: "3" }, period: "2022" };
}
