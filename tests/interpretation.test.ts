import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { POST } from "../src/app/api/consulta/route";
import { DEFAULT_QUERY, QueryError } from "../src/lib/population";
import { InterpretationError, validateModelInterpretation } from "../src/lib/population-interpretation";
import { retrievePopulationContext } from "../src/lib/population-retrieval";

const previousMode = process.env.SENSO_INTERPRETER;
const previousKey = process.env.OPENAI_API_KEY;
beforeEach(() => {
  process.env.SENSO_INTERPRETER = "openai";
  process.env.OPENAI_API_KEY = "test-key-not-a-real-secret";
});
afterEach(() => {
  if (previousMode === undefined) delete process.env.SENSO_INTERPRETER;
  else process.env.SENSO_INTERPRETER = previousMode;
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
});

const question = "Me conta quantos habitantes havia em MG em 2010";
const query = { territory: { code: "31", name: "Minas Gerais", level: "3" }, period: "2010" };
const decision = { status: "supported", query };
const row = {
  NC: "3", D1C: "31", D1N: "Minas Gerais", D2C: "93", D2N: "População residente",
  D3C: "2010", D3N: "2010", MC: "45", MN: "Pessoas", V: "19597330",
  D4C: "0", D4N: "Total", D5C: "0", D5N: "Total",
};
function envelope(value: unknown = decision) {
  return { status: "completed", output: [{ type: "message", role: "assistant",
    content: [{ type: "output_text", text: JSON.stringify(value) }] }] };
}
function request(body: unknown = { pergunta: question }) {
  return new Request("http://localhost/api/consulta", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

test("interpretação estruturada aceita apenas consulta válida e período fiel", () => {
  assert.deepEqual(validateModelInterpretation(decision, question), query);
  for (const value of [null, {}, [], { ...decision, value: 999 },
    { ...decision, query: { ...query, url: "https://example.com" } },
    { ...decision, query: { ...query, period: "2022" } },
    { ...decision, query: { ...query, territory: { code: "35", name: "Minas Gerais", level: "3" } } },
    { status: "unsupported", query }, { status: "unknown", query: null },
  ]) assert.throws(() => validateModelInterpretation(value, question), InterpretationError);
  for (const status of ["ambiguous", "unsupported"]) {
    assert.throws(() => validateModelInterpretation({ status, query: null }, question), QueryError);
  }
});

test("modelo não pode deduzir Brasil quando o país não foi identificado", () => {
  const national = { status: "supported", query: DEFAULT_QUERY };
  for (const text of ["Quantas pessoas viviam no país?", "Qual era a população?", "E o total nacional?"]) {
    assert.throws(() => validateModelInterpretation(national, text), QueryError);
  }
  for (const text of ["Me diga a população do Brasil", "Qual era a população brasileira?"]) {
    assert.deepEqual(validateModelInterpretation(national, text), DEFAULT_QUERY);
  }
});

test("POST percorre OpenAI -> validador -> SIDRA e não usa número gerado", async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://api.openai.com/v1/responses") {
      const body = JSON.parse(String(options?.body));
      assert.equal(options?.method, "POST");
      assert.equal(options?.cache, "no-store");
      assert.equal(body.store, false);
      assert.equal(body.max_output_tokens, 400);
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.schema.additionalProperties, false);
      assert.deepEqual(body.input, [{ role: "user", content: question }]);
      assert.equal(body.tools, undefined);
      assert.match(body.instructions, /Nunca descarte esses filtros/);
      assert.deepEqual(JSON.parse(body.instructions.split("CONTEXTO_RECUPERADO_JSON:\n")[1]), retrievePopulationContext(question));
      return Response.json(envelope());
    }
    assert.equal(url, "https://apisidra.ibge.gov.br/values/t/202/n3/31/v/93/p/2010/c2/0/c1/0/h/n");
    return Response.json([row]);
  });
  const response = await POST(request());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(result.value, 19597330);
  assert.equal(result.period, "2010");
  assert.equal(result.source.table, "Tabela 202");
  assert.equal(result.interpretation.method, "openai");
  assert.deepEqual(result.interpretation.context, retrievePopulationContext(question));
  assert.equal(calls.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /test-key|instructions/);
});

test("pergunta já reconhecida usa regras mesmo com OpenAI habilitada", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    assert.match(String(input), /^https:\/\/apisidra\.ibge\.gov\.br\//);
    return Response.json([row]);
  });
  const response = await POST(request({ pergunta: "Qual a população de MG em 2010?" }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).interpretation, { method: "rules", context: [] });
});

test("modo rules sem chave funciona por regras", async (t) => {
  process.env.SENSO_INTERPRETER = "rules";
  delete process.env.OPENAI_API_KEY;
  t.mock.method(globalThis, "fetch", async () => Response.json([row]));
  assert.equal((await POST(request({ pergunta: "Qual a população de MG em 2010?" }))).status, 200);
  assert.equal((await POST(request())).status, 400);
});

test("configuração ausente ou inválida não dispara chamadas externas", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Não consultar"); });
  delete process.env.OPENAI_API_KEY;
  assert.equal((await POST(request())).status, 503);
  process.env.SENSO_INTERPRETER = "invalid";
  assert.equal((await POST(request())).status, 503);
  assert.equal(mock.mock.callCount(), 0);
});

test("validação e restrições comuns interrompem antes da IA", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Não consultar"); });
  for (const body of [null, [], {}, { pergunta: 123 }, { pergunta: "" }, { pergunta: "a".repeat(301) },
    { pergunta: question, model: "another" },
    { pergunta: "Me conta a população de MG em 2015" },
    { pergunta: "Me conta a população de MG hoje" },
    { pergunta: "Me conta a população de MG em 2010 e 2022" },
    { pergunta: "Me conta quantas mulheres viviam em MG em 2010" },
    { pergunta: "Me conta a população da cidade de São Paulo em 2010" },
  ]) assert.equal((await POST(request(body))).status, 400);
  assert.equal(mock.mock.callCount(), 0);
});

test("POST recusa formato e tamanho inválidos", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Não consultar"); });
  assert.equal((await POST(new Request("http://localhost/api/consulta", { method: "POST", body: "{}" }))).status, 415);
  assert.equal((await POST(new Request("http://localhost/api/consulta", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).status, 400);
  assert.equal((await POST(request({ pergunta: "a".repeat(5000) }))).status, 413);
  assert.equal(mock.mock.callCount(), 0);
});

for (const [name, payload, status] of [
  ["ambiguidade", envelope({ status: "ambiguous", query: null }), 400],
  ["fora do escopo", envelope({ status: "unsupported", query: null }), 400],
  ["recusa do provedor", { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "no" }] }] }, 400],
  ["truncamento", { ...envelope(), status: "incomplete" }, 502],
  ["JSON inválido", { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "{invalido" }] }] }, 502],
  ["sem mensagem", { status: "completed", output: [] }, 502],
  ["ano trocado", envelope({ ...decision, query: { ...query, period: "2022" } }), 502],
  ["dado inventado", envelope({ ...decision, value: 123456 }), 502],
  ["filtro extra", envelope({ ...decision, query: { ...query, sex: "women" } }), 502],
  ["código inválido", envelope({ ...decision, query: DEFAULT_QUERY }), 502],
] as const) {
  test(`não consulta SIDRA após ${name}`, async (t) => {
    const mock = t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
      assert.equal(String(input), "https://api.openai.com/v1/responses");
      return Response.json(payload);
    });
    const response = await POST(request());
    assert.equal(response.status, status);
    assert.equal(mock.mock.callCount(), 1);
    assert.equal((await response.json()).value, undefined);
  });
}

for (const status of [401, 429, 500]) {
  test(`falha HTTP ${status} não vaza detalhes nem faz retry`, async (t) => {
    const mock = t.mock.method(globalThis, "fetch", async () => new Response("private-provider-error", { status }));
    const response = await POST(request());
    assert.equal(response.status, status === 429 ? 503 : 502);
    assert.doesNotMatch(await response.text(), /private-provider-error|test-key/);
    assert.equal(mock.mock.callCount(), 1);
  });
}

test("timeout de IA não dispara consulta SIDRA", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new DOMException("timeout", "TimeoutError"); });
  assert.equal((await POST(request())).status, 502);
  assert.equal(mock.mock.callCount(), 1);
});
