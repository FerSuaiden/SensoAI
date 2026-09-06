import "server-only";
import { interpretWithGemini } from "./gemini-population";
import { interpretWithOpenAI } from "./openai-population";
import { InterpretationError, type InterpreterMode, type LLMProvider } from "./population-interpretation";

const interpreters = { gemini: interpretWithGemini, openai: interpretWithOpenAI };

export function getInterpreterMode(): InterpreterMode {
  const mode = process.env.SENSO_INTERPRETER?.trim() || "gemini";
  if (mode !== "rules" && mode !== "gemini" && mode !== "openai") {
    throw new InterpretationError("O serviço de interpretação está indisponível.", 503);
  }
  return mode;
}

export function interpretWithProvider(question: string, provider: LLMProvider) {
  // Sem fallback entre provedores: uma falha no Gemini não gera gasto na OpenAI.
  return interpreters[provider](question);
}
