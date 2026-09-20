import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from "node:fs/promises";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import historical from "../src/data/sidra/202.json";
import current from "../src/data/sidra/4709.json";
import { applySourceReview, createSourceReview } from "../scripts/lib/source-review";
import { canonical, contentChanges, sourceUrls, TABLES, validateSnapshot, type Snapshot, type Table } from "../scripts/lib/sidra-snapshot";

const checkedAt = new Date("2026-09-20T12:00:00Z");
function snapshot(table: Table): Snapshot {
  return structuredClone({ ...(table === "202" ? historical : current), retrievedAt: "2020-01-01" });
}
async function workspace(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "senso-source-review-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "src/data/sidra"), { recursive: true });
  for (const table of TABLES) await writeFile(join(root, `src/data/sidra/${table}.json`), JSON.stringify(snapshot(table), null, 2) + "\n");
  return root;
}
const originals = (root: string) => Promise.all(TABLES.map((table) => readFile(join(root, `src/data/sidra/${table}.json`), "utf8")));
function fixtureFetch(change?: (value: Snapshot) => void): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const table = TABLES.find((id) => Object.values(sourceUrls(id)).includes(url));
    assert.ok(table, `URL inesperada: ${url}`);
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    const value = snapshot(table);
    change?.(value);
    return Response.json(url.endsWith("/metadados") ? value.metadata : value.periods);
  };
}

test("conferência sem mudança não altera snapshots e não conta data ou ordem de chaves como conteúdo", async (t) => {
  const root = await workspace(t);
  const before = await originals(root);
  const { review, directory } = await createSourceReview(root, fixtureFetch(), checkedAt);
  assert.deepEqual(review.errors, []);
  assert.deepEqual(review.entries.map((entry) => entry.changes), [[], []]);
  assert.deepEqual(await originals(root), before);
  assert.match(await readFile(join(directory, "review.md"), "utf8"), /Sem mudança de conteúdo/);
  assert.equal(canonical({ x: 1, y: 2 }), canonical({ y: 2, x: 1 }));
  assert.deepEqual(contentChanges({}, { added: null }), [{ path: "/added", kind: "added", before: null, after: null }]);
});

test("aplica somente os candidatos revisados sem nova rede e preserva campos oficiais adicionais", async (t) => {
  const root = await workspace(t);
  const { directory, review } = await createSourceReview(root, fixtureFetch((value) => { value.metadata.notaNova = "Descrição adicional oficial"; }), checkedAt);
  assert.ok(review.entries.every((entry) => entry.changes.some((change) => change.path === "/metadata/notaNova" && change.kind === "added")));
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Não consultar novamente"); });
  assert.equal(await applySourceReview(root, basename(directory)), 2);
  for (const raw of await originals(root)) {
    const value = JSON.parse(raw);
    assert.equal(value.retrievedAt, "2026-09-20");
    assert.equal(value.metadata.notaNova, "Descrição adicional oficial");
  }
  assert.equal(mock.mock.callCount(), 0);
  assert.ok(!(await readdir(join(root, "src/data/sidra"))).some((file) => file.startsWith(".update-")));
});

test("falha parcial de rede bloqueia a aplicação do lote inteiro", async (t) => {
  const root = await workspace(t);
  const before = await originals(root);
  const normal = fixtureFetch();
  const { directory, review } = await createSourceReview(root, (input, init) => String(input).includes("/4709/")
    ? Promise.resolve(new Response("indisponível", { status: 503 })) : normal(input, init), checkedAt);
  assert.equal(review.entries.length, 1);
  assert.equal(review.errors.length, 1);
  await assert.rejects(() => applySourceReview(root, basename(directory)), /incompleta/);
  assert.deepEqual(await originals(root), before);
});

test("retirada de ano, variável, unidade, nível ou categoria interrompe antes de aceitar uma nova base", () => {
  const mutations: ((value: Snapshot) => void)[] = [
    (v) => { v.periods = v.periods.filter((p) => p.id !== "2010"); },
    (v) => { v.metadata.variaveis = v.metadata.variaveis.filter((item) => item.id !== 93); },
    (v) => { v.metadata.variaveis[0].unidade = "%"; },
    (v) => { v.metadata.nivelTerritorial.Administrativo = ["N1"]; },
    (v) => { v.metadata.classificacoes[0].categorias = []; },
    (v) => { v.metadata.classificacoes.push(structuredClone(v.metadata.classificacoes[0])); },
    (v) => { v.periods.push(structuredClone(v.periods[0])); },
    (v) => { v.metadata.URL = "https://example.com"; },
    (v) => { v.retrievedAt = "2026-02-31"; },
  ];
  for (const mutate of mutations) {
    const value = snapshot("202");
    mutate(value);
    assert.throws(() => validateSnapshot(value, "202"));
  }
  assert.throws(() => validateSnapshot({ metadata: null }, "202"));
});

test("resposta incompatível fica no relatório e mantém as duas fontes ativas intactas", async (t) => {
  const root = await workspace(t);
  const before = await originals(root);
  const { directory, review } = await createSourceReview(root, fixtureFetch((value) => { value.metadata.variaveis[0].unidade = "%"; }), checkedAt);
  assert.equal(review.errors.length, 2);
  assert.match(review.errors[0], /unidade mudou/);
  await assert.rejects(() => applySourceReview(root, basename(directory)));
  assert.deepEqual(await originals(root), before);
});

test("revisão obsoleta não sobrescreve edição local e não atualiza a outra tabela", async (t) => {
  const root = await workspace(t);
  const { directory } = await createSourceReview(root, fixtureFetch(), checkedAt);
  const path = join(root, "src/data/sidra/4709.json");
  await writeFile(path, (await readFile(path, "utf8")) + "\n");
  const before = await originals(root);
  await assert.rejects(() => applySourceReview(root, basename(directory)), /mudou após a revisão/);
  assert.deepEqual(await originals(root), before);
});

test("candidato adulterado é rejeitado e uma revisão válida continua aplicável após a falha", async (t) => {
  const root = await workspace(t);
  const { directory, review } = await createSourceReview(root, fixtureFetch(), checkedAt);
  const path = join(directory, "review.json");
  const tampered = structuredClone(review);
  tampered.entries[1].candidate.metadata.nome = "Outro título";
  await writeFile(path, JSON.stringify(tampered));
  const before = await originals(root);
  await assert.rejects(() => applySourceReview(root, basename(directory)), /alterado após a coleta/);
  assert.deepEqual(await originals(root), before);
  await writeFile(path, JSON.stringify(review));
  assert.equal(await applySourceReview(root, basename(directory)), 2);
});

test("uma aplicação em andamento e um identificador de revisão inválido não permitem escrever", async (t) => {
  const root = await workspace(t);
  const { directory } = await createSourceReview(root, fixtureFetch(), checkedAt);
  const before = await originals(root);
  const lock = join(root, ".senso/sources/apply.lock");
  await mkdir(lock);
  await assert.rejects(() => applySourceReview(root, basename(directory)), /aplicação em andamento/);
  await rm(lock, { recursive: true });
  await assert.rejects(() => applySourceReview(root, "../other"), /Informe o ID/);
  assert.deepEqual(await originals(root), before);
});

test("respostas inválidas e grandes demais não substituem uma fonte", async (t) => {
  const root = await workspace(t);
  const before = await originals(root);
  for (const text of ["<html>Falha</html>", "x".repeat(1_048_577)]) {
    const { review } = await createSourceReview(root, async () => new Response(text), checkedAt);
    assert.equal(review.entries.length, 0);
    assert.equal(review.errors.length, 2);
  }
  assert.deepEqual(await originals(root), before);
});

test("falha ao substituir o segundo arquivo restaura o primeiro", async (t) => {
  const root = await workspace(t);
  const { directory } = await createSourceReview(root, fixtureFetch(), checkedAt);
  const before = await originals(root);
  const rename = fs.rename;
  t.mock.method(fs, "rename", async (from: Parameters<typeof fs.rename>[0], to: Parameters<typeof fs.rename>[1]) => {
    if (String(from).endsWith("1.next")) throw new Error("Falha de escrita simulada");
    return rename(from, to);
  });
  await assert.rejects(() => applySourceReview(root, basename(directory)), /Falha de escrita simulada/);
  assert.deepEqual(await originals(root), before);
});

test("se a restauração também falha, preserva os backups para recuperação", async (t) => {
  const root = await workspace(t);
  const { directory } = await createSourceReview(root, fixtureFetch(), checkedAt);
  const rename = fs.rename;
  t.mock.method(fs, "rename", async (from: Parameters<typeof fs.rename>[0], to: Parameters<typeof fs.rename>[1]) => {
    if (String(from).endsWith("1.next") || String(from).endsWith("0.backup")) throw new Error("Disco indisponível");
    return rename(from, to);
  });
  await assert.rejects(() => applySourceReview(root, basename(directory)), /recuperação automática falhou/);
  const staging = (await readdir(join(root, "src/data/sidra"))).find((name) => name.startsWith(".update-"));
  assert.ok(staging);
  const backup = JSON.parse(await readFile(join(root, "src/data/sidra", staging, "0.backup"), "utf8"));
  assert.equal(backup.retrievedAt, "2020-01-01");
});
