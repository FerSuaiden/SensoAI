import "server-only";
import { QueryError, validateQuestionText } from "./population";
import { InterpretationError } from "./population-interpretation";
import type { JsonGenerationRequest } from "./llm-json";

export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";


function readOutputText(value: unknown): string {
  if (!value || typeof value !== "object") throw new InterpretationError();
  const response = value as Record<string, unknown>;
  if (response.status !== "completed" || !Array.isArray(response.output)) throw new InterpretationError();
  const texts: string[] = [];
  for (const item of response.output) {
    if (!item || typeof item !== "object") throw new InterpretationError();
    if (item.type !== "message") continue;
    if (item.role !== "assistant" || !Array.isArray(item.content)) throw new InterpretationError();
    for (const part of item.content) {
      if (!part || typeof part !== "object") throw new InterpretationError();
      if (part.type === "refusal") throw new QueryError("Não foi possível interpretar essa pergunta. Reformule uma consulta sobre população de Brasil ou de uma UF.");
      if (part.type === "output_text" && typeof part.text === "string") texts.push(part.text);
    }
  }
  if (texts.length !== 1) throw new InterpretationError();
  return texts[0];
}

export async function generateOpenAIJson(request: JsonGenerationRequest): Promise<unknown> {
  const question = validateQuestionText(request.question);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new InterpretationError("A interpretação com IA não está configurada. As perguntas de exemplo continuam disponíveis no modo por regras.", 503);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
        instructions: request.instructions,
        input: [{ role: "user", content: question }],
        text: { format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.schema } },
        max_output_tokens: 400,
        store: false,
      }),
    });
    if (!response.ok) throw new InterpretationError(undefined, response.status === 429 ? 503 : 502);
    const text = readOutputText(await response.json());
    return JSON.parse(text);
  } catch (error) {
    // Não propagar corpo de erro do provedor, prompt, headers ou chave aos logs/cliente.
    if (error instanceof InterpretationError || error instanceof QueryError) throw error;
    throw new InterpretationError();
  }
}
