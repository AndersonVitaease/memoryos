/**
 * KnowledgePackageBuilder.ts — Knowledge Package SDK
 * Fluent builder for KnowledgePackageManifest.
 * Enforces MDPS manifest rules at build time.
 *
 * P3 · Version: 1.0.0
 *
 * Usage:
 *   const manifest = new KnowledgePackageBuilder("com.co.labor-law", "2024.1.0", "Brazilian Labor Law", "legal")
 *     .setLicense("CC-BY-4.0")
 *     .addSource({ name: "CLT 2024", date: "2024-01-01", type: "law" })
 *     .build();
 */

import type { KnowledgePackageManifest, OfficialSource } from "./IKnowledgePackage";

export class KnowledgePackageBuilder {
  private readonly _id: string;
  private readonly _version: string;
  private readonly _name: string;
  private readonly _domain: string;
  private _author = "MemoryOS";
  private _license = "proprietary";
  private _language = "pt-BR";
  private _validUntil?: string;
  private _sources: OfficialSource[] = [];
  private _dependencies: string[] = [];

  constructor(id: string, version: string, name: string, domain: string) {
    if (!id?.trim())   throw new Error("KnowledgePackageBuilder: id is required");
    if (!version?.trim()) throw new Error("KnowledgePackageBuilder: version is required");
    if (!name?.trim()) throw new Error("KnowledgePackageBuilder: name is required");
    if (!domain?.trim()) throw new Error("KnowledgePackageBuilder: domain is required");
    this._id      = id;
    this._version = version;
    this._name    = name;
    this._domain  = domain;
  }

  setAuthor(v: string): this      { this._author = v; return this; }
  setLicense(v: string): this     { this._license = v; return this; }
  setLanguage(v: string): this    { this._language = v; return this; }
  setValidUntil(v: string): this  { this._validUntil = v; return this; }
  addDependency(v: string): this  { this._dependencies.push(v); return this; }

  addSource(s: OfficialSource): this {
    this._sources.push(s);
    return this;
  }

  build(): KnowledgePackageManifest {
    if (this._sources.length === 0) {
      throw new Error("KnowledgePackageBuilder: At least one official source is required before build()");
    }
    return Object.freeze({
      packageId:    this._id,
      name:         this._name,
      domain:       this._domain,
      version:      this._version,
      author:       this._author,
      license:      this._license,
      sources:      Object.freeze([...this._sources]),
      language:     this._language,
      validUntil:   this._validUntil,
      dependencies: Object.freeze([...this._dependencies]),
    });
  }
}