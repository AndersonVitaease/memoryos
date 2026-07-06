/**
 * Builder Tests (Sprint 29)
 */

import { createConnectorBuilder } from "../connectorBuilder.js";
import { _resetIdsForTests } from "../connectorManifest.js";
import { BaseConnector } from "../baseConnector.js";

export const BUILDER_TESTS = [
  {
    id: 21,
    name: "create resets builder data",
    run: () => {
      _resetIdsForTests();
      const b = createConnectorBuilder();
      b.setName("First");
      b.create();
      return { data: b.data() };
    },
    assert: ({ data }) => Object.keys(data).length === 0,
  },
  {
    id: 22,
    name: "set methods populate data",
    run: () => {
      _resetIdsForTests();
      const b = createConnectorBuilder();
      b.setName("MyConnector")
        .setVendor("Acme")
        .setVersion("2.0.0")
        .setCategory("messaging")
        .setTags(["tag1", "tag2"])
        .setPermissions(["read", "write"])
        .setSupportedEvents(["message.created"])
        .setSupportedActions(["send"])
        .setSupportedCapabilities(["realtime"])
        .setMetadata({ region: "us" })
        .setMinimumMemoryOSVersion("1.5.0");
      return { data: b.data() };
    },
    assert: ({ data }) =>
      data.connectorName === "MyConnector" &&
      data.vendor === "Acme" &&
      data.connectorVersion === "2.0.0" &&
      data.category === "messaging" &&
      data.tags.length === 2 &&
      data.permissions.length === 2 &&
      data.supportedEvents.length === 1 &&
      data.metadata.region === "us" &&
      data.minimumMemoryOSVersion === "1.5.0",
  },
  {
    id: 23,
    name: "validate returns false without required fields",
    run: () => {
      _resetIdsForTests();
      const b = createConnectorBuilder();
      b.setVendor("Acme");
      return { result: b.validate() };
    },
    assert: ({ result }) =>
      result.valid === false && result.errors.length === 2,
  },
  {
    id: 24,
    name: "validate returns true with required fields",
    run: () => {
      _resetIdsForTests();
      const b = createConnectorBuilder();
      b.setName("Test").setVersion("1.0.0");
      return { result: b.validate() };
    },
    assert: ({ result }) => result.valid === true && result.errors.length === 0,
  },
  {
    id: 25,
    name: "build returns ok with manifest and connector",
    run: () => {
      _resetIdsForTests();
      const b = createConnectorBuilder();
      b.setName("Built").setVersion("1.2.3").setVendor("Vendor");
      const result = b.build();
      return { result };
    },
    assert: ({ result }) =>
      result.ok === true &&
      result.errors.length === 0 &&
      result.manifest.connectorName === "Built" &&
      result.manifest.connectorVersion === "1.2.3" &&
      result.connector !== null &&
      typeof result.connector.initialize === "function",
  },
  {
    id: 26,
    name: "build fails without required fields",
    run: () => {
      _resetIdsForTests();
      const b = createConnectorBuilder();
      b.setVendor("Acme");
      const result = b.build();
      return { result };
    },
    assert: ({ result }) =>
      result.ok === false && result.connector === null && result.errors.length === 2,
  },
  {
    id: 27,
    name: "clone creates independent copy of data",
    run: () => {
      _resetIdsForTests();
      const b1 = createConnectorBuilder();
      b1.setName("Original").setVersion("1.0.0");
      const b2 = b1.clone();
      b2.setName("Cloned");
      return { original: b1.data().connectorName, cloned: b2.data().connectorName };
    },
    assert: ({ original, cloned }) =>
      original === "Original" && cloned === "Cloned",
  },
  {
    id: 28,
    name: "freeze returns frozen manifest",
    run: () => {
      _resetIdsForTests();
      const b = createConnectorBuilder();
      b.setName("Frozen").setVersion("1.0.0");
      const m = b.freeze();
      return { m, frozen: Object.isFrozen(m) };
    },
    assert: ({ m, frozen }) =>
      m.connectorName === "Frozen" && frozen === true,
  },
  {
    id: 29,
    name: "build accepts custom connector class",
    run: () => {
      _resetIdsForTests();
      class Custom extends BaseConnector {
        extra() {
          return "extra";
        }
      }
      const b = createConnectorBuilder();
      b.setName("Custom").setVersion("1.0.0");
      const result = b.build(Custom);
      return { extra: result.connector.extra() };
    },
    assert: ({ extra }) => extra === "extra",
  },
];