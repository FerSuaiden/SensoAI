export type JsonGenerationRequest = {
  question: string;
  instructions: string;
  schema: Record<string, unknown>;
  schemaName: string;
};
