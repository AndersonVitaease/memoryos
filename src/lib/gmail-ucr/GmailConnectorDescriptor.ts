/**
 * GmailConnectorDescriptor.ts — Sprint EF-6.6.0
 *
 * Metadata descriptor for the Gmail connector.
 * Documents: id, name, protocol, transport, capabilities, auth requirements.
 * Used by Architecture Audit and Certification dashboards.
 */

export const GmailConnectorDescriptor = Object.freeze({
  id:           "gmail",
  name:         "Gmail",
  version:      "1.0.0",
  sprint:       "EF-6.6.0",
  protocol:     "HTTP/1.1",
  transport:    "http",           // resolved by TransportFactory
  baseUrl:      "https://gmail.googleapis.com/gmail/v1/users/me",
  authScheme:   "OAuth2 Bearer",
  scopes:       [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
  ],

  capabilities: [
    {
      id:          "gmail.listMessages",
      description: "List messages in the user's mailbox",
      params:      ["maxResults", "pageToken", "labelIds"],
      required:    [],
    },
    {
      id:          "gmail.getMessage",
      description: "Get a specific message by ID",
      params:      ["messageId", "format"],
      required:    ["messageId"],
    },
    {
      id:          "gmail.searchMessages",
      description: "Search messages using Gmail query syntax",
      params:      ["q", "maxResults", "pageToken"],
      required:    ["q"],
    },
    {
      id:          "gmail.downloadAttachment",
      description: "Download a message attachment",
      params:      ["messageId", "attachmentId"],
      required:    ["messageId", "attachmentId"],
    },
  ],

  // Architecture validation metadata
  architecture: {
    runtimeReused:    true,
    utlReused:        true,
    httpTransportReused: true,
    connectorRegistryReused: true,
    transportRegistryReused: true,
    pipelineReused:   true,
    newAbstractions:  0,
    newInfraFiles:    0,
    adapterFiles:     1,  // GmailAdapter.ts
    executorFiles:    1,  // GmailCapabilityExecutor.ts
    descriptorFiles:  1,  // this file
    definitionFiles:  1,  // GmailCapabilityDefinitions.ts
  },
});