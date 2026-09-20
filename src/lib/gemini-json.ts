import "server-only";
import { QueryError, validateQuestionText } from "./population";
import { InterpretationError } from "./population-interpretation";
import type { JsonGenerationRequest } from "./llm-json";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

function readOutputText(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InterpretationError();
  const response = value as Record<string, unknown>;
  if (response.error) throw new InterpretationError();
  if (response.promptFeedback && typeof response.promptFeedback === "object"
    && "blockReason" in response.promptFeedback && response.promptFeedback.blockReason
    && response.promptFeedback.blockReason !== "BLOCK_REASON_UNSPECIFIED") {
    throw new QueryError("O provedor não conseguiu atender essa pergunta. Reformule uma consulta sobre população de Brasil ou de uma UF.");
  }
  if (!Array.isArray(response.candidates) || response.candidates.length !== 1) throw new InterpretationError();
  const candidate = response.candidates[0];
  if (!candidate || typeof candidate !== "object") throw new InterpretationError();
  if (["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"].includes(candidate.finishReason)) {
    throw new QueryError("O provedor não conseguiu atender essa pergunta. Reformule uma consulta sobre população de Brasil ou de uma UF.");
  }
  // Nunca usar um JSON parcial após MAX_TOKENS ou outra interrupção.
  if (candidate.finishReason !== "STOP" || candidate.content?.role !== "model"
    || !Array.isArray(candidate.content.parts)) throw new InterpretationError();
  const texts: string[] = [];
  for (const part of candidate.content.parts) {
    if (!part || typeof part !== "object") throw new InterpretationError();
    if (part.thought === true) continue;
    if (typeof part.text !== "string") throw new InterpretationError();
    texts.push(part.text);
  }
  const text = texts.join("");
  if (!text.trim()) throw new InterpretationError();
  return text;
}

export async function generateGeminiJson(request: JsonGenerationRequest): Promise<unknown> {
  const question = validateQuestionText(request.question);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new InterpretationError("A interpretação com Gemini não está configurada. As perguntas de exemplo continuam disponíveis por regras.", 503);
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  if (!/^gemini-[a-z0-9][a-z0-9.-]*$/.test(model)) throw new InterpretationError("O modelo de interpretação está configurado incorretamente.", 503);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      // Chave em header: não aparece na URL de consulta.
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.instructions }] },
        contents: [{ role: "user", parts: [{ text: question }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: request.schema,
          maxOutputTokens: 400,
          candidateCount: 1,
          temperature: 0,
        },
      }),
    });
    if (response.status === 404) {
      throw new InterpretationError("O modelo Gemini configurado não está disponível para esta chamada. Confira GEMINI_MODEL no servidor.", 503);
    }
    if (!response.ok) throw new InterpretationError(undefined, response.status === 429 ? 503 : 502);
    return JSON.parse(readOutputText(await response.json()));
  } catch (error) {
    // Não expor prompts, credenciais nem erros brutos do fornecedor.
    if (error instanceof InterpretationError || error instanceof QueryError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new InterpretationError("O Gemini demorou além do limite de espera. Tente novamente em instantes.");
    }
    throw new InterpretationError();
  }
}
