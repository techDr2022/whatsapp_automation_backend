import {
  AuthenticationCreds,
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
  SignalDataSet,
  SignalDataTypeMap,
  SignalKeyStore,
} from "@whiskeysockets/baileys";
import { SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors Baileys' fixFileName: slashes and colons are illegal in storage paths. */
const sanitiseFilename = (name: string) =>
  name.replace(/\//g, "__").replace(/:/g, "-");

/** Builds the full storage object path for a given auth file. */
const objectPath = (prefix: string, filename: string) =>
  `${prefix}/${sanitiseFilename(filename)}`;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface SupabaseAuthState {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}

/**
 * Baileys auth state backed by Supabase Storage.
 *
 * All signal keys are cached in-memory after the initial load so runtime reads
 * are instant. Writes and deletes are committed to storage immediately so the
 * session survives server restarts without requiring a new QR scan.
 *
 * @param supabase  Service-role Supabase client
 * @param bucket    Storage bucket name (e.g. "whatsapp-sessions")
 * @param prefix    Path prefix inside the bucket (e.g. "auth")
 */
export async function useSupabaseAuthState(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string
): Promise<SupabaseAuthState> {
  // ── In-memory cache ───────────────────────────────────────────────────────
  const cache = new Map<string, unknown>();

  // ── Storage helpers ───────────────────────────────────────────────────────

  async function readFile<T = unknown>(filename: string): Promise<T | null> {
    const cached = cache.get(filename);
    if (cached !== undefined) return cached as T;

    const { data, error } = await supabase.storage
      .from(bucket)
      .download(objectPath(prefix, filename));

    if (error || !data) return null;

    const text = await data.text();
    const parsed = JSON.parse(text, BufferJSON.reviver) as T;
    cache.set(filename, parsed);
    return parsed;
  }

  async function writeFile(filename: string, value: unknown): Promise<void> {
    const body = JSON.stringify(value, BufferJSON.replacer);
    cache.set(filename, JSON.parse(body, BufferJSON.reviver));

    const { error } = await supabase.storage
      .from(bucket)
      .upload(objectPath(prefix, filename), body, {
        contentType: "application/json",
        upsert: true,
      });

    if (error) {
      throw new Error(`[session.store] write failed for "${filename}": ${error.message}`);
    }
  }

  async function deleteFile(filename: string): Promise<void> {
    cache.delete(filename);

    await supabase.storage
      .from(bucket)
      .remove([objectPath(prefix, filename)]);
    // Ignore errors — the file may not exist on a fresh setup.
  }

  // ── Warm the cache on startup ─────────────────────────────────────────────
  const { data: listed } = await supabase.storage
    .from(bucket)
    .list(prefix, { limit: 1000 });

  if (listed && listed.length > 0) {
    await Promise.all(
      listed.map(async (item) => {
        // readFile populates the cache as a side-effect.
        await readFile(item.name);
      })
    );
  }

  // ── Credentials ───────────────────────────────────────────────────────────
  const creds: AuthenticationCreds =
    (await readFile<AuthenticationCreds>("creds.json")) ?? initAuthCreds();

  // ── Signal key store ──────────────────────────────────────────────────────
  const keys: SignalKeyStore = {
    async get<T extends keyof SignalDataTypeMap>(
      type: T,
      ids: string[]
    ): Promise<{ [id: string]: SignalDataTypeMap[T] }> {
      const result: { [id: string]: SignalDataTypeMap[T] } = {};

      await Promise.all(
        ids.map(async (id) => {
          let value = await readFile<SignalDataTypeMap[T]>(`${type}-${id}.json`);

          // Baileys requires AppStateSyncKeyData to be a proto instance.
          if (type === "app-state-sync-key" && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(
              value as { [k: string]: unknown }
            ) as unknown as SignalDataTypeMap[T];
          }

          if (value) result[id] = value;
        })
      );

      return result;
    },

    async set(data: SignalDataSet): Promise<void> {
      const tasks: Promise<void>[] = [];

      for (const type in data) {
        const typeData = data[type as keyof SignalDataTypeMap];
        if (!typeData) continue;

        for (const id in typeData) {
          const value = typeData[id];
          const filename = `${type}-${id}.json`;
          tasks.push(value ? writeFile(filename, value) : deleteFile(filename));
        }
      }

      await Promise.all(tasks);
    },
  };

  // ── Return Baileys-compatible auth state ──────────────────────────────────
  return {
    state: { creds, keys },
    saveCreds: () => writeFile("creds.json", creds),
  };
}
