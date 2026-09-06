import "server-only";
import { interpretWithGemini } from "./gemini-population";
import { interpretWithOpenAI } from "./openai-population";
import { InterpretationError, type InterpreterMode, type LLMProvider } from "./population-interpretation";
import { retrievePopulationContext, type PopulationSnippet } from "./population-retrieval";
import { getPopulationDataset } from "./population-catalog";

const interpreters = { gemini: interpretWithGemini, openai: interpretWithOpenAI };

export function getInterpreterMode(): InterpreterMode {
  const mode = process.env.SENSO_INTERPRETER?.trim() || "gemini";
  if (mode !== "rules" && mode !== "gemini" && mode !== "openai") {
    throw new InterpretationError("O serviço de interpretação está indisponível.", 503);
  }
  return mode;
}

export async function interpretWithProvider(question: string, provider: LLMProvider,
  context: readonly PopulationSnippet[] = retrievePopulationContext(question)) {
  // Sem fallback entre provedores: uma falha no Gemini não gera gasto na OpenAI.
  const query = await interpreters[provider](question, context);
  if (!context.some((snippet) => snippet.table === getPopulationDataset(query.period).table)) {
    throw new InterpretationError("Não foi encontrada uma referência compatível com a consulta interpretada. Reformule a pergunta.");
  }
  return query;
}
