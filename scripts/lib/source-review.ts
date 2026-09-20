import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { canonical, contentChanges, sourceUrls, TABLES, validateSnapshot, type Snapshot, type Table, type Change } from "./sidra-snapshot";

export type ReviewEntry = { table: Table; beforeHash: string; candidateHash: string; candidate: Snapshot; changes: Change[] };
export type Review = { version: 1; checkedAt: string; entries: ReviewEntry[]; errors: string[] };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const serialize = (snapshot: Snapshot) => JSON.stringify(snapshot, null, 2) + "\n";
const snapshotPath = (root: string, table: Table) => join(root, "src/data/sidra", `${table}.json`);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Falha inesperada ao verificar a fonte.";

async function fetchJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`IBGE HTTP ${response.status}.`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("O IBGE retornou uma resposta vazia.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1_048_576) { await reader.cancel(); throw new Error("Resposta do IBGE excedeu 1 MiB."); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("O IBGE não retornou JSON válido."); }
}

export async function createSourceReview(root: string, fetcher: typeof fetch = fetch, now = new Date()) {
  const checkedAt = now.toISOString();
  const results = await Promise.allSettled(TABLES.map(async (table): Promise<ReviewEntry> => {
    const original = await readFile(snapshotPath(root, table), "utf8");
    const before: unknown = JSON.parse(original);
    validateSnapshot(before, table);
    const urls = sourceUrls(table);
    const fetched = await Promise.allSettled([fetchJson(urls.metadataUrl, fetcher), fetchJson(urls.periodsUrl, fetcher)]);
    const failures = fetched.flatMap((result, index) => result.status === "rejected"
      ? [`${index === 0 ? "metadados" : "períodos"}: ${errorMessage(result.reason)}`] : []);
    if (failures.length) throw new Error(`Tabela ${table}: ${failures.join("; ")}`);
    const [metadata, periods] = fetched.map((result) => (result as PromiseFulfilledResult<unknown>).value);
    const candidate = { retrievedAt: checkedAt.slice(0, 10), ...urls, metadata, periods };
    validateSnapshot(candidate, table);
    return {
      table, beforeHash: hash(original), candidateHash: hash(serialize(candidate)), candidate,
      changes: contentChanges({ metadata: before.metadata, periods: before.periods }, { metadata, periods }),
    };
  }));
  const review: Review = {
    version: 1, checkedAt,
    entries: results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
    errors: results.flatMap((result) => result.status === "rejected" ? [errorMessage(result.reason)] : []),
  };
  const reviewsRoot = join(root, ".senso/sources");
  await mkdir(reviewsRoot, { recursive: true });
  const directory = await mkdtemp(join(reviewsRoot, "review-"));
  await writeFile(join(directory, "review.json"), JSON.stringify(review, null, 2) + "\n");
  const lines = ["# Revisão de fontes SIDRA", "", `Conferência UTC: ${checkedAt}`, "", "Os snapshots ativos ainda não foram alterados.", ""];
  for (const entry of review.entries) {
    lines.push(`## Tabela ${entry.table}`, "", entry.changes.length ? `${entry.changes.length} diferença(s) de conteúdo:` : "Sem mudança de conteúdo. A aplicação poderá registrar a nova data de conferência.", "");
    if (entry.changes.length) lines.push("```json", JSON.stringify(entry.changes, null, 2), "```", "");
  }
  if (review.errors.length) lines.push("## Atualização bloqueada", "", ...review.errors.map((error) => `- ${error}`), "");
  else lines.push("Após revisar as diferenças, aplique a versão coletada com:", "", `npm run sources:apply -- --review ${basename(directory)}`, "");
  await writeFile(join(directory, "review.md"), lines.join("\n"));
  return { directory, review };
}

export async function applySourceReview(root: string, reviewId: string) {
  const lock = join(root, ".senso/sources/apply.lock");
  await mkdir(join(root, ".senso/sources"), { recursive: true });
  try { await mkdir(lock); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Há uma aplicação em andamento ou um lock de execução interrompida. Confira .senso/sources/apply.lock.");
    throw error;
  }
  try { return await applyReviewedSnapshots(root, reviewId); }
  finally { await rm(lock, { recursive: true, force: true }); }
}

async function applyReviewedSnapshots(root: string, reviewId: string) {
  if (!/^review-[A-Za-z0-9]+$/.test(reviewId)) throw new Error("Informe o ID review-... gerado por sources:check.");
  const directory = join(root, ".senso/sources", reviewId);
  const review: Review = JSON.parse(await readFile(join(directory, "review.json"), "utf8"));
  if (review.version !== 1 || typeof review.checkedAt !== "string" || Number.isNaN(Date.parse(review.checkedAt))
    || new Date(review.checkedAt).toISOString() !== review.checkedAt
    || !Array.isArray(review.errors) || review.errors.length || !Array.isArray(review.entries)
    || review.entries.length !== TABLES.length || !TABLES.every((table) => review.entries.filter((entry) => entry?.table === table).length === 1)) {
    throw new Error("A revisão está incompleta, inválida ou contém erros. Execute sources:check novamente.");
  }
  // Toda a revisão é validada antes de escrever o primeiro snapshot.
  const pending = [];
  for (const entry of review.entries) {
    validateSnapshot(entry.candidate, entry.table);
    if (entry.candidate.retrievedAt !== review.checkedAt.slice(0, 10)
      || hash(serialize(entry.candidate)) !== entry.candidateHash) throw new Error("O candidato foi alterado após a coleta. Gere uma nova revisão.");
    const path = snapshotPath(root, entry.table);
    const original = await readFile(path, "utf8");
    if (hash(original) !== entry.beforeHash) throw new Error(`Tabela ${entry.table}: o snapshot local mudou após a revisão. Gere uma nova revisão.`);
    const before: unknown = JSON.parse(original);
    validateSnapshot(before, entry.table);
    if (entry.candidate.retrievedAt < before.retrievedAt) throw new Error("A revisão não pode retroceder a data de conferência.");
    if (canonical(contentChanges({ metadata: before.metadata, periods: before.periods }, { metadata: entry.candidate.metadata, periods: entry.candidate.periods })) !== canonical(entry.changes)) {
      throw new Error("As diferenças do relatório não correspondem ao candidato.");
    }
    pending.push({ path, original, next: serialize(entry.candidate) });
  }
  // Preparação no mesmo filesystem; rename evita expor JSON parcialmente escrito.
  const staging = await mkdtemp(join(root, "src/data/sidra/.update-"));
  const changed: typeof pending = [];
  let preserveBackups = false;
  try {
    for (let i = 0; i < pending.length; i++) {
      await writeFile(join(staging, `${i}.next`), pending[i].next);
      await writeFile(join(staging, `${i}.backup`), pending[i].original);
    }
    for (let i = 0; i < pending.length; i++) {
      if (await readFile(pending[i].path, "utf8") !== pending[i].original) throw new Error("O snapshot mudou durante a aplicação. Tente uma nova revisão.");
      await rename(join(staging, `${i}.next`), pending[i].path);
      changed.push(pending[i]);
    }
  } catch (error) {
    try {
      for (let i = changed.length - 1; i >= 0; i--) await rename(join(staging, `${i}.backup`), changed[i].path);
    } catch {
      preserveBackups = true;
      throw new Error(`A recuperação automática falhou. Confira os snapshots e os backups em ${staging}.`);
    }
    throw error;
  } finally {
    if (!preserveBackups) await rm(staging, { recursive: true, force: true });
  }
  return pending.length;
}
