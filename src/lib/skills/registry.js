import legal from "./specialists/legal";
import financial from "./specialists/financial";
import projectManagement from "./specialists/projectManagement";
import tech from "./specialists/tech";
import marketing from "./specialists/marketing";
import hr from "./specialists/hr";

/**
 * Registro central de Skills (Especialistas).
 *
 * Para adicionar um novo especialista:
 * 1. Crie um arquivo em src/lib/skills/specialists/novoEspecialista.js
 * 2. Exporte um objeto com: id, name, description, keywords[], systemPrompt
 * 3. Importe aqui e adicione ao array SKILLS
 *
 * A arquitetura principal (detector + integração no ChatPage) não precisa ser alterada.
 */
export const SKILLS = [
  legal,
  financial,
  projectManagement,
  tech,
  marketing,
  hr,
];