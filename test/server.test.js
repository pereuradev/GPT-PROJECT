import assert from "node:assert/strict";
import test from "node:test";

import { criarAplicacao, MODELO_OPENROUTER } from "../server.js";

async function iniciarServidor(aplicacao) {
  return new Promise((resolver) => {
    const servidor = aplicacao.listen(0, "127.0.0.1", () => resolver(servidor));
  });
}

async function comServidor(aplicacao, teste) {
  const servidor = await iniciarServidor(aplicacao);
  const endereco = servidor.address();
  const urlBase = `http://127.0.0.1:${endereco.port}`;

  try {
    await teste(urlBase);
  } finally {
    await new Promise((resolver, rejeitar) => {
      servidor.close((erro) => (erro ? rejeitar(erro) : resolver()));
    });
  }
}

test("informa quando a chave da API ainda não foi configurada", async () => {
  const aplicacao = criarAplicacao({ chaveDaApi: "" });

  await comServidor(aplicacao, async (urlBase) => {
    const resposta = await fetch(`${urlBase}/api/status`);
    const dados = await resposta.json();

    assert.equal(resposta.status, 200);
    assert.deepEqual(dados, {
      configurada: false,
      provedor: "OpenRouter",
      modelo: MODELO_OPENROUTER,
    });
  });
});

test("não tenta consultar o OpenRouter sem uma chave", async () => {
  const aplicacao = criarAplicacao({ chaveDaApi: "" });

  await comServidor(aplicacao, async (urlBase) => {
    const resposta = await fetch(`${urlBase}/api/perguntar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta: "Quem é o Pikachu?" }),
    });
    const dados = await resposta.json();

    assert.equal(resposta.status, 503);
    assert.match(dados.erro, /OPENROUTER_API_KEY/);
  });
});

test("valida a pergunta antes de enviá-la", async () => {
  const enviarAoOpenRouter = async () => ({
    choices: [{ message: { content: "Não deveria ser chamado." } }],
  });
  const aplicacao = criarAplicacao({ enviarAoOpenRouter });

  await comServidor(aplicacao, async (urlBase) => {
    const resposta = await fetch(`${urlBase}/api/perguntar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta: "a" }),
    });

    assert.equal(resposta.status, 400);
  });
});

test("envia a pergunta ao OpenRouter e devolve o texto", async () => {
  let perguntaRecebida;
  const enviarAoOpenRouter = async ({ pergunta }) => {
    perguntaRecebida = pergunta;
    return {
      model: "modelo-gratuito-escolhido",
      choices: [{ message: { content: "Pikachu é um Pokémon do tipo elétrico." } }],
    };
  };
  const aplicacao = criarAplicacao({ enviarAoOpenRouter });

  await comServidor(aplicacao, async (urlBase) => {
    const resposta = await fetch(`${urlBase}/api/perguntar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta: "Quem é o Pikachu?" }),
    });
    const dados = await resposta.json();

    assert.equal(resposta.status, 200);
    assert.equal(dados.resposta, "Pikachu é um Pokémon do tipo elétrico.");
    assert.equal(dados.modelo, "modelo-gratuito-escolhido");
    assert.equal(perguntaRecebida, "Quem é o Pikachu?");
  });
});

test("explica quando o limite gratuito do OpenRouter é atingido", async () => {
  const erroDeLimite = Object.assign(new Error("Too many requests"), { status: 429 });
  const enviarAoOpenRouter = async () => {
    throw erroDeLimite;
  };
  const aplicacao = criarAplicacao({
    enviarAoOpenRouter,
    registrarErro: () => {},
  });

  await comServidor(aplicacao, async (urlBase) => {
    const resposta = await fetch(`${urlBase}/api/perguntar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta: "Quem é o Pikachu?" }),
    });
    const dados = await resposta.json();

    assert.equal(resposta.status, 429);
    assert.match(dados.erro, /limite gratuito do OpenRouter/);
  });
});
