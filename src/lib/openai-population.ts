import "server-only";
import { getQuestionPeriod, validateQuestionText } from "./population";
import { buildPopulationInstructions } from "./population-prompt";
import { interpretationSchema, validateModelInterpretation } from "./population-interpretation";
import { retrievePopulationContext, type PopulationSnippet } from "./population-retrieval";
import { generateOpenAIJson } from "./openai-json";
export { DEFAULT_OPENAI_MODEL } from "./openai-json";

export async function interpretWithOpenAI(input: string, context: readonly PopulationSnippet[] = retrievePopulationContext(input)) {
  const question = validateQuestionText(input);
  getQuestionPeriod(question);
  const value = await generateOpenAIJson({
    question, instructions: buildPopulationInstructions(context),
    schema: interpretationSchema, schemaName: "population_interpretation",
  });
  return validateModelInterpretation(value, question);
}
