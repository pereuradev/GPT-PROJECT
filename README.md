# PokéMentor IA

Sistema educacional com tema Pokémon criado para aprender e testar a integração de uma aplicação Node.js com o OpenRouter.

## O que o projeto possui

- interface responsiva com Pokémon e Poké Bolas;
- perguntas sugeridas e campo para perguntas livres;
- backend Express que mantém a chave fora do navegador;
- integração com o roteador gratuito `openrouter/free`;
- validação de entrada, mensagens de erro e limite básico de requisições;
- testes automatizados do backend.

## Como conectar sua chave

Crie gratuitamente uma chave em [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys).

Depois, abra o arquivo `.env`, que já está preparado e ignorado pelo Git, e cole sua chave depois do sinal de igual:

```env
OPENROUTER_API_KEY=cole_sua_chave_aqui
```

O arquivo `.env` está no `.gitignore` e não deve ser enviado ao GitHub.

## Como executar

```powershell
npm install
npm start
```

Depois, acesse [http://localhost:3000](http://localhost:3000).

Para desenvolver com reinicialização automática:

```powershell
npm run dev
```

## Testes

```powershell
npm test
```

Os testes usam um cliente simulado e não consomem o limite da API.

## Limite gratuito

O projeto usa `openrouter/free`, que seleciona automaticamente um modelo gratuito disponível. Como o modelo pode mudar entre as requisições, as respostas também podem variar.

Contas gratuitas possuem limites de uso definidos pelo OpenRouter. Quando o limite diário ou temporário for atingido, a interface mostrará uma mensagem específica.

## Estrutura principal

- `server.js`: servidor, segurança básica e chamada para o OpenRouter;
- `public/index.html`: estrutura visual;
- `public/styles.css`: tema e responsividade;
- `public/app.js`: interação da página com o backend;
- `test/server.test.js`: testes da integração local.

> Projeto educacional não oficial. Pokémon e seus personagens pertencem aos respectivos titulares.

As imagens usadas nesta demonstração foram obtidas do repositório público de sprites do [PokéAPI](https://github.com/PokeAPI/sprites).
