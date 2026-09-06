import {
  getQuestionPeriod, QueryError, validatePopulationQuery,
  type PopulationQuery, type PopulationResult,
} from "./population";

export type ConsultationResult = PopulationResult & {
  interpretation: { method: "rules" | "openai" };
};

export class InterpretationError extends Error {
  constructor(message = "Não foi possível interpretar a pergunta com IA agora. Tente novamente em instantes.",
    public readonly status = 502) {
    super(message);
  }
}

// A saída contém apenas uma decisão e filtros. Não há campo para um número populacional.
export const interpretationSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["supported", "ambiguous", "unsupported"] },
    query: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          properties: {
            territory: {
              type: "object",
              properties: {
                code: { type: "string" }, name: { type: "string" }, level: { type: "string" },
              },
              required: ["code", "name", "level"], additionalProperties: false,
            },
            period: { type: "string" },
          },
          required: ["territory", "period"], additionalProperties: false,
        },
      ],
    },
  },
  required: ["status", "query"], additionalProperties: false,
};

export function validateModelInterpretation(value: unknown, question: string): PopulationQuery {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InterpretationError();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== 2 || !Object.hasOwn(result, "status") || !Object.hasOwn(result, "query")) {
    throw new InterpretationError();
  }
  if (result.status === "ambiguous" || result.status === "unsupported") {
    if (result.query !== null) throw new InterpretationError();
    throw new QueryError(result.status === "ambiguous"
      ? "A pergunta ficou ambígua. Indique Brasil ou uma UF por sigla, com um único ano: 2000, 2010 ou 2022."
      : "Ainda consulto apenas população total de Brasil e UFs nos censos de 2000, 2010 e 2022. Reformule sem comparações ou filtros demográficos.");
  }
  if (result.status !== "supported") throw new InterpretationError();
  try {
    const query = validatePopulationQuery(result.query);
    // Mesmo um objeto válido não pode substituir o ano escrito na pergunta.
    if (query.period !== getQuestionPeriod(question)) throw new InterpretationError();
    return query;
  } catch {
    throw new InterpretationError("A interpretação não corresponde a uma consulta permitida. Reformule indicando a UF e o ano.");
  }
}
