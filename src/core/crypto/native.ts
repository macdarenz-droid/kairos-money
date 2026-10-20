import { registerPlugin } from '@capacitor/core';
export interface VaultPlugin {
  status(): Promise<{ configured: boolean; biometric: boolean; biometricEnabled: boolean; unlocked: boolean }>;
  setup(options: { pin: string; confirm: string }): Promise<void>;
  unlock(options: { pin: string }): Promise<void>;
  authenticate(): Promise<void>;
  setBiometric(options: { enabled: boolean }): Promise<void>;
  databaseSecret(): Promise<{ secret: string }>;
  lock(): Promise<void>;
  erase(): Promise<void>;
  exportFile(options: { base64: string; fileName: string }): Promise<{ saved: boolean }>;
  setTheme(options: { theme: 'system' | 'dark' | 'light' }): Promise<void>;
  aiStatus(): Promise<{ configured: boolean; model: string }>;
  configureAi(options: { apiKey: string; model: string }): Promise<void>;
  clearAi(): Promise<void>;
  completeAi(options: { system: string; prompt: string; json: boolean }): Promise<{ content: string }>;
}
export const Vault = registerPlugin<VaultPlugin>('KairosVault');
