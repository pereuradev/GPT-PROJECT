import "dotenv/config";

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import express from "express";

const DIRETORIO_ATUAL = path.dirname(fileURLToPath(import.meta.url));
const PORTA_PADRAO = 3000;

export const MODELO_OPENROUTER = "openrouter/free";
const URL_CHAT_OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

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

function mensagemDoErroDoOpenRouter(erro) {
  if (erro?.status === 401) {
    return "A chave do OpenRouter não foi aceita. Confira OPENROUTER_API_KEY no arquivo .env.";
  }

  if (erro?.status === 402) {
    return "O modelo solicitado exige créditos. O projeto está configurado para usar somente modelos gratuitos.";
  }

  if (erro?.status === 429) {
    return "O limite gratuito do OpenRouter foi atingido. Aguarde a renovação do limite e tente novamente.";
  }

  if (erro?.status === 403) {
    return "Sua chave não tem permissão para utilizar o OpenRouter neste projeto.";
  }

  if ([502, 503, 529].includes(erro?.status)) {
    return "Nenhum provedor gratuito está disponível agora. Tente novamente em alguns instantes.";
  }

  return "Não foi possível consultar o OpenRouter agora. Tente novamente em alguns instantes.";
}

function criarErroDoOpenRouter(respostaHttp, dados) {
  const mensagem = dados?.error?.message
    ?? `O OpenRouter respondeu com o status HTTP ${respostaHttp.status}.`;
  const erro = new Error(mensagem);

  erro.status = respostaHttp.status;
  erro.requestId = respostaHttp.headers.get("x-request-id");

  return erro;
}

export function criarConsultaOpenRouter({ chaveDaApi, fetchImpl = fetch }) {
  return async ({ pergunta }) => {
    const respostaHttp = await fetchImpl(URL_CHAT_OPENROUTER, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chaveDaApi}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO_OPENROUTER,
        messages: [
          { role: "system", content: INSTRUCOES_DO_ASSISTENTE },
          { role: "user", content: pergunta },
        ],
      }),
    });

    let dados;

    try {
      dados = await respostaHttp.json();
    } catch {
      dados = null;
    }

    if (!respostaHttp.ok) {
      throw criarErroDoOpenRouter(respostaHttp, dados);
    }

    return dados;
  };
}

export function criarAplicacao({
  chaveDaApi = process.env.OPENROUTER_API_KEY,
  enviarAoOpenRouter,
  registrarErro = console.error,
} = {}) {
  const aplicacao = express();
  const consultarOpenRouter = enviarAoOpenRouter ?? (chaveDaApi
    ? criarConsultaOpenRouter({ chaveDaApi })
    : null);
  const apiConfigurada = Boolean(consultarOpenRouter);

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
    resposta.json({
      configurada: apiConfigurada,
      provedor: "OpenRouter",
      modelo: MODELO_OPENROUTER,
    });
  });

  aplicacao.post("/api/perguntar", criarLimitador(), async (requisicao, resposta) => {
    const erroDeValidacao = validarPergunta(requisicao.body?.pergunta);

    if (erroDeValidacao) {
      resposta.status(400).json({ erro: erroDeValidacao });
      return;
    }

    if (!consultarOpenRouter) {
      resposta.status(503).json({
        erro: "O OpenRouter ainda não está conectado. Adicione OPENROUTER_API_KEY ao arquivo .env e reinicie o servidor.",
      });
      return;
    }

    try {
      const retorno = await consultarOpenRouter({
        pergunta: requisicao.body.pergunta.trim(),
      });

      const conteudo = retorno.choices?.[0]?.message?.content;
      const respostaDaIa = typeof conteudo === "string" ? conteudo.trim() : "";

      if (!respostaDaIa) {
        resposta.status(502).json({ erro: "O OpenRouter respondeu, mas não retornou texto." });
        return;
      }

      resposta.json({
        resposta: respostaDaIa,
        modelo: retorno.model ?? MODELO_OPENROUTER,
      });
    } catch (erro) {
      registrarErro("Falha na chamada ao OpenRouter:", {
        status: erro?.status,
        requestId: erro?.requestId,
        mensagem: erro?.message,
      });

      const statusDoCliente = [401, 402, 403, 404, 429].includes(erro?.status)
        ? erro.status
        : 502;

      resposta.status(statusDoCliente).json({
        erro: mensagemDoErroDoOpenRouter(erro),
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

    if (!process.env.OPENROUTER_API_KEY) {
      console.log("Aguardando OPENROUTER_API_KEY no arquivo .env.");
    }
  });
}
