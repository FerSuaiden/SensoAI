import { NextResponse } from "next/server";
import { interpretQuestion } from "@/lib/interpret-question";
import { QueryError } from "@/lib/population";
import { InterpretationError } from "@/lib/population-interpretation";
import { fetchPopulation, SidraDataUnavailableError } from "@/lib/sidra";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return json({ error: "Envie a pergunta em JSON." }, 415);
    }
    // Limite real de bytes, inclusive quando Content-Length é omitido.
    const reader = request.body?.getReader();
    if (!reader) throw new QueryError("Envie uma pergunta.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return json({ error: "A pergunta excedeu o tamanho permitido." }, 413);
      }
      chunks.push(value);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new QueryError("O corpo da consulta deve ser um JSON válido."); }
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).length !== 1 || !("pergunta" in body)) {
      throw new QueryError("Envie apenas o campo ‘pergunta’.");
    }
    const interpretation = await interpretQuestion(body.pergunta);
    const result = await fetchPopulation(interpretation.query);
    return json({ ...result, interpretation: { method: interpretation.method } });
  } catch (error) {
    if (error instanceof QueryError) return json({ error: error.message }, 400);
    if (error instanceof InterpretationError) return json({ error: error.message }, error.status);
    if (error instanceof SidraDataUnavailableError) return json({ error: error.message }, 404);
    return json({ error: "Não foi possível consultar a fonte oficial do IBGE agora. Tente novamente em instantes." }, 502);
  }
}
