// Normaliza timestamp do SDK (sem sufixo de fuso) para UTC e retorna um label
// de agrupamento de data em BRT: "Hoje", "Ontem" ou "DD/MM/YYYY".
export function formatDateLabel(iso) {
  if (!iso) return "";
  const normalized =
    typeof iso === "string" && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)
      ? iso + "Z"
      : iso;

  const date = new Date(normalized);
  const fmt = (d) =>
    d.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const labelDate = fmt(date);

  const now = new Date();
  const todayStr = fmt(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = fmt(yesterday);

  if (labelDate === todayStr) return "Hoje";
  if (labelDate === yesterdayStr) return "Ontem";
  return labelDate;
}

// Chave de dia para comparar mensagens consecutivas (em BRT).
export function dayKey(iso) {
  if (!iso) return "";
  const normalized =
    typeof iso === "string" && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)
      ? iso + "Z"
      : iso;
  return new Date(normalized).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}