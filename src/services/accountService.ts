import { getSupabaseClient } from './supabaseClient';
import type { Session, User } from '@supabase/supabase-js';
import type { WrappedVaultKey } from './vaultKeyService';

export interface AccountState {
  user: User | null;
  session: Session | null;
}

export async function getAccountState(): Promise<AccountState> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return { user: data.session?.user ?? null, session: data.session ?? null };
}

export async function signUpWithEmail(email: string, password: string): Promise<AccountState> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

export async function signInWithEmail(email: string, password: string): Promise<AccountState> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

export async function signOutAccount(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}

export async function saveWrappedVaultKey(record: WrappedVaultKey): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('A signed-in account is required.');

  const { error } = await supabase.from('vault_keys').upsert({
    user_id: userData.user.id,
    wrapped_vault_key: record.wrappedVaultKey,
    key_version: record.keyVersion,
    kdf_salt: record.kdfSalt,
    kdf_iterations: record.kdfIterations,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function loadWrappedVaultKey(): Promise<WrappedVaultKey | null> {
  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('vault_keys')
    .select('wrapped_vault_key,key_version,kdf_salt,kdf_iterations')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    wrappedVaultKey: data.wrapped_vault_key,
    keyVersion: data.key_version,
    kdfSalt: data.kdf_salt,
    kdfIterations: data.kdf_iterations,
  };
}

export function onAuthStateChange(
  callback: (state: AccountState) => void
): () => void {
  const supabase = getSupabaseClient();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback({ user: session?.user ?? null, session });
  });
  return () => data.subscription.unsubscribe();
}
