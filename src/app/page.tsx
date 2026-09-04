"use client";

import { FormEvent, useState } from "react";

type PopulationResult = { statistic: string; formattedValue: string; unit: string; geography: string; period: string; source: { name: string; table: string; url: string } };
const exampleQuestions = ["Qual a população do Brasil?", "Quantas pessoas moravam no Brasil em 2022?"];

export default function Home() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<PopulationResult | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuestion = question.trim().toLocaleLowerCase("pt-BR");
    if (!normalizedQuestion) return;
    setResult(null); setMessage("");
    if (!normalizedQuestion.includes("brasil") || (!normalizedQuestion.includes("popula") && !normalizedQuestion.includes("pessoas"))) {
      setMessage("Neste primeiro recorte, eu respondo perguntas sobre a população do Brasil. Experimente uma das sugestões abaixo.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch("/api/ibge/populacao");
      const data = (await response.json()) as PopulationResult & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? "Não foi possível consultar a fonte oficial agora.");
      setResult(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ocorreu um erro inesperado.");
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
        <form onSubmit={handleQuestion} className="question-form"><label className="sr-only" htmlFor="question">Sua pergunta sobre dados brasileiros</label><input id="question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ex.: Qual a população do Brasil?" autoComplete="off" /><button type="submit" disabled={isLoading}>{isLoading ? "Consultando..." : "Consultar"}</button></form>
        <div className="example-list" aria-label="Perguntas de exemplo">{exampleQuestions.map((example) => <button key={example} type="button" onClick={() => setQuestion(example)}>{example}</button>)}</div>
        {message && <p className="feedback" role="status">{message}</p>}
        {result && <article className="answer" aria-live="polite"><p className="answer-kicker">Resposta encontrada</p><p className="answer-text">Em <strong>{result.period}</strong>, a {result.statistic.toLocaleLowerCase()} do {result.geography} era de</p><p className="answer-number">{result.formattedValue}</p><p className="answer-unit">{result.unit}</p><footer className="source"><span>Fonte: {result.source.name} · {result.source.table}</span><a href={result.source.url} target="_blank" rel="noreferrer">Ver tabela oficial ↗</a></footer></article>}
      </section>
      <section className="principles" aria-label="Princípios do Senso AI"><article><span>01</span><h2>Dados, não opiniões</h2><p>O número vem da API oficial do IBGE. A IA não inventa uma resposta.</p></article><article><span>02</span><h2>Fonte sempre visível</h2><p>Cada resposta deve indicar tabela, período, unidade e recorte geográfico.</p></article><article><span>03</span><h2>Escopo honesto</h2><p>Começamos pequeno, validamos a qualidade e só então ampliamos as perguntas aceitas.</p></article></section>
    </main>
  );
}
