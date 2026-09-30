const formulario = document.querySelector("#pergunta-formulario");
const campoPergunta = document.querySelector("#pergunta");
const contador = document.querySelector("#contador");
const botaoEnviar = document.querySelector("#enviar");
const textoBotao = document.querySelector("#texto-botao");
const caixaResposta = document.querySelector("#resposta");
const textoResposta = document.querySelector("#resposta-texto");
const statusApi = document.querySelector("#api-status");
const statusTexto = document.querySelector("#status-texto");

function mostrarResposta(mensagem, tipo = "sucesso") {
  caixaResposta.hidden = false;
  caixaResposta.classList.toggle("error", tipo === "erro");
  caixaResposta.querySelector(".answer-label").textContent =
    tipo === "erro" ? "NÃO FOI POSSÍVEL RESPONDER" : "RESPOSTA DO POKÉMENTOR";
  textoResposta.textContent = mensagem;
}

function alterarCarregamento(carregando) {
  botaoEnviar.disabled = carregando;
  botaoEnviar.classList.toggle("loading", carregando);
  textoBotao.textContent = carregando ? "Consultando..." : "Perguntar à IA";
}

async function lerJson(respostaHttp) {
  const tipoDeConteudo = respostaHttp.headers.get("content-type") ?? "";
  return tipoDeConteudo.includes("application/json") ? respostaHttp.json() : {};
}

async function verificarStatusDaApi() {
  try {
    const respostaHttp = await fetch("/api/status");
    const dados = await lerJson(respostaHttp);

    statusApi.classList.toggle("connected", dados.configurada);
    statusApi.classList.toggle("disconnected", !dados.configurada);
    statusTexto.textContent = dados.configurada
      ? `${dados.provedor} conectado · ${dados.modelo}`
      : "Adicione sua chave do OpenRouter no arquivo .env";
  } catch {
    statusApi.classList.add("disconnected");
    statusTexto.textContent = "Servidor indisponível";
  }
}

campoPergunta.addEventListener("input", () => {
  contador.textContent = `${campoPergunta.value.length}/500`;
});

document.querySelectorAll("[data-question]").forEach((botao) => {
  botao.addEventListener("click", () => {
    campoPergunta.value = botao.dataset.question;
    campoPergunta.dispatchEvent(new Event("input"));
    campoPergunta.focus();
    document.querySelector("#laboratorio").scrollIntoView({ behavior: "smooth" });
  });
});

formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const pergunta = campoPergunta.value.trim();

  if (pergunta.length < 3) {
    mostrarResposta("Escreva uma pergunta com pelo menos 3 caracteres.", "erro");
    campoPergunta.focus();
    return;
  }

  alterarCarregamento(true);
  caixaResposta.hidden = true;

  try {
    const respostaHttp = await fetch("/api/perguntar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta }),
    });

    const dados = await lerJson(respostaHttp);

    if (!respostaHttp.ok) {
      throw new Error(dados.erro || "A solicitação não pôde ser concluída.");
    }

    mostrarResposta(dados.resposta);
  } catch (erro) {
    mostrarResposta(erro.message || "Ocorreu um erro inesperado.", "erro");
  } finally {
    alterarCarregamento(false);
  }
});

verificarStatusDaApi();
