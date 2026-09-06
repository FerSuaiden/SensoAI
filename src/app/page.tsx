"use client";

import { FormEvent, useState } from "react";
import type { ConsultationResult } from "@/lib/population-interpretation";

const exampleQuestions = ["Qual a população do Brasil?", "Qual a população de MG em 2010?", "Quantas pessoas moravam no Brasil em 2000?"];

export default function Home() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<ConsultationResult | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || isLoading) return;
    setResult(null); setMessage("");
    setIsLoading(true);
    try {
      const response = await fetch("/api/consulta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta: question.trim() }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await response.json()) as ConsultationResult & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? "Não foi possível consultar a fonte oficial agora.");
      setResult(data);
    } catch (error) {
      setMessage(error instanceof Error && error.name === "TimeoutError"
        ? "A consulta demorou mais que o esperado. Tente novamente em instantes."
        : error instanceof Error ? error.message : "Ocorreu um erro inesperado.");
    } finally { setIsLoading(false); }
  }

  return (
    <main>
      <nav className="nav-shell" aria-label="Navegação principal">
        <a className="brand" href="#inicio" aria-label="Senso AI, início"><span className="brand-mark">S</span><span>Senso<span className="brand-ai">AI</span></span></a>
        <span className="status"><span aria-hidden="true" /> Dados oficiais, sem achismo</span>
      </nav>
      <section className="hero" id="inicio"><p className="eyebrow">Estatísticas públicas em linguagem natural</p><h1>Entenda o Brasil <em>pelos dados.</em></h1><p className="hero-copy">Faça uma pergunta. O Senso consulta a fonte oficial, mostra o dado e explica exatamente de onde ele veio.</p></section>
      <section className="query-card" aria-labelledby="consulta-heading">
        <div className="query-heading"><div><p className="section-label">Consulta</p><h2 id="consulta-heading">O que você quer saber?</h2></div><span className="mvp-tag">MVP · população</span></div>
        <p className="scope-note" id="query-scope">Censos 2000, 2010 e 2022 · Brasil, estados e Distrito Federal. Sem ano, usamos 2022. Use a sigla para uma UF e consulte um ano por vez. Municípios ainda não são suportados.</p>
        <form onSubmit={handleQuestion} className="question-form"><label className="sr-only" htmlFor="question">Sua pergunta sobre dados brasileiros</label><input id="question" value={question} onChange={(event) => { setQuestion(event.target.value); setResult(null); setMessage(""); }} placeholder="Ex.: Qual a população de SP em 2022?" autoComplete="off" maxLength={300} required disabled={isLoading} aria-describedby="query-scope" /><button type="submit" disabled={isLoading || !question.trim()}>{isLoading ? "Consultando..." : "Consultar"}</button></form>
        <div className="example-list" aria-label="Perguntas de exemplo">{exampleQuestions.map((example) => <button key={example} type="button" disabled={isLoading} onClick={() => { setQuestion(example); setResult(null); setMessage(""); }}>{example}</button>)}</div>
        {isLoading && <p role="status" className="scope-note">Interpretando sua pergunta e consultando o IBGE…</p>}
        {message && <p className="feedback" role="status">{message}</p>}
        {result && result.interpretation.method !== "rules" && <p className="scope-note">A IA interpretou sua pergunta. Confira o local e o ano abaixo; o número foi obtido no IBGE.</p>}
        {result && <article className="answer" aria-live="polite"><p className="answer-kicker">Resposta encontrada</p><p className="answer-text">{result.statistic} em <strong>{result.period}</strong></p><p className="scope-note">Recorte: {result.geography} · {result.geographyLevel}</p><p className="answer-number">{result.formattedValue}</p><p className="answer-unit">{result.unit}</p><p className="scope-note">{result.note}</p><footer className="source"><span>Fonte: {result.source.name} · {result.source.table}</span><a href={result.source.url} target="_blank" rel="noreferrer">Ver tabela oficial ↗</a><a href={result.source.apiUrl} target="_blank" rel="noreferrer">Ver consulta na API ↗</a></footer></article>}
      </section>
      <section className="principles" aria-label="Princípios do Senso AI"><article><span>01</span><h2>Dados, não opiniões</h2><p>Interpretamos sua pergunta e buscamos o número na API oficial do IBGE, sempre com fonte verificável.</p></article><article><span>02</span><h2>Fonte sempre visível</h2><p>Cada resposta deve indicar tabela, período, unidade e recorte geográfico.</p></article><article><span>03</span><h2>Escopo honesto</h2><p>Começamos pequeno, validamos a qualidade e só então ampliamos as perguntas aceitas.</p></article></section>
    </main>
  );
}
