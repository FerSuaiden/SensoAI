import { createHash } from "node:crypto";
import document from "../../src/data/methodology/censo-2022.json";

/** Somente confere a versão; mudanças no PDF exigem releitura dos trechos e revisão editorial. */
export async function checkMethodologyDocument(fetcher: typeof fetch = fetch) {
  const response = await fetcher(document.url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`PDF do IBGE: HTTP ${response.status}.`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("O PDF retornou vazio.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 25 * 1024 * 1024) { await reader.cancel(); throw new Error("O documento excedeu o limite de 25 MiB."); }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("A fonte não retornou um PDF válido.");
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  return { unchanged: actualHash === document.sha256, expectedHash: document.sha256, actualHash };
}
