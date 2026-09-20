import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import { POST } from "../src/app/api/fontes/route";
import { retrieveSourceFacts } from "../src/lib/source-facts";
import { sourceExplanationSchema, validateSourceSelection } from "../src/lib/source-explanation";
import { InterpretationError } from "../src/lib/population-interpretation";
import { QueryError } from "../src/lib/population";

const variables = ["SENSO_INTERPRETER", "GEMINI_API_KEY", "OPENAI_API_KEY"] as const;
const previous = Object.fromEntries(variables.map((key) => [key, process.env[key]]));
beforeEach(() => {
  process.env.SENSO_INTERPRETER = "gemini";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.OPENAI_API_KEY = "test-openai-key";
});
afterEach(() => {
  for (const key of variables) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});
const question = "Qual tabela usamos para população em 2010?";
const selection = { status: "supported", factIds: ["202-table"] };
function request(pergunta: unknown = question) {
  return new Request("http://localhost/api/fontes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pergunta }) });
}
function envelope(value: unknown) {
  return { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify(value) }] } }] };
}

test("recuperação distingue código de tabela e ano, sem período implícito", () => {
  for (const [text, table] of [[question, "202"], ["Unidade da tabela 4709", "4709"], ["Anos da tabela 202", "202"], ["Tabela para 1970", "202"]]) {
    const context = retrieveSourceFacts(text);
    assert.equal(context.length, 5);
    assert.ok(context.every((fact) => fact.table === table));
  }
  for (const text of ["Qual é a unidade?", "Tabela 202 em 2022", "Tabela 4709 em 2010", "Tabela 999", "Tabela 202 e tabela 4709", "Anos 2010 e 2022", "População em 2015"]) {
    assert.throws(() => retrieveSourceFacts(text), QueryError);
  }
});

test("validação aceita somente IDs únicos recuperados, sem texto nem URLs gerados", () => {
  const context = retrieveSourceFacts(question);
  assert.deepEqual(validateSourceSelection(selection, context), [context[0]]);
  for (const value of [null, {}, [], { ...selection, text: "inventado" }, { ...selection, url: "https://evil.example" },
    { status: "supported", factIds: [] }, { status: "supported", factIds: ["4709-table"] },
    { status: "supported", factIds: ["202-table", "202-table"] }, { status: "supported", factIds: [1] },
    { status: "supported", factIds: context.map((f) => f.id) }, { status: "unknown", factIds: [] },
    { status: "unsupported", factIds: ["202-table"] },
  ]) assert.throws(() => validateSourceSelection(value, context), InterpretationError);
  for (const status of ["unsupported", "ambiguous"]) {
    assert.throws(() => validateSourceSelection({ status, factIds: [] }, context), QueryError);
  }
});

for (const provider of ["gemini", "openai"]) {
  test(`fontes via ${provider}: envia evidências e resolve texto/citação no servidor, sem chamar SIDRA`, async (t) => {
    process.env.SENSO_INTERPRETER = provider;
    const mock = t.mock.method(globalThis, "fetch", async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
      assert.match(String(url), provider === "gemini" ? /^https:\/\/generativelanguage.googleapis.com\// : /^https:\/\/api.openai.com\/v1\/responses$/);
      const body = JSON.parse(String(options?.body));
      const instructions = provider === "gemini" ? body.systemInstruction.parts[0].text : body.instructions;
      const context = JSON.parse(instructions.split("FATOS_RECUPERADOS_JSON:\n")[1]);
      assert.deepEqual(context, retrieveSourceFacts(question));
      assert.deepEqual(provider === "gemini" ? body.generationConfig.responseJsonSchema : body.text.format.schema, sourceExplanationSchema);
      return Response.json(provider === "gemini" ? envelope(selection)
        : { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(selection) }] }] });
    });
    const response = await POST(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    assert.equal(data.method, provider);
    assert.deepEqual(data.facts, [retrieveSourceFacts(question)[0]]);
    assert.equal(data.value, undefined);
    assert.doesNotMatch(JSON.stringify(data), /test-gemini-key|test-openai-key/);
    assert.equal(mock.mock.callCount(), 1);
  });
}

test("recusa do modelo e citação inválida não retornam explicação", async (t) => {
  let responseValue: unknown = { status: "unsupported", factIds: [] };
  t.mock.method(globalThis, "fetch", async () => Response.json(envelope(responseValue)));
  assert.equal((await POST(request("Como calcular a margem de erro da tabela 202?"))).status, 400);
  responseValue = { status: "supported", factIds: ["4709-unit"] };
  const response = await POST(request());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).facts, undefined);
});

test("erros de entrada e modo sem IA são recusados antes da rede", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Não chamar"); });
  for (const input of ["", "x".repeat(301), null, 4, "Qual tabela?", "Unidade da tabela 999"]) {
    assert.equal((await POST(request(input))).status, 400);
  }
  assert.equal((await POST(request("x".repeat(5000)))).status, 413);
  assert.equal((await POST(new Request("http://localhost/api/fontes", { method: "POST", body: "{}" }))).status, 415);
  assert.equal((await POST(new Request("http://localhost/api/fontes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pergunta: question, facts: [] }) }))).status, 400);
  process.env.SENSO_INTERPRETER = "rules";
  assert.equal((await POST(request())).status, 503);
  process.env.SENSO_INTERPRETER = "gemini";
  delete process.env.GEMINI_API_KEY;
  assert.equal((await POST(request())).status, 503);
  assert.equal(mock.mock.callCount(), 0);
});

test("timeout na explicação não gera retry nem troca de provedor", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new DOMException("timeout", "TimeoutError"); });
  const response = await POST(request());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).facts, undefined);
  assert.equal(mock.mock.callCount(), 1);
});
