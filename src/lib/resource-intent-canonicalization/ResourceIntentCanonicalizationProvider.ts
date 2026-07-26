import { PassThroughResourceIntentCanonicalizer } from "./PassThroughResourceIntentCanonicalizer";
import type { IResourceIntentCanonicalizer } from "./ResourceIntentCanonicalizationTypes";

export type ResourceIntentCanonicalizerFactory = () => IResourceIntentCanonicalizer;

class ResourceIntentCanonicalizationProviderClass {
  private _factory: ResourceIntentCanonicalizerFactory = () => new PassThroughResourceIntentCanonicalizer();
  private _instance: IResourceIntentCanonicalizer | null = null;

  configure(factory: ResourceIntentCanonicalizerFactory): void {
    this._factory = factory;
    this._instance = null;
  }

  set(instance: IResourceIntentCanonicalizer): void {
    this._instance = instance;
  }

  get(): IResourceIntentCanonicalizer {
    if (!this._instance) {
      this._instance = this._factory();
    }
    return this._instance;
  }

  reset(): void {
    this._factory = () => new PassThroughResourceIntentCanonicalizer();
    this._instance = null;
  }
}

const _KEY = "__RICL_PROVIDER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ResourceIntentCanonicalizationProviderClass();
}

export const resourceIntentCanonicalizerProvider: ResourceIntentCanonicalizationProviderClass = (
  globalThis as unknown as Record<string, ResourceIntentCanonicalizationProviderClass>
)[_KEY];
