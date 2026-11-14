import { describe, expect, it } from 'vitest';
import { changePassphrase, createVault, decryptString, encryptString, throttleDelayMs, unlockWithPassphrase, unlockWithRecovery } from './crypto';

describe('key vault', () => {
  it('encrypts with the DEK and unlocks with passphrase or recovery key', async () => {
    const { vault, dek, recoveryKey } = await createVault('correct horse battery');
    const blob = await encryptString(dek, 'severe peanut allergy');
    expect(blob.ct).not.toContain('peanut');

    const k1 = await unlockWithPassphrase(vault, 'correct horse battery');
    expect(await decryptString(k1, blob)).toBe('severe peanut allergy');

    const k2 = await unlockWithRecovery(vault, recoveryKey.toLowerCase()); // forgiving input
    expect(await decryptString(k2, blob)).toBe('severe peanut allergy');
  });

  it('rejects a wrong passphrase', async () => {
    const { vault } = await createVault('right');
    await expect(unlockWithPassphrase(vault, 'wrong')).rejects.toThrow();
  });

  it('changes passphrase via recovery key without re-encrypting data', async () => {
    const { vault, dek, recoveryKey } = await createVault('old');
    const blob = await encryptString(dek, 'note');
    const v2 = await changePassphrase(vault, { recoveryKey }, 'new');
    await expect(unlockWithPassphrase(v2, 'old')).rejects.toThrow();
    expect(await decryptString(await unlockWithPassphrase(v2, 'new'), blob)).toBe('note');
  });

  it('throttles after repeated failures', () => {
    expect(throttleDelayMs(2)).toBe(0);
    expect(throttleDelayMs(3)).toBe(5000);
    expect(throttleDelayMs(50)).toBe(300000);
  });
});
