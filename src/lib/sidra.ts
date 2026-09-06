import { validatePopulationQuery, type PopulationQuery, type PopulationResult } from "./population";
import { getPopulationDataset } from "./population-catalog";

export class SidraDataUnavailableError extends Error {}

export function buildPopulationUrl(query: PopulationQuery) {
  const validated = validatePopulationQuery(query);
  const dataset = getPopulationDataset(validated.period);
  const classifications = dataset.classifications
    .map((item) => `/c${item.code}/${item.categoryCode}`).join("");
  return `https://apisidra.ibge.gov.br/values/t/${dataset.table}/n${validated.territory.level}/${validated.territory.code}/v/${dataset.variable}/p/${validated.period}${classifications}/h/n`;
}

export function parseSidraPopulation(payload: unknown, query: PopulationQuery): PopulationResult {
  query = validatePopulationQuery(query);
  const dataset = getPopulationDataset(query.period);
  // /h/n remove o cabeçalho; a consulta deve produzir exatamente uma observação.
  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new Error("Quantidade inesperada de observações do SIDRA.");
  }
  const row: unknown = payload[0];
  if (!row || typeof row !== "object") throw new Error("Observação inválida.");
  const fields = row as Record<string, unknown>;
  if (fields.NC !== query.territory.level || fields.D1C !== query.territory.code
    || fields.D1N !== query.territory.name || fields.D2C !== dataset.variable
    || fields.D3C !== query.period || fields.D3N !== query.period
    || fields.MC !== dataset.unitCode || fields.MN !== dataset.unitName
    || fields.D2N !== dataset.statistic || typeof fields.V !== "string") {
    throw new Error("O dado recebido não corresponde ao recorte solicitado.");
  }
  for (const [index, classification] of dataset.classifications.entries()) {
    const dimension = index + 4;
    if (fields[`D${dimension}C`] !== classification.categoryCode
      || fields[`D${dimension}N`] !== classification.categoryName) {
      throw new Error(`A categoria de ${classification.name} não corresponde ao total solicitado.`);
    }
  }
  const dimensionCount = 3 + dataset.classifications.length;
  if (Object.keys(fields).some((key) => /^D\d+[CN]$/.test(key) && Number(key.slice(1, -1)) > dimensionCount)) {
    throw new Error("O SIDRA retornou dimensões que não fazem parte desta consulta.");
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
    statistic: dataset.statistic,
    value,
    formattedValue: new Intl.NumberFormat("pt-BR").format(value),
    unit: dataset.unitName,
    geography: fields.D1N,
    geographyLevel: query.territory.level === "1" ? "Brasil" : "Unidade da Federação",
    period: query.period,
    note: `Dado do Censo Demográfico ${query.period}. Não representa uma estimativa da população atual.`,
    source: {
      name: "IBGE · SIDRA · Censo Demográfico",
      table: `Tabela ${dataset.table}`,
      url: `https://sidra.ibge.gov.br/tabela/${dataset.table}`,
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
