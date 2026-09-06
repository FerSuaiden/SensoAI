# Senso AI

Uma interface para consultar estatísticas públicas brasileiras em linguagem natural, com respostas verificáveis e fontes oficiais.

## Estado atual

Consultamos a população residente de Brasil, estados e Distrito Federal nos **Censos 2000, 2010 e 2022**. Sem ano, usamos 2022. As tabelas oficiais são 202 e 4709, conforme o período.

A interpretação tem dois caminhos: regras para frases já reconhecidas e, quando habilitada, OpenAI para perguntas mais livres. A IA propõe filtros; o número, a unidade, o período e a fonte vêm do SIDRA. Ainda não há RAG nem embeddings.

Municípios, população atual, outros indicadores, comparações e filtros demográficos permanecem fora do escopo. São Paulo e Rio de Janeiro precisam de sigla ou indicação de estado para evitar confusão com a cidade.

## Rodando sem chave

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. O modo padrão usa regras:

- “Qual a população do Brasil?”
- “Qual a população de MG em 2010?”
- “Quantas pessoas moravam no Brasil em 2000?”

## Habilitando a interpretação com IA

Copie `.env.example` para `.env.local` e configure:

```dotenv
SENSO_INTERPRETER=openai
OPENAI_API_KEY=sua_chave_local
OPENAI_MODEL=gpt-4.1-mini
```

Edite a chave apenas no arquivo local. `.env.local` está no `.gitignore`; `.env.example` contém somente o modelo de configuração e pode ser versionado. A chave é lida no servidor, sem prefixo `NEXT_PUBLIC_`. Reinicie `npm run dev` após configurar.

O modelo escolhido suporta saída estruturada e pode ser alterado pela variável de ambiente, desde que seja compatível com a Responses API e a configuração enviada. A integração usa `fetch` diretamente, com limite de saída de 400 tokens, timeout de 12 segundos e sem retries automáticos.

Com IA habilitada, experimente “Me conta quantos habitantes havia em MG em 2010”. Frases reconhecidas pelas regras continuam sem chamada ao modelo. As demais enviam o texto da pergunta à OpenAI e consomem tokens da API. Falhas do modelo recebem mensagem de erro; não são convertidas em uma resposta estatística.

A implementação foi verificada com respostas simuladas. A avaliação com o modelo real exige chave e acesso ao modelo na sua conta. Ela ainda precisa ser executada neste projeto.

## Verificação e avaliação

```bash
npm test
npm run lint
npm run build
```

Os testes não fazem chamadas pagas. A avaliação abaixo é separada e opcional: faz até 12 chamadas reais ao modelo, sem consultar o SIDRA. Requer `.env.local` com chave e gera consumo na API:

```bash
npm run eval:llm
```

Ela compara território e ano para perguntas suportadas e espera recusa para ambiguidades e pedidos fora do escopo. Falhas de rede não contam como recusas corretas. Não é uma prova de segurança ou correção para todas as perguntas.

## Fluxo e arquivos

```text
page.tsx
  -> POST /api/consulta
  -> interpret-question.ts: tenta regras; se habilitado, usa OpenAI quando necessário
  -> population.ts: valida território e período
  -> population-catalog.ts + sidra.ts: escolhem a consulta e obtêm o dado
  -> resultado com recorte e fonte oficial
```

- `src/lib/population.ts`: parser por regras, tipos e validação de filtros.
- `src/lib/population-catalog.ts`: períodos, tabelas e categorias permitidas.
- `src/lib/interpret-question.ts`: escolha entre regras e IA.
- `src/lib/openai-population.ts`: chamada à OpenAI, prompt e tratamento da resposta.
- `src/lib/population-interpretation.ts`: schema JSON, validação da proposta e erros de interpretação.
- `src/lib/sidra.ts`: consulta oficial, cache de 24 horas e validação do dado.
- `tests/`: testes determinísticos e de integração com mocks.
- `scripts/eval-interpretation.ts`: avaliação opt-in com o modelo real.

## API

A interface envia `POST /api/consulta` com JSON `{ "pergunta": "Qual a população de MG em 2010?" }`. São aceitos apenas esse campo e perguntas de até 300 caracteres, com limite de 4 KiB no corpo. O resultado inclui `interpretation.method` (`rules` ou `openai`), além dos campos estatísticos existentes.

A rota anterior `GET /api/ibge/populacao?pergunta=...` continua disponível e usa exclusivamente regras. Sem parâmetros, consulta Brasil em 2022.

Na nova rota, 400 indica entrada inválida ou não suportada; 413, corpo muito grande; 415, tipo de conteúdo incorreto; 404, ausência de valor numérico; 502, falha na interpretação ou na fonte; e 503, configuração/serviço de IA indisponível. O cliente tem timeout de 30 segundos para interpretação e consulta em sequência.

## Onde aprender e quando entra RAG

A pasta [`conhecimento`](./conhecimento) registra conceitos, decisões, dificuldades e explicações para entrevistas. Ela permanece local conforme o `.gitignore` existente.

Leia [integração do LLM](./conhecimento/09-llm-com-saida-estruturada.md) e [plano do RAG](./conhecimento/10-quando-e-como-fazer-rag.md). O próximo passo de RAG será criar uma pequena base de descrições e notas oficiais, recuperar os trechos relevantes para a pergunta e usá-los para orientar a escolha de tabela ou explicar metodologia. O catálogo atual enviado integralmente no prompt não é uma busca RAG.

## Fontes

- [Tabela 202 — População residente](https://sidra.ibge.gov.br/tabela/202)
- [Tabela 4709 — População residente](https://sidra.ibge.gov.br/tabela/4709)
- [OpenAI Docs — Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
