import "server-only";
import { getQuestionPeriod, validateQuestionText } from "./population";
import { buildPopulationInstructions } from "./population-prompt";
import { interpretationSchema, validateModelInterpretation } from "./population-interpretation";
import { retrievePopulationContext, type PopulationSnippet } from "./population-retrieval";
import { generateGeminiJson } from "./gemini-json";
export { DEFAULT_GEMINI_MODEL } from "./gemini-json";

export async function interpretWithGemini(input: string, context: readonly PopulationSnippet[] = retrievePopulationContext(input)) {
  const question = validateQuestionText(input);
  getQuestionPeriod(question);
  const value = await generateGeminiJson({
    question, instructions: buildPopulationInstructions(context),
    schema: interpretationSchema, schemaName: "population_interpretation",
  });
  return validateModelInterpretation(value, question);
}
