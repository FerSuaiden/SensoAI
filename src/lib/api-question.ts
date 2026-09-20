import "server-only";
import { QueryError, validateQuestionText } from "./population";

export class RequestInputError extends QueryError {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function readQuestion(request: Request): Promise<string> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new RequestInputError("Envie a pergunta em JSON.", 415);
  }
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
      throw new RequestInputError("A pergunta excedeu o tamanho permitido.", 413);
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
  return validateQuestionText(body.pergunta);
}
