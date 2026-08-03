// Normaliza timestamp do SDK (sem sufixo de fuso) para UTC e formata em BRT.
// O SDK entrega created_date sem indicador de fuso (ex: "2026-08-03T19:15:59.526000"),
// entao new Date() interpretaria como horario LOCAL do navegador e deslocaria o
// horario em quem esta em BRT (mostraria 19:15 ao inves de 16:15). O banco guarda
// UTC, por isso acrescentamos "Z" quando nao houver offset.
export function formatTime(iso) {
  if (!iso) return "";
  const normalized =
    typeof iso === "string" && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)
      ? iso + "Z"
      : iso;
  return new Date(normalized).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}