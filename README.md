# Project - Senso AI

Uma interface para consultar estatísticas públicas brasileiras em linguagem natural, com respostas verificáveis e fontes oficiais.

## Estado atual

Perguntas simples sobre a população residente do Brasil, dos estados e do Distrito Federal consultam a tabela 4709 do SIDRA/IBGE. A resposta exibe valor, unidade, período, recorte geográfico e links para a tabela e a consulta exata na API.

O recorte é o **Censo 2022**, também quando a pergunta omite o ano. Não há LLM/RAG: regras no servidor transformam a pergunta em uma consulta estruturada. Anos diferentes, população atual, municípios, comparações e filtros demográficos são recusados.

Exemplos:

- “Qual a população do Brasil?”
- “Qual a população de MG em 2022?”
- “Qual a população do estado de São Paulo?”
- “Quantos habitantes tem o DF?”

Para São Paulo e Rio de Janeiro, use a sigla ou indique “estado” para evitar confusão com a cidade. O parser reconhece formas limitadas de perguntar; frases fora desses padrões recebem orientação para reformulação.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Comandos úteis

```bash
npm run lint
npm test
npm run build
```

## Onde aprender sobre o projeto

A pasta [`conhecimento`](./conhecimento) registra as decisões de arquitetura e os conceitos relevantes para estudo e entrevistas.

Comece por [consultas estruturadas](./conhecimento/04-consultas-estruturadas-e-interpretacao.md), [validação e cache](./conhecimento/05-validacao-cache-e-falhas.md) e [testes](./conhecimento/06-testes-de-consultas.md). Pela configuração existente do `.gitignore`, essa pasta fica apenas no workspace local.

## API e organização

`GET /api/ibge/populacao?pergunta=Qual%20a%20popula%C3%A7%C3%A3o%20de%20MG%20em%202022%3F`

Sem parâmetros, a rota mantém a consulta do Brasil em 2022. Somente `pergunta` é aceito, uma vez, com até 300 caracteres. Entradas fora do escopo recebem HTTP 400; observações sem valor numérico disponível, 404; falhas da fonte ou formato inesperado, 502.

- `src/lib/population.ts`: tipos, catálogo de UFs e interpretação da pergunta.
- `src/lib/sidra.ts`: URL, cache de 24 horas, timeout e validação do dado oficial.
- `src/app/api/ibge/populacao/route.ts`: entrada HTTP e tratamento dos erros.
- `tests/`: testes de interpretação, contrato dos dados e rota, sem depender da rede.

## Próxima evolução

Criar um catálogo para mais indicadores e períodos, com validação dos filtros de cada tabela. Depois, um LLM poderá propor consultas estruturadas a partir de frases mais livres, passando por validação no servidor antes de consultar o IBGE.

## Fonte de dados

- [SIDRA / IBGE](https://sidra.ibge.gov.br/)
- [Tabela 4709 — População residente](https://sidra.ibge.gov.br/tabela/4709)
