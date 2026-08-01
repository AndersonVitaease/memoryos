/**
 * SpecialistBuilder.ts — Specialist SDK
 * Fluent builder for SpecialistManifest.
 * Enforces MDPS manifest rules at build time.
 *
 * P3 · Version: 1.0.0
 *
 * Usage:
 *   const manifest = new SpecialistBuilder("com.co.legal", "1.0.0", "Legal Specialist", "legal")
 *     .addExpertise({ topic: "CLT", confidence: 0.95, sources: ["CLT 2024"], limitations: [], language: "pt-BR" })
 *     .addLanguage("pt-BR")
 *     .build();
 */

import type { SpecialistManifest, SpecialistDomain, ExpertiseDeclaration } from "./ISpecialist";

export class SpecialistBuilder {
  private readonly _id: string;
  private readonly _version: string;
  private readonly _name: string;
  private readonly _domain: SpecialistDomain;
  private _subdomain?: string;
  private _author = "MemoryOS";
  private _expertise: ExpertiseDeclaration[] = [];
  private _languages: string[] = [];

  constructor(id: string, version: string, name: string, domain: SpecialistDomain) {
    if (!id?.trim())   throw new Error("SpecialistBuilder: id is required");
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`SpecialistBuilder: version must be semver, got "${version}"`);
    if (!name?.trim()) throw new Error("SpecialistBuilder: name is required");
    this._id      = id;
    this._version = version;
    this._name    = name;
    this._domain  = domain;
  }

  setSubdomain(v: string): this  { this._subdomain = v; return this; }
  setAuthor(v: string): this     { this._author = v; return this; }
  addLanguage(lang: string): this { this._languages.push(lang); return this; }

  addExpertise(e: ExpertiseDeclaration): this {
    if (this._expertise.some(x => x.topic === e.topic)) {
      throw new Error(`SpecialistBuilder: Expertise topic '${e.topic}' already registered`);
    }
    if (e.confidence < 0 || e.confidence > 1) {
      throw new Error(`SpecialistBuilder: Confidence must be 0.0–1.0, got ${e.confidence}`);
    }
    this._expertise.push(e);
    return this;
  }

  build(): SpecialistManifest {
    if (this._expertise.length === 0) {
      throw new Error("SpecialistBuilder: At least one expertise declaration is required before build()");
    }
    if (this._languages.length === 0) {
      throw new Error("SpecialistBuilder: At least one language must be declared before build()");
    }
    return Object.freeze({
      specialistId: this._id,
      name:         this._name,
      domain:       this._domain,
      subdomain:    this._subdomain,
      version:      this._version,
      author:       this._author,
      expertise:    Object.freeze([...this._expertise]),
      languages:    Object.freeze([...this._languages]),
    });
  }
}