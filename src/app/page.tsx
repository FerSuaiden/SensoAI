"use client";

import { FormEvent, useState } from "react";
import type { ConsultationResult } from "@/lib/population-interpretation";
import type { SourceExplanation } from "@/lib/source-explanation";

const exampleQuestions = ["Qual a população do Brasil?", "Qual a população de MG em 2010?", "Quantas pessoas moravam no Brasil em 2000?"];

const sourceQuestions = ["O que significa população residente no Censo 2022?", "Qual é a data de referência do Censo 2022?", "Quais anos estão disponíveis na tabela 202?"];

export default function Home() {
  const [mode, setMode] = useState<"population" | "sources">("population");
  const [explanation, setExplanation] = useState<SourceExplanation | null>(null);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<ConsultationResult | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || isLoading) return;
    setResult(null); setExplanation(null); setMessage("");
    setIsLoading(true);
    try {
      const response = await fetch(mode === "population" ? "/api/consulta" : "/api/fontes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta: question.trim() }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await response.json()) as (ConsultationResult | SourceExplanation) & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? "Não foi possível consultar a fonte oficial agora.");
      if ("facts" in data) setExplanation(data);
      else setResult(data);
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
        <div className="query-modes" role="group" aria-label="Tipo de pergunta">
          {([ ["population", "Consultar população"], ["sources", "Entender a fonte"] ] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={mode === value} disabled={isLoading} onClick={() => {
              setMode(value); setQuestion(""); setResult(null); setExplanation(null); setMessage("");
            }}>{label}</button>
          ))}
        </div>
        <p className="scope-note" id="query-scope">{mode === "population"
          ? "Censos 2000, 2010 e 2022 · Brasil, estados e Distrito Federal. Sem ano, usamos 2022. Use a sigla para uma UF e consulte um ano por vez. Municípios ainda não são suportados."
          : "Pergunte sobre tabelas, anos, unidades e recortes. Para o Censo 2022, também explicamos população residente e data de referência. Informe um ano ou a tabela 202 ou 4709. Procedimentos de coleta e margem de erro ainda não estão disponíveis."}</p>
        <form onSubmit={handleQuestion} className="question-form"><label className="sr-only" htmlFor="question">Sua pergunta sobre dados brasileiros</label><input id="question" value={question} onChange={(event) => { setQuestion(event.target.value); setResult(null); setExplanation(null); setMessage(""); }} placeholder={mode === "population" ? "Ex.: Qual a população de SP em 2022?" : "Ex.: Qual tabela usamos para população em 2010?"} autoComplete="off" maxLength={300} required disabled={isLoading} aria-describedby="query-scope" /><button type="submit" disabled={isLoading || !question.trim()}>{isLoading ? "Consultando..." : "Consultar"}</button></form>
        <div className="example-list" aria-label="Perguntas de exemplo">{(mode === "population" ? exampleQuestions : sourceQuestions).map((example) => <button key={example} type="button" disabled={isLoading} onClick={() => { setQuestion(example); setResult(null); setExplanation(null); setMessage(""); }}>{example}</button>)}</div>
        {isLoading && <p role="status" className="scope-note">{mode === "population" ? "Interpretando sua pergunta e consultando o IBGE…" : "Buscando referências para explicar a fonte…"}</p>}
        {message && <p className="feedback" role="status">{message}</p>}
        {explanation && (
          <article className="answer source-answer" aria-live="polite">
            <p className="answer-kicker">Sobre a fonte</p>
            <p className="scope-note">Explicações baseadas em metadados e documentação oficial. Os limites do Senso AI são escolhas do aplicativo.</p>
            {explanation.facts.map((fact, index) => (
              <section key={fact.id}>
                <p>{fact.text} <a href={`#citation-${fact.id}`} aria-label={`Ver fonte ${index + 1}`}>[{index + 1}]</a></p>
                <details id={`citation-${fact.id}`}>
                  <summary>Conferir fonte [{index + 1}]</summary>
                  {fact.source.locator && <p>{fact.source.locator}</p>}
                  {fact.evidenceType === "quotation"
                    ? <blockquote>“{fact.evidence}”</blockquote>
                    : <p>Resumo da evidência: {fact.evidence}</p>}
                  <a href={fact.source.url} target="_blank" rel="noreferrer">{fact.source.title} ↗</a>
                  <p className="scope-note">Cópia consultada em <time dateTime={fact.source.retrievedAt}>{fact.source.retrievedAt.split("-").reverse().join("/")}</time>.</p>
                </details>
              </section>
            ))}
          </article>
        )}
        {result && result.interpretation.method !== "rules" && <p className="scope-note">A IA interpretou sua pergunta. Confira o local e o ano abaixo; o número foi obtido no IBGE.</p>}
        {result && <article className="answer" aria-live="polite"><p className="answer-kicker">Resposta encontrada</p><p className="answer-text">{result.statistic} em <strong>{result.period}</strong></p><p className="scope-note">Recorte: {result.geography} · {result.geographyLevel}</p><p className="answer-number">{result.formattedValue}</p><p className="answer-unit">{result.unit}</p><p className="scope-note">{result.note}</p><footer className="source"><span>Fonte: {result.source.name} · {result.source.table}</span><a href={result.source.url} target="_blank" rel="noreferrer">Ver tabela oficial ↗</a><a href={result.source.apiUrl} target="_blank" rel="noreferrer">Ver consulta na API ↗</a></footer></article>}
        {result && result.interpretation.context.length > 0 && (
          <details className="reference-context">
            <summary>Referências fornecidas à IA para interpretar a pergunta</summary>
            <p className="scope-note">Resumos dos metadados oficiais e limites do Senso AI. O valor populacional vem da consulta ao SIDRA indicada acima.</p>
            {result.interpretation.context.map((snippet) => (
              <article key={snippet.id}>
                <h3>{snippet.title}</h3>
                <p>{snippet.text}</p>
                <p className="scope-note">Fonte conferida em <time dateTime={snippet.retrievedAt}>{snippet.retrievedAt.split("-").reverse().join("/")}</time>.</p>
                <div className="source">
                  <a href={snippet.metadataUrl} target="_blank" rel="noreferrer">Ver metadados oficiais ↗</a>
                  <a href={snippet.periodsUrl} target="_blank" rel="noreferrer">Ver períodos oficiais ↗</a>
                </div>
              </article>
            ))}
          </details>
        )}
      </section>
      <section className="principles" aria-label="Princípios do Senso AI"><article><span>01</span><h2>Dados, não opiniões</h2><p>Interpretamos sua pergunta e buscamos o número na API oficial do IBGE, sempre com fonte verificável.</p></article><article><span>02</span><h2>Fonte sempre visível</h2><p>Cada resposta deve indicar tabela, período, unidade e recorte geográfico.</p></article><article><span>03</span><h2>Escopo honesto</h2><p>Começamos pequeno, validamos a qualidade e só então ampliamos as perguntas aceitas.</p></article></section>
    </main>
  );
}
