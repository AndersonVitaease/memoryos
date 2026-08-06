// Normaliza timestamp do SDK (sem sufixo de fuso) para UTC e formata em BRT.
// O SDK entrega created_date sem indicador de fuso (ex: "2026-08-03T19:15:59.526000"),
// entao new Date() interpretaria como horario LOCAL do navegador e deslocaria o
// horario em quem esta em BRT (mostraria 19:15 ao inves de 16:15). O banco guarda
// UTC, por isso acrescentamos "Z" quando nao houver offset.
//
// FIX: antes usavamos toLocaleTimeString({timeZone:"America/Sao_Paulo"}), mas
// alguns ambientes de preview ignoram a opcao timeZone e devolvem UTC (mostrava
// 23:24 ao inves de 20:24). Agora convertemos UTC->BRT manualmente (-3h; Brasil
// nao tem DST desde 2019) e formatamos com getters UTC — zero dependencia do ICU
// do navegador. Garante BRT sempre.
export function formatTime(iso) {
  if (!iso) return "";
  const normalized =
    typeof iso === "string" && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)
      ? iso + "Z"
      : iso;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "";
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const hh = String(brt.getUTCHours()).padStart(2, "0");
  const mm = String(brt.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}