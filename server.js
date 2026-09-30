import "dotenv/config";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import express from "express";
import OpenAI from "openai";

const DIRETORIO_ATUAL = path.dirname(fileURLToPath(import.meta.url));
const PORTA_PADRAO = 3000;

export const MODELO_OPENAI = "gpt-6-astra";

const INSTRUCOES_DO_ASSISTENTE = `
Você é o PokéMentor, um guia amigável especializado no universo Pokémon.
Responda sempre em português do Brasil, com linguagem clara e divertida.
Seja objetivo, mas explique termos importantes quando isso ajudar uma pessoa iniciante.
Quando não tiver certeza de uma informação, deixe essa limitação explícita.
Não invente nomes, tipos, golpes, evoluções ou números da Pokédex.
`.trim();

function validarPergunta(valor) {
  if (typeof valor !== "string") {
    return "Envie uma pergunta em formato de texto.";
  }

  const pergunta = valor.trim();

  if (pergunta.length < 3) {
    return "Escreva uma pergunta com pelo menos 3 caracteres.";
  }

  if (pergunta.length > 500) {
    return "A pergunta deve ter no máximo 500 caracteres.";
  }

  return null;
}

function criarLimitador({ limite = 20, janelaEmMs = 60_000 } = {}) {
  const acessosPorIp = new Map();

  return (requisicao, resposta, proximo) => {
    const agora = Date.now();
    const ip = requisicao.ip;
    const registro = acessosPorIp.get(ip);

    if (!registro || agora - registro.inicio >= janelaEmMs) {
      acessosPorIp.set(ip, { inicio: agora, quantidade: 1 });
      proximo();
      return;
    }

    if (registro.quantidade >= limite) {
      resposta.status(429).json({
        erro: "Muitas perguntas em pouco tempo. Aguarde um minuto e tente novamente.",
      });
      return;
    }

    registro.quantidade += 1;
    proximo();
  };
}

function mensagemDoErroDaOpenAI(erro) {
  if (erro?.status === 401) {
    return "A chave da API não foi aceita. Confira o valor de OPENAI_API_KEY no arquivo .env.";
  }

  if (erro?.status === 429) {
    return "O limite da API foi atingido. Confira os créditos e limites da sua conta OpenAI.";
  }

  if (erro?.status === 403) {
    return "Sua conta não tem acesso ao modelo configurado para este projeto.";
  }

  return "Não foi possível consultar a OpenAI agora. Tente novamente em alguns instantes.";
}

export function criarAplicacao({
  chaveDaApi = process.env.OPENAI_API_KEY,
  clienteOpenAI,
} = {}) {
  const aplicacao = express();
  const cliente = clienteOpenAI ?? (chaveDaApi ? new OpenAI({ apiKey: chaveDaApi }) : null);
  const apiConfigurada = Boolean(cliente);

  aplicacao.disable("x-powered-by");

  aplicacao.use((requisicao, resposta, proximo) => {
    resposta.setHeader("X-Content-Type-Options", "nosniff");
    resposta.setHeader("X-Frame-Options", "DENY");
    resposta.setHeader("Referrer-Policy", "no-referrer");
    proximo();
  });

  aplicacao.use(express.json({ limit: "10kb" }));
  aplicacao.use(express.static(path.join(DIRETORIO_ATUAL, "public")));

  aplicacao.get("/api/status", (requisicao, resposta) => {
    resposta.json({ configurada: apiConfigurada, modelo: MODELO_OPENAI });
  });

  aplicacao.post("/api/perguntar", criarLimitador(), async (requisicao, resposta) => {
    const erroDeValidacao = validarPergunta(requisicao.body?.pergunta);

    if (erroDeValidacao) {
      resposta.status(400).json({ erro: erroDeValidacao });
      return;
    }

    if (!cliente) {
      resposta.status(503).json({
        erro: "A API ainda não está conectada. Adicione OPENAI_API_KEY ao arquivo .env e reinicie o servidor.",
      });
      return;
    }

    try {
      const retorno = await cliente.responses.create({
        model: MODELO_OPENAI,
        instructions: INSTRUCOES_DO_ASSISTENTE,
        input: requisicao.body.pergunta.trim(),
      });

      const respostaDaIa = retorno.output_text?.trim();

      if (!respostaDaIa) {
        resposta.status(502).json({ erro: "A OpenAI respondeu, mas não retornou texto." });
        return;
      }

      resposta.json({ resposta: respostaDaIa, modelo: MODELO_OPENAI });
    } catch (erro) {
      console.error("Falha na chamada à OpenAI:", {
        status: erro?.status,
        requestId: erro?.request_id,
        mensagem: erro?.message,
      });

      resposta.status(erro?.status === 429 ? 429 : 502).json({
        erro: mensagemDoErroDaOpenAI(erro),
      });
    }
  });

  aplicacao.use((erro, requisicao, resposta, proximo) => {
    if (erro instanceof SyntaxError && "body" in erro) {
      resposta.status(400).json({ erro: "O corpo da requisição contém JSON inválido." });
      return;
    }

    proximo(erro);
  });

  return aplicacao;
}

const executadoDiretamente =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDiretamente) {
  const porta = Number(process.env.PORT) || PORTA_PADRAO;
  const aplicacao = criarAplicacao();

  aplicacao.listen(porta, () => {
    console.log(`PokéMentor disponível em http://localhost:${porta}`);

    if (!process.env.OPENAI_API_KEY) {
      console.log("Aguardando OPENAI_API_KEY no arquivo .env.");
    }
  });
}
