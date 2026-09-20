import { NextResponse } from "next/server";
import { readQuestion, RequestInputError } from "@/lib/api-question";
import { QueryError } from "@/lib/population";
import { InterpretationError } from "@/lib/population-interpretation";
import { explainSource } from "@/lib/source-explanation";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    return json(await explainSource(await readQuestion(request)));
  } catch (error) {
    if (error instanceof RequestInputError) return json({ error: error.message }, error.status);
    if (error instanceof QueryError) return json({ error: error.message }, 400);
    if (error instanceof InterpretationError) return json({ error: error.message }, error.status);
    return json({ error: "Não foi possível explicar a fonte agora. Tente novamente em instantes." }, 502);
  }
}
