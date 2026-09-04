import { NextResponse } from "next/server";

const SIDRA_URL = "https://apisidra.ibge.gov.br/values/t/4709/n1/1/v/93/p/last%201";
type SidraRow = Record<string, string>;
function formatBrazilianNumber(value: string) { return new Intl.NumberFormat("pt-BR").format(Number(value.replaceAll(".", "").replace(",", "."))); }

export async function GET() {
  try {
    const response = await fetch(SIDRA_URL, { next: { revalidate: 60 * 60 * 24 } });
    if (!response.ok) throw new Error(`A API do IBGE retornou ${response.status}.`);
    const rows = (await response.json()) as SidraRow[];
    const result = rows[1]; // A primeira linha contém os nomes das colunas.
    if (!result?.V || !result.D3N) throw new Error("A resposta da API não possui o formato esperado.");
    return NextResponse.json({ statistic: result.D2N, formattedValue: formatBrazilianNumber(result.V), unit: result.MN, geography: result.D1N, period: result.D3N, source: { name: "IBGE · SIDRA", table: "Tabela 4709", url: "https://sidra.ibge.gov.br/tabela/4709" } });
  } catch (error) {
    console.error("Erro ao consultar população no SIDRA", error);
    return NextResponse.json({ error: "Não foi possível consultar a fonte oficial do IBGE agora. Tente novamente em instantes." }, { status: 502 });
  }
}
