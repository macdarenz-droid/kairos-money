import { registerPlugin } from '@capacitor/core';
import type { ThemeId } from '../../ui/design/theme-registry';
export interface VaultPlugin {
  status(): Promise<{ configured: boolean; biometric: boolean; biometricEnabled: boolean; unlocked: boolean; backupCodeRequired?: boolean }>;
  setup(options: { pin: string; confirm: string }): Promise<void>;
  unlock(options: { pin: string }): Promise<void>;
  authenticate(): Promise<void>;
  recoverPin(): Promise<void>;
  replacePin(options: { pin: string; confirm: string }): Promise<void>;
  resetLockedApp(options: { confirmation: string }): Promise<void>;
  setBiometric(options: { enabled: boolean }): Promise<void>;
  backupRecovery(): Promise<{ code: string; acknowledged: boolean }>;
  acknowledgeBackupCode(options: { code: string }): Promise<void>;
  prepareDatabase(): Promise<void>;
  lock(): Promise<void>;
  erase(): Promise<void>;
  exportFile(options: { base64: string; fileName: string }): Promise<{ saved: boolean }>;
  setTheme(options: { theme: 'system' | ThemeId }): Promise<void>;
}
export const Vault = registerPlugin<VaultPlugin>('KairosVault');
