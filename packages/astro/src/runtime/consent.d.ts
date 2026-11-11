// Types for the published Core Consent module, which ships none.
export type ConsentChoices = Readonly<Record<string, boolean>>;

export interface ConsentChangeDetail {
  readonly choices: ConsentChoices;
  readonly previous: ConsentChoices;
  readonly granted: readonly string[];
  readonly revoked: readonly string[];
  readonly source: "accept-all" | "decline" | "save" | "grant" | "deny";
}

export interface ConsentManagerInstance {
  readonly ready: Promise<ConsentManagerInstance>;
  readonly revision: string;
  readonly valid: boolean;
  readonly choices: ConsentChoices;
  readonly isOpen: boolean;
  granted(id: string): boolean;
  whenGranted(id: string, callback: (manager: ConsentManagerInstance) => void): () => void;
  acceptAll(): ConsentChoices;
  declineAll(): ConsentChoices;
  grant(id: string): ConsentChoices;
  deny(id: string): ConsentChoices;
  save(choices: Readonly<Record<string, boolean>>, source?: string): ConsentChoices;
  open(trigger?: Element | null): void;
  close(): boolean;
  activate(root?: Document | Element): void;
  dispose(): void;
}

declare const ConsentManager: {
  new (element: Element, options?: { reload?: () => void }): ConsentManagerInstance;
  getInstance(target: Element | Document | null): ConsentManagerInstance | null;
  getOrCreateInstance(element: Element, options?: { reload?: () => void }): ConsentManagerInstance;
};
export default ConsentManager;

/** Binds the consent card under root; returns the manager or null. */
export declare function initConsent(
  root?: Document | Element,
  options?: { reload?: () => void },
): ConsentManagerInstance | null;

/** The Core revision rule: SHA-256 over sorted "<category>/<service>" lines plus reask. */
export declare function consentRevision(
  categories: readonly { id: string; services?: readonly { id: string }[] }[],
  reask?: number,
): Promise<string>;
