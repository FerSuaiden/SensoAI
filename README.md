# Senso AI

Uma interface para consultar estatísticas públicas brasileiras em linguagem natural, com respostas verificáveis e fontes oficiais.

## Estado atual

Consultamos a população residente de Brasil, estados e Distrito Federal nos **Censos 2000, 2010 e 2022**. Sem ano, usamos 2022. As tabelas oficiais são 202 e 4709, conforme o período.

A interpretação tem dois caminhos: regras para frases já reconhecidas e, Gemini como provedor padrão para perguntas mais livres, ou OpenAI quando selecionada. A IA propõe filtros; o número, a unidade, o período e a fonte vêm do SIDRA. O primeiro protótipo de RAG recupera trechos locais de metadados oficiais para contextualizar a interpretação. Ainda não usamos embeddings nem banco vetorial.

Municípios, população atual, outros indicadores, comparações e filtros demográficos permanecem fora do escopo. São Paulo e Rio de Janeiro precisam de sigla ou indicação de estado para evitar confusão com a cidade.

## Entender a fonte

Na interface, escolha **Entender a fonte** e experimente:

- “Qual tabela usamos para população em 2010?”
- “Quais anos estão disponíveis na tabela 202?”
- “Qual é a unidade da população na tabela 4709?”
- “O que significa população residente no Censo 2022?”
- “Qual é a data de referência do Censo 2022?”

O modo explica tabela, períodos, unidade, recortes geográficos e classificações, com citações numeradas e evidências conferíveis. Informe uma tabela ou um ano; aqui não há ano padrão. A IA seleciona até três fatos da base recuperada e o servidor resolve seus textos e URLs. A explicação distingue capacidades da fonte de limitações do aplicativo.

Também explica dois conceitos do Censo 2022 a partir de uma publicação oficial: população residente e data de referência. As citações indicam seção, página impressa e página do PDF. Esses fatos são restritos a 2022 e distinguem transcrição literal de resumo.

Esse modo precisa de Gemini ou OpenAI configurado. Não consulta valores populacionais nem responde livremente sobre procedimentos de coleta, regras detalhadas de residência, margem de erro ou causas. Perguntas numéricas continuam na opção **Consultar população**. As fontes usadas nas explicações foram conferidas em 20/09/2026; a data aparece junto da fonte.

## Rodando sem chave

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. As perguntas reconhecidas pelas regras funcionam mesmo sem chave:

- “Qual a população do Brasil?”
- “Qual a população de MG em 2010?”
- “Quantas pessoas moravam no Brasil em 2000?”

## Configurando Gemini

O provedor padrão é Gemini. Copie `.env.example` para `.env.local` (se ainda não existir), crie uma chave no [Google AI Studio](https://aistudio.google.com/apikey) e preencha:

```dotenv
SENSO_INTERPRETER=gemini
GEMINI_API_KEY=sua_chave_local
GEMINI_MODEL=gemini-3.1-flash-lite
```

Edite a chave apenas no arquivo local, nunca no chat ou no código. `.env.local` está no `.gitignore`; `.env.example` contém apenas configurações de exemplo, sem credenciais. Reinicie `npm run dev` após configurar.

O modelo inicial aparece na documentação com nível gratuito; as cotas e a elegibilidade efetivas dependem da conta/projeto. A configuração local não controla o plano de cobrança do Google. `GEMINI_MODEL` permite escolher outro modelo compatível com `generateContent` e saída estruturada. Modelos com raciocínio adicional podem precisar de limites de saída e timeout diferentes.

Experimente “Me conta quantos habitantes havia em MG em 2010”. Frases reconhecidas pelas regras continuam sem chamada ao modelo. As demais enviam a pergunta apenas ao provedor escolhido e consomem a cota/tokens da API. Sem chave, essas frases recebem uma mensagem de configuração; os exemplos por regras continuam funcionando.

## Voltando à OpenAI ou usando só regras

Para OpenAI, basta configurar e reiniciar o servidor:

```dotenv
SENSO_INTERPRETER=openai
OPENAI_API_KEY=sua_chave_local
OPENAI_MODEL=gpt-4.1-mini
```

Para desabilitar chamadas de IA, use `SENSO_INTERPRETER=rules`. Não é necessário apagar a chave do outro provedor: só o selecionado é chamado. Não há fallback automático entre provedores.

Ambos recebem os mesmos trechos recuperados, prompt, schema e validador de filtros. Os adaptadores diferem na autenticação, formato HTTP e leitura da resposta. Usamos `fetch` direto, limite de 400 tokens de saída, timeout de 12 segundos e nenhuma tentativa automática. A interpretação não tem cache; a consulta SIDRA mantém o cache de 24 horas.

## Conferindo e atualizando as fontes

```bash
npm run sources:check
```

O comando consulta os metadados e períodos oficiais e gera `review.md` e `review.json` em uma pasta `.senso/sources/review-.../`, sem alterar os snapshots ativos. Confira as diferenças e use o ID informado no relatório:

```bash
npm run sources:apply -- --review review-ID
```

A aplicação usa exatamente os candidatos revisados, sem nova chamada de rede. Ela bloqueia fontes incompatíveis, coleta incompleta, candidatos modificados e revisões feitas antes de uma edição local. Os relatórios ficam fora do Git; os snapshots aceitos continuam versionados. Nenhum desses comandos usa LLM ou chave de API.

Após aplicar, confira `git diff -- src/data/sidra/`, rode os testes e a avaliação de recuperação. Em produção, faça novo build e reinicie para publicar as novas cópias. A data de conferência não muda o período estatístico. Consulte os detalhes e a recuperação de falhas em [Atualização das fontes](./conhecimento/15-atualizacao-e-revisao-das-fontes.md).

A conferência real de 20/09/2026 não encontrou mudanças de conteúdo: somente a data de conferência dos dois snapshots foi atualizada.

O PDF metodológico tem uma conferência separada, sem alteração de arquivos:

```bash
npm run methodology:check
```

O comando compara o SHA-256 do PDF oficial com a versão usada na curadoria. Se mudar, retorna falha e pede releitura das páginas citadas. Mudança de bytes não prova mudança de significado; o conteúdo dos fatos exige revisão humana. `sources:check` e `sources:apply` continuam limitados aos JSONs de metadados e períodos. Veja [Conceitos do Censo e fontes metodológicas](./conhecimento/16-conceitos-do-censo-e-fontes-metodologicas.md).

## Verificação e avaliação

```bash
npm test
npm run eval:retrieval
npm run lint
npm run build
```

`eval:retrieval` verifica dez buscas locais, sem chave, LLM ou rede. Consultas gerais admitem os dois trechos relevantes da tabela; consultas específicas verificam o tópico esperado. O filtro exato de ano já reduz a busca a uma tabela, então estes resultados não demonstram ganho de qualidade do RAG. Os testes usam respostas simuladas, sem chamadas aos provedores. A avaliação abaixo é separada e opcional: faz até 12 chamadas reais ao provedor escolhido em `SENSO_INTERPRETER`, sem consultar o SIDRA. Requer `.env.local` com a chave correspondente e consome cota/tokens (com cobrança se aplicável ao plano):

```bash
npm run eval:llm
# Avaliação separada: 18 perguntas de explicação e recusa (consome cota/tokens)
npm run eval:sources
```

`eval:llm` compara território e ano para perguntas suportadas e espera recusa para ambiguidades e pedidos fora do escopo. `eval:sources` avalia seleção de evidências e recusas de perguntas sem suporte. Na avaliação ampliada de 20/09/2026, passaram 15/18 casos: houve dois timeouts e uma falha de interpretação. Os cinco novos pedidos suportados sobre conceitos de 2022 escolheram os fatos esperados. Os 156 testes locais, lint e build passaram; testes com mocks não comprovam estabilidade da API. Falhas de integração não contam como recusas corretas. Não é uma prova de segurança ou correção para todas as perguntas.

## Fluxo e arquivos

```text
page.tsx
  -> POST /api/consulta
  -> interpret-question.ts: tenta regras
  -> se precisar de IA: population-retrieval.ts recupera até dois trechos oficiais
  -> provedor escolhido recebe pergunta + contexto e propõe filtros
  -> population.ts: valida território e período
  -> population-catalog.ts + sidra.ts: escolhem a consulta e obtêm o dado
  -> resultado com recorte e fonte oficial
```

- `src/lib/population.ts`: parser por regras, tipos e validação de filtros.
- `src/lib/population-catalog.ts`: períodos, tabelas e categorias permitidas.
- `src/lib/interpret-question.ts`: regras primeiro e IA quando necessário.
- `src/lib/llm-provider.ts`: seleção de Gemini ou OpenAI por configuração.
- `src/lib/population-prompt.ts`: instruções compartilhadas e contexto recuperado.
- `src/lib/population-retrieval.ts`: trechos com proveniência, filtro por ano e busca textual local.
- `src/data/sidra/`: snapshots oficiais dos metadados e períodos, conferidos em 20/09/2026.
- `src/data/methodology/censo-2022.json`: fatos revisados, páginas e hash do PDF metodológico.
- `scripts/check-methodology.ts`: conferência da versão do PDF, sem atualização automática de conteúdo.
- `scripts/eval-retrieval.ts`: avaliação da busca sem chamadas externas.
- `scripts/check-sources.ts` e `apply-sources.ts`: coleta, relatório e aplicação revisada dos snapshots.
- `scripts/lib/sidra-snapshot.ts`: validação de estrutura e compatibilidade com o catálogo.
- `scripts/lib/source-review.ts`: comparação, integridade da revisão e atualização de arquivos.
- `src/lib/gemini-json.ts` e `openai-json.ts`: transporte HTTP e leitura de respostas estruturadas.
- `src/lib/gemini-population.ts` e `openai-population.ts`: contrato de interpretação de população sobre o transporte compartilhado.
- `src/lib/source-facts.ts`: explicações preparadas e recuperação por tabela/ano.
- `src/lib/source-explanation.ts`: seleção de evidências pelo modelo e validação de IDs.
- `src/lib/api-question.ts`: validação de entrada compartilhada pelas rotas POST.
- `src/lib/population-interpretation.ts`: schema JSON, validação da proposta e erros de interpretação.
- `src/lib/sidra.ts`: consulta oficial, cache de 24 horas e validação do dado.
- `tests/`: testes determinísticos e de integração com mocks.
- `scripts/eval-interpretation.ts`: avaliação opt-in com o modelo real.

## API

A interface envia `POST /api/consulta` com JSON `{ "pergunta": "Qual a população de MG em 2010?" }`. São aceitos apenas esse campo e perguntas de até 300 caracteres, com limite de 4 KiB no corpo. O resultado inclui `interpretation.method` (`rules`, `gemini` ou `openai`) e `interpretation.context` (os trechos efetivamente fornecidos ao modelo; vazio no caminho por regras), além dos campos estatísticos existentes. A interface mostra o contexto em uma seção expansível com as fontes oficiais. URLs e textos dessa seção vêm da base local, nunca da geração do modelo.

`POST /api/fontes` aceita o mesmo corpo `{ "pergunta": "..." }` e retorna `{ method, facts }`, com texto, evidência e fonte para cada fato selecionado. Essa rota não consulta a API de valores do SIDRA. Ela também exige JSON, campo único, até 300 caracteres e 4 KiB de corpo.

A rota anterior `GET /api/ibge/populacao?pergunta=...` continua disponível e usa exclusivamente regras. Sem parâmetros, consulta Brasil em 2022.

Na nova rota, 400 indica entrada inválida ou não suportada; 413, corpo muito grande; 415, tipo de conteúdo incorreto; 404, ausência de valor numérico; 502, falha na interpretação ou na fonte; e 503, configuração/serviço de IA indisponível. O cliente tem timeout de 30 segundos para interpretação e consulta em sequência.

## Onde aprender e quando entra RAG

A pasta [`conhecimento`](./conhecimento) registra conceitos, decisões, dificuldades e explicações para entrevistas. Ela permanece local conforme o `.gitignore` existente.

Leia o [primeiro RAG com busca textual](./conhecimento/13-primeiro-rag-com-metadados.md), [Gemini e troca de provedor](./conhecimento/12-gemini-e-adaptadores-de-llm.md) e o [plano do RAG](./conhecimento/10-quando-e-como-fazer-rag.md). A interpretação numérica usa duas tabelas e quatro trechos; a tabela executável continua sendo escolhida pelo catálogo validado, conforme o ano. A recuperação contextualiza a proposta de filtros, sem delegar URLs ou números ao modelo. O modo **Entender a fonte**, detalhado em [Explicações com citações](./conhecimento/14-explicacoes-de-fontes-com-citacoes.md), recupera cinco fatos para a tabela 202 ou sete para a 4709 e usa a IA para selecionar até três explicações. O [passo 16](./conhecimento/16-conceitos-do-censo-e-fontes-metodologicas.md) acrescenta dois conceitos metodológicos verificados de 2022. Geração livre, metodologia dos demais censos e seleção entre indicadores continuam fora do escopo.

## Fontes

- [Tabela 202 — População residente](https://sidra.ibge.gov.br/tabela/202)
- [Tabela 4709 — População residente](https://sidra.ibge.gov.br/tabela/4709)
- [Censo 2022 — População e domicílios: Primeiros resultados, conceitos e definições](https://biblioteca.ibge.gov.br/visualizacao/livros/liv102011.pdf#page=16)
- [OpenAI Docs — Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

- [Gemini: saída estruturada em generateContent](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
- [Gemini: preços e nível gratuito](https://ai.google.dev/gemini-api/docs/pricing)
