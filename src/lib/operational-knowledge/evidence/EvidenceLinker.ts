/**
 * EvidenceLinker.ts
 * Resolves and traverses relationships between evidence records and KB documents.
 *
 * Authority: ENGINEERING
 * SRP: Link resolution only — read-only traversal of cross-references.
 * Sprint: KB-02
 *
 * Does NOT modify any record. Does NOT alter Official Library.
 */

import { EvidenceRegistry } from "./EvidenceRegistry";
import { OperationalKnowledgeRegistry } from "../OperationalKnowledgeRegistry";
import type { Evidence } from "./EvidenceTypes";

export interface EvidenceGraph {
  readonly evidenceId:        string;
  readonly title:             string;
  readonly linkedLessons:     string[];
  readonly linkedAntiPatterns:string[];
  readonly linkedBestPractices:string[];
  readonly linkedKnownIssues: string[];
  readonly linkedTroubleshooting:string[];
  readonly linkedJournal:     string[];
  readonly linkedOfficialDocs:string[];
  readonly linkedAdrs:        string[];
  readonly linkedRfcs:        string[];
  readonly linkedComponents:  string[];
  readonly relatedEvidence:   string[];
}

export interface BacklinkMap {
  /** KB document ID → list of evidence IDs that reference it */
  readonly [docId: string]: string[];
}

export const EvidenceLinker = Object.freeze({
  /**
   * Build the full relationship graph for one evidence record.
   */
  buildGraph(evidenceId: string): EvidenceGraph | null {
    const e = EvidenceRegistry.getById(evidenceId);
    if (!e) return null;

    return {
      evidenceId,
      title:                  e.title,
      linkedLessons:          [...(e.links.lessonsLearned  ?? [])],
      linkedAntiPatterns:     [...(e.links.antiPatterns    ?? [])],
      linkedBestPractices:    [...(e.links.bestPractices   ?? [])],
      linkedKnownIssues:      [...(e.links.knownIssues     ?? [])],
      linkedTroubleshooting:  [...(e.links.troubleshooting ?? [])],
      linkedJournal:          [...(e.links.journalEntries  ?? [])],
      linkedOfficialDocs:     [...(e.links.officialDocs    ?? [])],
      linkedAdrs:             [...(e.links.adrs            ?? [])],
      linkedRfcs:             [...(e.links.rfcs            ?? [])],
      linkedComponents:       [...(e.links.components      ?? [])],
      relatedEvidence:        [...(e.links.relatedEvidence ?? [])],
    };
  },

  /**
   * Build an inverted backlink map: for each KB doc ID, which evidences reference it.
   */
  buildBacklinkMap(): BacklinkMap {
    const map: Record<string, string[]> = {};

    const addLink = (docId: string, evidenceId: string) => {
      if (!map[docId]) map[docId] = [];
      if (!map[docId].includes(evidenceId)) map[docId].push(evidenceId);
    };

    for (const e of EvidenceRegistry.getAll()) {
      const l = e.links;
      for (const ref of [...(l.lessonsLearned ?? []), ...(l.antiPatterns ?? []),
                         ...(l.bestPractices ?? []), ...(l.knownIssues ?? []),
                         ...(l.troubleshooting ?? []), ...(l.journalEntries ?? []),
                         ...(l.officialDocs ?? []), ...(l.adrs ?? []), ...(l.rfcs ?? []),
                         ...(l.components ?? []), ...(l.relatedEvidence ?? [])]) {
        addLink(ref, e.id);
      }
    }

    return map;
  },

  /**
   * Find all evidences that reference a specific KB document or component.
   */
  findEvidencesFor(refId: string): Evidence[] {
    const q = refId.toLowerCase();
    return EvidenceRegistry.getAll().filter(e => {
      const l = e.links;
      return [
        ...(l.lessonsLearned  ?? []), ...(l.antiPatterns   ?? []),
        ...(l.bestPractices   ?? []), ...(l.knownIssues     ?? []),
        ...(l.troubleshooting ?? []), ...(l.journalEntries  ?? []),
        ...(l.officialDocs    ?? []), ...(l.adrs             ?? []),
        ...(l.rfcs             ?? []), ...(l.components      ?? []),
        ...(l.relatedEvidence ?? []),
      ].some(r => r.toLowerCase() === q);
    });
  },

  /**
   * Get all evidence records related to a given ADR.
   */
  findByAdr(adrId: string): Evidence[] {
    return EvidenceRegistry.getAll().filter(e =>
      (e.links.adrs ?? []).includes(adrId)
    );
  },

  /**
   * Get all evidence records related to a given RFC.
   */
  findByRfc(rfcId: string): Evidence[] {
    return EvidenceRegistry.getAll().filter(e =>
      (e.links.rfcs ?? []).includes(rfcId)
    );
  },

  /**
   * Get all evidence records linked to an official document.
   */
  findByOfficialDoc(docId: string): Evidence[] {
    return EvidenceRegistry.getAll().filter(e =>
      (e.links.officialDocs ?? []).includes(docId)
    );
  },
});