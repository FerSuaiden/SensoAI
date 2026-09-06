// Recortes conferidos nos descritores oficiais das tabelas 202 e 4709.
// O catálogo contém metadados; os números são obtidos na API do SIDRA.
export const POPULATION_PERIODS = ["2000", "2010", "2022"] as const;
export type PopulationPeriod = (typeof POPULATION_PERIODS)[number];
export const DEFAULT_POPULATION_PERIOD: PopulationPeriod = "2022";

type Classification = {
  code: string;
  name: string;
  categoryCode: string;
  categoryName: string;
};

type PopulationDataset = {
  table: string;
  variable: string;
  statistic: string;
  unitCode: string;
  unitName: string;
  levels: readonly string[];
  classifications: readonly Classification[];
};

const census202: PopulationDataset = {
  table: "202",
  variable: "93",
  statistic: "População residente",
  unitCode: "45",
  unitName: "Pessoas",
  levels: ["1", "3"],
  // A ordem determina D4 (sexo) e D5 (situação) na resposta do SIDRA.
  classifications: [
    { code: "2", name: "Sexo", categoryCode: "0", categoryName: "Total" },
    { code: "1", name: "Situação do domicílio", categoryCode: "0", categoryName: "Total" },
  ],
};

const census4709: PopulationDataset = {
  table: "4709",
  variable: "93",
  statistic: "População residente",
  unitCode: "45",
  unitName: "Pessoas",
  levels: ["1", "3"],
  classifications: [],
};

const datasets: Record<PopulationPeriod, PopulationDataset> = {
  "2000": census202,
  "2010": census202,
  "2022": census4709,
};

export function isPopulationPeriod(value: unknown): value is PopulationPeriod {
  return POPULATION_PERIODS.some((period) => period === value);
}

export function getPopulationDataset(period: PopulationPeriod) {
  return datasets[period];
}
