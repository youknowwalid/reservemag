import { supabase } from '../lib/supabase';
import { MediaAsset } from '../types';
import { OperationType, logSupabaseError } from '../lib/supabaseUtils';

const TABLE = 'media_assets';
const BUCKET = 'media';

function rowToAsset(row: any): MediaAsset {
  return {
    id: row.id,
    url: row.url,
    fileName: row.file_name,
    uploadedAt: row.uploaded_at,
    credit: row.credit,
    usageType: row.usage_type,
  };
}

export const mediaService = {
  async uploadFile(file: File, path: string, onProgress?: (progress: number) => void): Promise<string> {
    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const storagePath = `${path}/${fileName}`;

    console.log(`Starting upload: ${storagePath} (${(file.size / 1024).toFixed(2)} KB)`);
    if (onProgress) onProgress(0);

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      console.error('Supabase Storage upload error:', uploadError);
      throw uploadError;
    }
    // Supabase's upload() resolves only once the transfer is complete --
    // there's no native byte-level progress stream like Firebase's
    // uploadBytesResumable, so we report 0 -> 100 rather than incremental %.
    if (onProgress) onProgress(100);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const downloadURL = data.publicUrl;

    const { error: metaError } = await supabase.from(TABLE).insert({
      url: downloadURL,
      file_name: file.name,
      storage_path: storagePath,
    });
    if (metaError) {
      // The file itself uploaded fine; only the metadata row failed. Log it
      // (rather than silently returning as if everything succeeded) so an
      // orphaned storage object doesn't go untracked in the Media Library.
      logSupabaseError(metaError, OperationType.CREATE, TABLE);
    }

    return downloadURL;
  },

  async uploadArticleImage(file: File, onProgress?: (progress: number) => void): Promise<string> {
    return this.uploadFile(file, 'articles', onProgress);
  },

  async uploadAuthorImage(file: File, onProgress?: (progress: number) => void): Promise<string> {
    return this.uploadFile(file, 'authors', onProgress);
  },

  async uploadSettingsImage(file: File, onProgress?: (progress: number) => void): Promise<string> {
    return this.uploadFile(file, 'settings', onProgress);
  },

  async getAllAssets(): Promise<MediaAsset[]> {
    try {
      const { data, error } = await supabase.from(TABLE).select('*').order('uploaded_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToAsset);
    } catch (error) {
      logSupabaseError(error, OperationType.LIST, TABLE);
      return [];
    }
  },

  async deleteAsset(id: string, storagePath: string) {
    try {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([storagePath]);
      if (storageError) throw storageError;

      const { error } = await supabase.from(TABLE).delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      logSupabaseError(error, OperationType.DELETE, `${TABLE}/${id}`);
    }
  },
};
