/**
 * Connector Builder Tests (Sprint 27)
 * createConnector, cloneConnector, updateConnector, freezeConnector, setStatus.
 */

import {
  createConnector,
  cloneConnector,
  updateConnector,
  freezeConnector,
  setStatus,
} from "../connectorBuilder.js";
import { _resetIdsForTests } from "../contracts.js";

export const CONNECTOR_BUILDER_TESTS = [
  {
    id: 13,
    name: "createConnector builds a frozen connector with defaults",
    run: () => {
      _resetIdsForTests();
      const c = createConnector({ connectorName: "Shopify" });
      return { c, frozen: Object.isFrozen(c) };
    },
    assert: ({ c, frozen }) =>
      c.connectorName === "Shopify" &&
      c.connectorId === "eil-conn-1" &&
      c.status === "REGISTERED" &&
      frozen === true,
  },
  {
    id: 14,
    name: "cloneConnector copies all fields with overrides",
    run: () => {
      _resetIdsForTests();
      const original = createConnector({ connectorName: "Amadeus", vendor: "Amadeus" });
      const cloned = cloneConnector(original, { vendor: "Amadeus IT Group" });
      return { cloned, sameId: cloned.connectorId === original.connectorId };
    },
    assert: ({ cloned, sameId }) =>
      cloned.connectorName === "Amadeus" &&
      cloned.vendor === "Amadeus IT Group" &&
      sameId === true &&
      Object.isFrozen(cloned) === true,
  },
  {
    id: 15,
    name: "updateConnector applies partial updates",
    run: () => {
      _resetIdsForTests();
      const original = createConnector({ connectorName: "Intelbras", status: "REGISTERED" });
      const updated = updateConnector(original, { status: "ACTIVE" });
      return { updated, originalStatus: original.status, originalId: original.connectorId };
    },
    assert: ({ updated, originalStatus, originalId }) =>
      updated.status === "ACTIVE" &&
      originalStatus === "REGISTERED" &&
      updated.connectorId === originalId,
  },
  {
    id: 16,
    name: "freezeConnector freezes a plain object",
    run: () => {
      _resetIdsForTests();
      const obj = { connectorName: "TikTok", supportedEvents: ["ORDER_CREATED"] };
      const frozen = freezeConnector(obj);
      return { frozen, isFrozen: Object.isFrozen(frozen) };
    },
    assert: ({ frozen, isFrozen }) =>
      frozen.connectorName === "TikTok" && isFrozen === true,
  },
  {
    id: 17,
    name: "freezeConnector returns already-frozen connector as-is",
    run: () => {
      _resetIdsForTests();
      const c = createConnector({ connectorName: "Galileo" });
      const result = freezeConnector(c);
      return { same: result === c };
    },
    assert: ({ same }) => same === true,
  },
  {
    id: 18,
    name: "setStatus changes status and returns frozen clone",
    run: () => {
      _resetIdsForTests();
      const c = createConnector({ connectorName: "MercadoLivre" });
      const updated = setStatus(c, "PAUSED");
      return { updated, original: c.status };
    },
    assert: ({ updated, original }) =>
      updated.status === "PAUSED" && original === "REGISTERED",
  },
];