/**
 * Filters Tests (Sprint 30)
 */

import {
  filterActive,
  filterInactive,
  filterConnected,
  filterDisconnected,
  filterHealthy,
  filterUnhealthy,
  applyFilters,
  listFilterTypes,
} from "../connectorFilters.js";
import { FILTER_TYPES } from "../registryContracts.js";

const _connectors = [
  { connectorId: "c1", status: "ACTIVE", health: "HEALTHY" },
  { connectorId: "c2", status: "INACTIVE", health: "UNHEALTHY" },
  { connectorId: "c3", status: "CONNECTED", health: "HEALTHY" },
  { connectorId: "c4", status: "DISCONNECTED", health: "UNHEALTHY" },
  { connectorId: "c5", status: "ACTIVE", health: "UNKNOWN" },
];

export const FILTER_TESTS = [
  {
    id: 132,
    name: "filterActive returns only ACTIVE connectors",
    run: () => filterActive(_connectors),
    assert: (r) => r.length === 2 && r.every((c) => c.status === "ACTIVE") && Object.isFrozen(r),
  },
  {
    id: 133,
    name: "filterInactive returns only INACTIVE connectors",
    run: () => filterInactive(_connectors),
    assert: (r) => r.length === 1 && r.every((c) => c.status === "INACTIVE"),
  },
  {
    id: 134,
    name: "filterConnected returns only CONNECTED connectors",
    run: () => filterConnected(_connectors),
    assert: (r) => r.length === 1 && r.every((c) => c.status === "CONNECTED"),
  },
  {
    id: 135,
    name: "filterDisconnected returns only DISCONNECTED connectors",
    run: () => filterDisconnected(_connectors),
    assert: (r) => r.length === 1 && r.every((c) => c.status === "DISCONNECTED"),
  },
  {
    id: 136,
    name: "filterHealthy returns only HEALTHY connectors",
    run: () => filterHealthy(_connectors),
    assert: (r) => r.length === 2 && r.every((c) => c.health === "HEALTHY"),
  },
  {
    id: 137,
    name: "filterUnhealthy returns only UNHEALTHY connectors",
    run: () => filterUnhealthy(_connectors),
    assert: (r) => r.length === 2 && r.every((c) => c.health === "UNHEALTHY"),
  },
  {
    id: 138,
    name: "filterActive returns empty for non-array input",
    run: () => filterActive(null),
    assert: (r) => r.length === 0 && Object.isFrozen(r),
  },
  {
    id: 139,
    name: "applyFilters with single filter",
    run: () => applyFilters(_connectors, ["ACTIVE"]),
    assert: (r) => r.length === 2,
  },
  {
    id: 140,
    name: "applyFilters with multiple filters (AND logic)",
    run: () => applyFilters(_connectors, ["ACTIVE", "HEALTHY"]),
    assert: (r) => r.length === 1 && r[0].connectorId === "c1",
  },
  {
    id: 141,
    name: "applyFilters with no filters returns all",
    run: () => applyFilters(_connectors, []),
    assert: (r) => r.length === 5 && Object.isFrozen(r),
  },
  {
    id: 142,
    name: "applyFilters ignores invalid filter types",
    run: () => applyFilters(_connectors, ["ACTIVE", "INVALID_FILTER"]),
    assert: (r) => r.length === 2,
  },
  {
    id: 143,
    name: "applyFilters returns empty for non-array input",
    run: () => applyFilters(null, ["ACTIVE"]),
    assert: (r) => r.length === 0,
  },
  {
    id: 144,
    name: "listFilterTypes returns all 6 types",
    run: () => listFilterTypes(),
    assert: (r) => r.length === 6 && Object.isFrozen(r),
  },
  {
    id: 145,
    name: "listFilterTypes matches FILTER_TYPES",
    run: () => listFilterTypes(),
    assert: (r) => r.every((t, i) => t === FILTER_TYPES[i]),
  },
];