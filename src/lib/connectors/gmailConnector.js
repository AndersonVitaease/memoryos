/**
 * Gmail Connector
 *
 * O conector traduz a linguagem do Core para a linguagem do Gmail.
 * O Core nunca conhece a API do Gmail — apenas intenções humanas
 * como "ler e-mails" ou "enviar e-mail".
 *
 * Requer OAuth (Builder+) para funcionar.
 * Quando conectado, permite: listar, buscar, ler e enviar e-mails.
 *
 * Jornada do usuário (do Prompt Mestre):
 *   Semana 2 → Gmail
 * O usuário conecta apenas quando desenvolver confiança.
 */

export const gmailConnector = {
  id: "gmail",
  name: "Gmail",

  /**
   * Verifica se o Gmail está conectado via OAuth.
   * Em produção, verificaria o token de conexão do app.
   */
  async isConnected() {
    // OAuth ainda não configurado no Beta.
    // Quando configurado: base44.asServiceRole.connectors.getConnection('gmail')
    return false;
  },

  /**
   * Métodos que o conector oferece ao Core.
   * O Core chama a intenção; o conector traduz para a API.
   */
  methods: {
    listEmails: "Listar e-mails recentes",
    sendEmail: "Enviar um e-mail",
    searchEmails: "Buscar e-mails por termo",
    readEmail: "Ler um e-mail específico",
  },

  /**
   * Executa uma ação do Gmail.
   * Requer conexão OAuth ativa.
   */
  async execute(method, params = {}) {
    const connected = await this.isConnected();

    if (!connected) {
      return {
        connected: false,
        message:
          "Gmail não está conectado. Você pode conectar sua conta na página de Conectores quando estiver pronto.",
      };
    }

    // Quando conectado, as chamadas reais à API do Gmail
    // seriam feitas através de backend functions usando o token OAuth.
    // O Core nunca vê esses detalhes — apenas recebe o resultado.

    return {
      connected: true,
      method,
      params,
      result: null,
    };
  },
};