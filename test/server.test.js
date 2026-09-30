import assert from "node:assert/strict";
import test from "node:test";

import { criarAplicacao, MODELO_OPENAI } from "../server.js";

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
    assert.deepEqual(dados, { configurada: false, modelo: MODELO_OPENAI });
  });
});

test("não tenta consultar a OpenAI sem uma chave", async () => {
  const aplicacao = criarAplicacao({ chaveDaApi: "" });

  await comServidor(aplicacao, async (urlBase) => {
    const resposta = await fetch(`${urlBase}/api/perguntar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta: "Quem é o Pikachu?" }),
    });
    const dados = await resposta.json();

    assert.equal(resposta.status, 503);
    assert.match(dados.erro, /OPENAI_API_KEY/);
  });
});

test("valida a pergunta antes de enviá-la", async () => {
  const clienteFalso = { responses: { create: async () => ({ output_text: "Não deveria ser chamado." }) } };
  const aplicacao = criarAplicacao({ clienteOpenAI: clienteFalso });

  await comServidor(aplicacao, async (urlBase) => {
    const resposta = await fetch(`${urlBase}/api/perguntar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta: "a" }),
    });

    assert.equal(resposta.status, 400);
  });
});

test("envia a pergunta pela Responses API e devolve o texto", async () => {
  let parametrosRecebidos;
  const clienteFalso = {
    responses: {
      create: async (parametros) => {
        parametrosRecebidos = parametros;
        return { output_text: "Pikachu é um Pokémon do tipo elétrico." };
      },
    },
  };
  const aplicacao = criarAplicacao({ clienteOpenAI: clienteFalso });

  await comServidor(aplicacao, async (urlBase) => {
    const resposta = await fetch(`${urlBase}/api/perguntar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta: "Quem é o Pikachu?" }),
    });
    const dados = await resposta.json();

    assert.equal(resposta.status, 200);
    assert.equal(dados.resposta, "Pikachu é um Pokémon do tipo elétrico.");
    assert.equal(parametrosRecebidos.model, MODELO_OPENAI);
    assert.equal(parametrosRecebidos.input, "Quem é o Pikachu?");
    assert.match(parametrosRecebidos.instructions, /português do Brasil/);
  });
});
