import type { PopulationQuery, PopulationResult } from "./population";

export class SidraDataUnavailableError extends Error {}

export function buildPopulationUrl(query: PopulationQuery) {
  return `https://apisidra.ibge.gov.br/values/t/4709/n${query.territory.level}/${query.territory.code}/v/93/p/${query.period}/h/n`;
}

export function parseSidraPopulation(payload: unknown, query: PopulationQuery): PopulationResult {
  // /h/n remove o cabeçalho; a consulta deve produzir exatamente uma observação.
  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new Error("Quantidade inesperada de observações do SIDRA.");
  }
  const row: unknown = payload[0];
  if (!row || typeof row !== "object") throw new Error("Observação inválida.");
  const fields = row as Record<string, unknown>;
  if (fields.NC !== query.territory.level || fields.D1C !== query.territory.code
    || fields.D1N !== query.territory.name || fields.D2C !== "93"
    || fields.D3C !== query.period || fields.D3N !== query.period
    || fields.MC !== "45" || fields.MN !== "Pessoas"
    || fields.D2N !== "População residente" || typeof fields.V !== "string") {
    throw new Error("O dado recebido não corresponde ao recorte solicitado.");
  }
  // Símbolos do SIDRA não são números. '-' representa zero absoluto.
  if (["...", "..", "X"].includes(fields.V)) {
    throw new SidraDataUnavailableError("O SIDRA não disponibilizou um valor numérico para esse recorte.");
  }
  const rawValue = fields.V === "-" ? "0" : fields.V;
  if (!/^\d+$/.test(rawValue) || !Number.isSafeInteger(Number(rawValue))) {
    throw new Error("Valor de população inválido.");
  }
  const value = Number(rawValue);
  return {
    statistic: fields.D2N,
    value,
    formattedValue: new Intl.NumberFormat("pt-BR").format(value),
    unit: fields.MN,
    geography: fields.D1N,
    geographyLevel: query.territory.level === "1" ? "Brasil" : "Unidade da Federação",
    period: fields.D3N,
    note: "Dado do Censo Demográfico 2022. Não representa uma estimativa da população atual.",
    source: {
      name: "IBGE · SIDRA · Censo Demográfico",
      table: "Tabela 4709",
      url: "https://sidra.ibge.gov.br/tabela/4709",
      apiUrl: buildPopulationUrl(query),
    },
  };
}

export async function fetchPopulation(query: PopulationQuery): Promise<PopulationResult> {
  const response = await fetch(buildPopulationUrl(query), {
    next: { revalidate: 60 * 60 * 24 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`SIDRA retornou HTTP ${response.status}.`);
  return parseSidraPopulation(await response.json(), query);
}
