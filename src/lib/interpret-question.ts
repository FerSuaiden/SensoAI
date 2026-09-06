import "server-only";
import { getQuestionPeriod, normalizePopulationQuestion, parsePopulationQuestion, QueryError, validateQuestionText } from "./population";
import { getInterpreterMode, interpretWithProvider } from "./llm-provider";

export async function interpretQuestion(input: unknown) {
  const question = validateQuestionText(input);
  const mode = getInterpreterMode();
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
  const query = await interpretWithProvider(question, mode);
  return { query, method: mode };
}
