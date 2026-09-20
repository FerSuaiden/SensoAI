import { getPopulationDataset, POPULATION_PERIODS } from "../../src/lib/population-catalog";

export const TABLES = ["202", "4709"] as const;
export type Table = (typeof TABLES)[number];
type Named = { id: number; nome: string; [key: string]: unknown };
export type Snapshot = {
  retrievedAt: string;
  metadataUrl: string;
  periodsUrl: string;
  metadata: {
    id: number; nome: string; URL: string; pesquisa: string;
    nivelTerritorial: { Administrativo: string[]; [key: string]: unknown };
    variaveis: (Named & { unidade: string })[];
    classificacoes: (Named & { categorias: Named[] })[];
    [key: string]: unknown;
  };
  periods: { id: string; [key: string]: unknown }[];
};

export function sourceUrls(table: Table) {
  const base = `https://servicodados.ibge.gov.br/api/v3/agregados/${table}`;
  return { metadataUrl: `${base}/metadados`, periodsUrl: `${base}/periodos` };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function unique(values: unknown[]) { return new Set(values).size === values.length; }
function named(value: unknown): value is Named {
  return record(value) && Number.isSafeInteger(value.id) && (value.id as number) >= 0 && text(value.nome);
}
export function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/** Valida os campos lidos pelo app e os pressupostos das consultas e explicações. */
export function validateSnapshot(value: unknown, table: Table): asserts value is Snapshot {
  const fail = (detail: string): never => { throw new Error(`Tabela ${table}: ${detail}`); };
  const urls = sourceUrls(table);
  if (!record(value) || !validDate(value.retrievedAt)
    || value.metadataUrl !== urls.metadataUrl || value.periodsUrl !== urls.periodsUrl) fail("proveniência inválida.");
  const snapshot = value as Record<string, unknown>;
  const metadata = snapshot.metadata;
  if (!record(metadata) || metadata.id !== Number(table) || !text(metadata.nome)
    || metadata.URL !== `https://sidra.ibge.gov.br/tabela/${table}`
    || metadata.pesquisa !== "Censo Demográfico") fail("identidade da fonte incompatível.");
  const meta = metadata as Snapshot["metadata"];
  if (!record(meta.nivelTerritorial) || !Array.isArray(meta.nivelTerritorial.Administrativo)
    || !meta.nivelTerritorial.Administrativo.every((level) => typeof level === "string" && /^N\d+$/.test(level))
    || !unique(meta.nivelTerritorial.Administrativo)) fail("níveis territoriais inválidos.");
  if (!Array.isArray(meta.variaveis) || !meta.variaveis.every((v) => named(v) && text(v.unidade))
    || !unique(meta.variaveis.map((v) => v.id))) fail("variáveis inválidas ou duplicadas.");
  if (!Array.isArray(meta.classificacoes) || !meta.classificacoes.every((c) => named(c) && Array.isArray(c.categorias)
    && c.categorias.every(named) && unique(c.categorias.map((category) => category.id)))
    || !unique(meta.classificacoes.map((c) => c.id))) fail("classificações inválidas ou duplicadas.");
  if (!Array.isArray(snapshot.periods) || !snapshot.periods.length
    || !snapshot.periods.every((p) => record(p) && typeof p.id === "string" && /^\d{4}$/.test(p.id))
    || !unique(snapshot.periods.map((p) => p.id))) fail("períodos inválidos ou duplicados.");
  const periods = snapshot.periods as Snapshot["periods"];
  for (const period of POPULATION_PERIODS) {
    const dataset = getPopulationDataset(period);
    if (dataset.table !== table) continue;
    if (!periods.some((p) => p.id === period)) fail(`período ${period} usado pelo aplicativo foi removido.`);
    if (!meta.variaveis.some((v) => String(v.id) === dataset.variable && v.nome === dataset.statistic && v.unidade === dataset.unitName)) {
      fail("variável de população ou sua unidade mudou.");
    }
    if (!dataset.levels.every((level) => meta.nivelTerritorial.Administrativo.includes(`N${level}`))) fail("recorte territorial usado pelo aplicativo foi removido.");
    if (meta.classificacoes.length !== dataset.classifications.length
      || !dataset.classifications.every((expected) => meta.classificacoes.some((c) => String(c.id) === expected.code && c.nome === expected.name
        && c.categorias.some((category) => String(category.id) === expected.categoryCode && category.nome === expected.categoryName)))) {
      fail("classificações ou categorias totais incompatíveis com o catálogo.");
    }
  }
}

// A ordem das chaves JSON não representa mudança de conteúdo; a ordem de arrays é preservada.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export type Change = { path: string; kind: "added" | "removed" | "changed"; before: unknown; after: unknown };
export function contentChanges(before: unknown, after: unknown, path = ""): Change[] {
  if (canonical(before) === canonical(after)) return [];
  if (record(before) && record(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap((key) =>
      contentChanges(before[key], after[key], `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`));
  }
  return [{ path, kind: before === undefined ? "added" : after === undefined ? "removed" : "changed",
    before: before === undefined ? null : before, after: after === undefined ? null : after }];
}
