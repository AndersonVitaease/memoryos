{
    type: "drive.openDocument",
    namespace: "drive",
    description: "Open or download a specific document in Drive",
    signals: [
      "ler arquivo", "ler documento", "ler esse documento", "leia esse documento",
      "leia o documento", "leia esse arquivo", "leia o arquivo",
      "read file", "read document",
      "open document", "open file",
      "abrir arquivo", "abrir o arquivo", "abrir o documento",
      // IA-034: frases de "pedir o conteúdo" que antes não disparavam
      // nenhuma leitura real — caíam direto na conversa livre, onde o
      // modelo inventava o conteúdo em vez de realmente ler o arquivo.
      "mostre os dados de", "mostre o conteúdo", "mostrar o conteúdo",
      "mostre os dados do", "me mostre os dados de", "me mostre o conteúdo",
      "conteúdo de", "conteudo de", "dados de", "o que diz o arquivo",
      "o que diz esse", "o que tem no arquivo", "o que tem nesse",
    ],
    extractParams: (msg) => {
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      // IA-014: mesma limpeza do IA-008 (drive.downloadFile) — este goal mapeia
      // pra mesma capability "drive.downloadFile" internamente, mas nunca tinha
      // recebido a mesma correção. Sem isso, "ler arquivos do drive" virava a
      // frase inteira como termo de busca.
      const stripped = msg
        .replace(/\b(baixar|baixe|baixa|baixo|baixando|download|downloads|exportar|exporte|exporta|abrir|abra|abre|ler|leia|o arquivo|os arquivos|o documento|os documentos|arquivo|arquivos|documento|documentos|do drive|no drive|drive|por favor|me|mostre|mostrar|os dados|dados|o conteúdo|o conteudo|conteúdo|conteudo|de|do|diz|tem|esse|nesse|nessa|que)\b/gi, "")
        .replace(/[-–—]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { fileName: quoted ?? (stripped || null), rawText: msg.trim() };
    },
  },
