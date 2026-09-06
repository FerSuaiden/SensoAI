import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { POST } from "../src/app/api/consulta/route";
import { DEFAULT_GEMINI_MODEL } from "../src/lib/gemini-population";
import { getInterpreterMode } from "../src/lib/llm-provider";
import { interpretationSchema } from "../src/lib/population-interpretation";
import { retrievePopulationContext } from "../src/lib/population-retrieval";
import { interpretWithProvider } from "../src/lib/llm-provider";

const variables = ["SENSO_INTERPRETER", "GEMINI_API_KEY", "GEMINI_MODEL", "OPENAI_API_KEY"] as const;
const previous = Object.fromEntries(variables.map((name) => [name, process.env[name]]));
beforeEach(() => {
  process.env.SENSO_INTERPRETER = "gemini";
  process.env.GEMINI_API_KEY = "gemini-test-key-not-a-real-secret";
  process.env.OPENAI_API_KEY = "openai-test-key-not-a-real-secret";
  delete process.env.GEMINI_MODEL;
});
afterEach(() => {
  for (const name of variables) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
});

const question = "Me conta quantos habitantes havia em MG em 2010";
const query = { territory: { code: "31", name: "Minas Gerais", level: "3" }, period: "2010" };
const decision = { status: "supported", query };
const row = {
  NC: "3", D1C: "31", D1N: "Minas Gerais", D2C: "93", D2N: "População residente",
  D3C: "2010", D3N: "2010", MC: "45", MN: "Pessoas", V: "19597330",
  D4C: "0", D4N: "Total", D5C: "0", D5N: "Total",
};
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`;
function candidate(value: unknown = decision) {
  return { finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify(value) }] } };
}
function envelope(value: unknown = decision) { return { candidates: [candidate(value)] }; }
function request(pergunta = question) {
  return new Request("http://localhost/api/consulta", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pergunta }),
  });
}

test("Gemini é o padrão e usa o mesmo contrato validado até o SIDRA", async (t) => {
  delete process.env.SENSO_INTERPRETER;
  assert.equal(getInterpreterMode(), "gemini");
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url === endpoint) {
      const headers = new Headers(options?.headers);
      assert.equal(headers.get("x-goog-api-key"), "gemini-test-key-not-a-real-secret");
      assert.equal(headers.has("authorization"), false);
      assert.doesNotMatch(url, /key=/);
      assert.equal(options?.cache, "no-store");
      const body = JSON.parse(String(options?.body));
      assert.deepEqual(body.contents, [{ role: "user", parts: [{ text: question }] }]);
      assert.match(body.systemInstruction.parts[0].text, /Nunca descarte esses filtros/);
      const context = JSON.parse(body.systemInstruction.parts[0].text.split("CONTEXTO_RECUPERADO_JSON:\n")[1]);
      assert.deepEqual(context, retrievePopulationContext(question));
      assert.ok(context.every((snippet: { table: string }) => snippet.table === "202"));
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.deepEqual(body.generationConfig.responseJsonSchema, interpretationSchema);
      assert.equal(body.generationConfig.maxOutputTokens, 400);
      assert.equal(body.tools, undefined);
      return Response.json(envelope());
    }
    assert.equal(url, "https://apisidra.ibge.gov.br/values/t/202/n3/31/v/93/p/2010/c2/0/c1/0/h/n");
    return Response.json([row]);
  });
  const response = await POST(request());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.value, 19597330);
  assert.equal(result.period, "2010");
  assert.equal(result.source.table, "Tabela 202");
  assert.equal(result.interpretation.method, "gemini");
  assert.deepEqual(result.interpretation.context, retrievePopulationContext(question));
  assert.equal(calls.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /test-key|systemInstruction/);
});

test("proposta sem referência recuperada não é executada mesmo quando o modelo a aceita", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json(envelope()));
  await assert.rejects(() => interpretWithProvider(question, "gemini", []), /referência compatível/);
  assert.equal(mock.mock.callCount(), 1);
});

test("modelo Gemini é configurável sem mudar de provedor", async (t) => {
  process.env.GEMINI_MODEL = "gemini-2.5-flash";
  const mock = t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    assert.equal(String(input), "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    return Response.json(envelope({ status: "ambiguous", query: null }));
  });
  assert.equal((await POST(request())).status, 400);
  assert.equal(mock.mock.callCount(), 1);
});

test("sem chave Gemini, exemplos usam regras e paráfrases pedem configuração", async (t) => {
  delete process.env.GEMINI_API_KEY;
  const mock = t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    assert.match(String(input), /^https:\/\/apisidra\.ibge\.gov\.br\//);
    return Response.json([row]);
  });
  assert.equal((await POST(request("Qual a população de MG em 2010?"))).status, 200);
  assert.equal((await POST(request())).status, 503);
  assert.equal(mock.mock.callCount(), 1);
});

test("configuração de modelo não pode alterar host ou inserir query string", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Não consultar"); });
  for (const model of ["https://example.com", "../models/other", "gemini-2.5-flash?key=other"]) {
    process.env.GEMINI_MODEL = model;
    assert.equal((await POST(request())).status, 503);
  }
  assert.equal(mock.mock.callCount(), 0);
});

for (const [name, payload, status] of [
  ["ambiguidade", envelope({ status: "ambiguous", query: null }), 400],
  ["fora do escopo", envelope({ status: "unsupported", query: null }), 400],
  ["bloqueio do prompt", { promptFeedback: { blockReason: "SAFETY" } }, 400],
  ["bloqueio da resposta", { candidates: [{ finishReason: "SAFETY" }] }, 400],
  ["limite de tokens", { candidates: [{ ...candidate(), finishReason: "MAX_TOKENS" }] }, 502],
  ["sem motivo de conclusão", { candidates: [{ content: candidate().content }] }, 502],
  ["sem candidatos", { candidates: [] }, 502],
  ["múltiplos candidatos", { candidates: [candidate(), candidate()] }, 502],
  ["JSON inválido", { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: "{" }] } }] }, 502],
  ["parte não textual", { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ functionCall: {} }] } }] }, 502],
  ["somente pensamento", { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ thought: true, text: JSON.stringify(decision) }] } }] }, 502],
  ["ano trocado", envelope({ ...decision, query: { ...query, period: "2022" } }), 502],
  ["código incompatível", envelope({ ...decision, query: { ...query, territory: { ...query.territory, code: "35" } } }), 502],
  ["número inventado", envelope({ ...decision, value: 123 }), 502],
] as const) {
  test(`Gemini: ${name} interrompe antes do SIDRA`, async (t) => {
    const mock = t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
      assert.equal(String(input), endpoint);
      return Response.json(payload);
    });
    const response = await POST(request());
    assert.equal(response.status, status);
    assert.equal((await response.json()).value, undefined);
    assert.equal(mock.mock.callCount(), 1);
  });
}

for (const status of [400, 401, 403, 404, 429, 500]) {
  test(`Gemini HTTP ${status}: não repete nem troca automaticamente para OpenAI`, async (t) => {
    const mock = t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
      assert.equal(String(input), endpoint);
      return new Response("private-google-error", { status });
    });
    const response = await POST(request());
    assert.equal(response.status, status === 429 || status === 404 ? 503 : 502);
    const text = await response.text();
    assert.doesNotMatch(text, /private-google-error|test-key/);
    if (status === 404) assert.match(text, /GEMINI_MODEL/);
    assert.equal(mock.mock.callCount(), 1);
  });
}

test("timeout Gemini não dispara outra chamada", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new DOMException("timeout", "TimeoutError"); });
  assert.equal((await POST(request())).status, 502);
  assert.equal(mock.mock.callCount(), 1);
});
