import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../src/app/api/ibge/populacao/route";

function request(params = "") {
  return new Request(`http://localhost/api/ibge/populacao${params}`);
}

test("rota valida entradas antes de consultar o IBGE", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Não deve consultar"); });
  for (const params of ["?pergunta=", "?ano=2010", "?pergunta=a&pergunta=b",
    `?${new URLSearchParams({ pergunta: "Qual a população do Brasil em 2010?" })}`]) {
    const response = await GET(request(params));
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, "string");
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("rota encaminha UF e devolve o dado oficial", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json([{
    NC: "3", D1C: "35", D1N: "São Paulo", D2C: "93", D2N: "População residente",
    D3C: "2022", D3N: "2022", MC: "45", MN: "Pessoas", V: "44411238",
  }]));
  const response = await GET(request(`?${new URLSearchParams({ pergunta: "Qual a população de SP?" })}`));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.geography, "São Paulo");
  assert.equal(result.value, 44411238);
  assert.match(String(fetchMock.mock.calls[0].arguments[0]), /n3\/35\/v\/93\/p\/2022/);
});

test("rota mantém consulta sem parâmetros para Brasil", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json([{
    NC: "1", D1C: "1", D1N: "Brasil", D2C: "93", D2N: "População residente",
    D3C: "2022", D3N: "2022", MC: "45", MN: "Pessoas", V: "203080756",
  }]));
  assert.equal((await GET(request())).status, 200);
  assert.match(String(fetchMock.mock.calls[0].arguments[0]), /n1\/1\/v\/93\/p\/2022/);
});

test("rota distingue ausência de dado e falha da fonte", async (t) => {
  t.mock.method(console, "error", () => {});
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json([{
    NC: "1", D1C: "1", D1N: "Brasil", D2C: "93", D2N: "População residente",
    D3C: "2022", D3N: "2022", MC: "45", MN: "Pessoas", V: "...",
  }]));
  assert.equal((await GET(request())).status, 404);
  fetchMock.mock.mockImplementation(async () => new Response("indisponível", { status: 503 }));
  assert.equal((await GET(request())).status, 502);
  fetchMock.mock.mockImplementation(async () => new Response("não é JSON"));
  assert.equal((await GET(request())).status, 502);
  fetchMock.mock.mockImplementation(async () => { throw new DOMException("timeout", "TimeoutError"); });
  assert.equal((await GET(request())).status, 502);
});
