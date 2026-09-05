import { NextResponse } from "next/server";
import { DEFAULT_QUERY, parsePopulationQuestion, QueryError } from "@/lib/population";
import { fetchPopulation, SidraDataUnavailableError } from "@/lib/sidra";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => key !== "pergunta") || params.getAll("pergunta").length > 1) {
      throw new QueryError("Use apenas o parâmetro ‘pergunta’, uma única vez.");
    }
    const question = params.get("pergunta");
    const query = question === null ? DEFAULT_QUERY : parsePopulationQuestion(question);
    return NextResponse.json(await fetchPopulation(query));
  } catch (error) {
    if (error instanceof QueryError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SidraDataUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Erro ao consultar população no SIDRA", error);
    return NextResponse.json({
      error: "Não foi possível consultar a fonte oficial do IBGE agora. Tente novamente em instantes.",
    }, { status: 502 });
  }
}
