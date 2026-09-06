import "server-only";
import { getQuestionPeriod, normalizePopulationQuestion, parsePopulationQuestion, QueryError, validateQuestionText } from "./population";
import { interpretWithOpenAI } from "./openai-population";
import { InterpretationError } from "./population-interpretation";

export async function interpretQuestion(input: unknown) {
  const question = validateQuestionText(input);
  const mode = process.env.SENSO_INTERPRETER || "rules";
  if (!["rules", "openai"].includes(mode)) throw new InterpretationError("O serviço de interpretação está indisponível.", 503);
  // Caminho determinístico primeiro: exemplos já reconhecidos não gastam tokens.
  try {
    return { query: parsePopulationQuestion(question), method: "rules" as const };
  } catch (error) {
    if (!(error instanceof QueryError) || mode === "rules") throw error;
  }
  getQuestionPeriod(question);
  // Proteções para exclusões comuns. A avaliação semântica completa ainda depende do modelo.
  const normalized = normalizePopulationQuestion(question);
  if (/\b(mulheres|homens|feminina|masculina|urbana|rural|idade|idosos|criancas|municipio|cidade|capital|pib|inflacao)\b/.test(normalized)) {
    throw new QueryError("Esse recorte ainda não é suportado. Consulte a população total de Brasil ou de uma UF.");
  }
  const query = await interpretWithOpenAI(question);
  return { query, method: "openai" as const };
}
