import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../src/app/api/ibge/populacao/route";

function request(params = "") {
  return new Request(`http://localhost/api/ibge/populacao${params}`);
}

test("rota valida entradas antes de consultar o IBGE", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Não deve consultar"); });
  for (const params of ["?pergunta=", "?ano=2010", "?pergunta=a&pergunta=b",
    `?${new URLSearchParams({ pergunta: "Qual a população do Brasil em 2015?" })}`]) {
    const response = await GET(request(params));
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, "string");
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("rota escolhe a tabela histórica e não mistura cache de períodos", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const period = String(input).includes("/p/2000/") ? "2000" : "2010";
    return Response.json([{
      NC: "3", D1C: "31", D1N: "Minas Gerais", D2C: "93", D2N: "População residente",
      D3C: period, D3N: period, MC: "45", MN: "Pessoas",
      V: period === "2000" ? "17891494" : "19597330",
      D4C: "0", D4N: "Total", D5C: "0", D5N: "Total",
    }]);
  });
  for (const [period, value] of [["2000", 17891494], ["2010", 19597330]] as const) {
    const response = await GET(request(`?${new URLSearchParams({ pergunta: `Qual a população de MG em ${period}?` })}`));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.value, value);
    assert.equal(result.period, period);
    assert.equal(result.source.table, "Tabela 202");
    assert.match(result.source.apiUrl, new RegExp(`/p/${period}/c2/0/c1/0/h/n$`));
  }
  assert.notEqual(fetchMock.mock.calls[0].arguments[0], fetchMock.mock.calls[1].arguments[0]);
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
