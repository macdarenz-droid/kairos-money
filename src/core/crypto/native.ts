import { registerPlugin } from '@capacitor/core';
export interface VaultPlugin {
  status(): Promise<{ configured: boolean; biometric: boolean; biometricEnabled: boolean; unlocked: boolean }>;
  setup(options: { pin: string; confirm: string }): Promise<void>;
  unlock(options: { pin: string }): Promise<void>;
  authenticate(): Promise<void>;
  recoverPin(): Promise<void>;
  replacePin(options: { pin: string; confirm: string }): Promise<void>;
  resetLockedApp(options: { confirmation: string }): Promise<void>;
  setBiometric(options: { enabled: boolean }): Promise<void>;
  databaseSecret(): Promise<{ secret: string }>;
  lock(): Promise<void>;
  erase(): Promise<void>;
  exportFile(options: { base64: string; fileName: string }): Promise<{ saved: boolean }>;
  setTheme(options: { theme: 'system' | 'dark' | 'light' }): Promise<void>;
}
export const Vault = registerPlugin<VaultPlugin>('KairosVault');
