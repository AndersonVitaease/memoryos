extractParams: (msg) => {
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      // IA-014: mesma limpeza do IA-008 (drive.downloadFile) — este goal mapeia
      // pra mesma capability "drive.downloadFile" internamente, mas nunca tinha
      // recebido a mesma correção. Sem isso, "ler arquivos do drive" virava a
      // frase inteira como termo de busca.
      const stripped = msg
        .replace(/\b(baixar|baixe|baixa|baixo|baixando|download|downloads|exportar|exporte|exporta|abrir|abra|abre|ler|leia|o arquivo|o documento|arquivo|documento|do drive|no drive|por favor)\b/gi, "")
        .replace(/[-–—]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { fileName: quoted ?? (stripped || null), rawText: msg.trim() };
    },
