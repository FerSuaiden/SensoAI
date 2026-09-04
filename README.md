# Senso AI

Uma interface para consultar estatísticas públicas brasileiras em linguagem natural, com respostas verificáveis e fontes oficiais.

## Estado atual

O primeiro caso de uso está pronto: perguntas sobre a população residente do Brasil consultam a tabela 4709 do SIDRA/IBGE e exibem valor, unidade, período e link da fonte.

O escopo ainda é propositalmente pequeno. A próxima etapa será ampliar consultas estruturadas antes de integrar um LLM para entender perguntas mais abertas.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Comandos úteis

```bash
npm run lint
npm run build
```

## Onde aprender sobre o projeto

A pasta [`conhecimento`](./conhecimento) registra as decisões de arquitetura e os conceitos relevantes para estudo e entrevistas.

## Fonte de dados

- [SIDRA / IBGE](https://sidra.ibge.gov.br/)
- [Tabela 4709 — População residente](https://sidra.ibge.gov.br/tabela/4709)
