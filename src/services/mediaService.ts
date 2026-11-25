/**
 * ==========================================
 * File: src/services/mediaService.ts
 * Project: AdBoard V3
 * Purpose:
 * Handles digital assets validation, size verification,
 * storage upload pipelines, and base64 rendering fallbacks.
 * ==========================================
 */

import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, isPlaceholder } from '../firebase/config';
import { supabase, isSupabaseBackend } from '../supabase/config';
import { getLocalAuthHeaders } from './localSession';

const isLocalBackend = (import.meta as any).env?.VITE_LOCAL_BACKEND === 'true';

// Define validated MIME maps
const SUPPORTED_IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const SUPPORTED_VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm'];

// Define matching file extensions for diagnostics
const SUPPORTED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const SUPPORTED_VIDEO_EXTS = ['.mp4', '.mov', '.webm'];

/**
 * Validates and uploads media to Firebase Storage or generates local data url fallback
 */
export const MediaService = {

  /**
   * Validates a media file according to security size and MIME configurations.
   *
   * Purpose:
   * Inspects name, file extension, sizing limits, and MIME categorizations,
   * blocking invalid or oversized asset injections.
   *
   * Parameters:
   * @param {File} file - Target user file candidate.
   *
   * Security Considerations:
   * Restricts images to 20MB and videos to 500MB, checking client MIME headers.
   */
  validateFile(file: File): void {
    if (!file) {
      throw new Error("Validation failure: No file selected.");
    }

    const { name, size, type } = file;
    const lowerName = name.toLowerCase();

    // Check matching image types
    const isImageMime = SUPPORTED_IMAGE_MIMES.includes(type);
    const hasImageExt = SUPPORTED_IMAGE_EXTS.some(ext => lowerName.endsWith(ext));

    // Check matching video types
    const isVideoMime = SUPPORTED_VIDEO_MIMES.includes(type);
    const hasVideoExt = SUPPORTED_VIDEO_EXTS.some(ext => lowerName.endsWith(ext));

    if (!isImageMime && !isVideoMime) {
      throw new Error(`MIME Type Unsupported (${type || 'unknown'}). Please upload standard image files (JPG, PNG, GIF, WEBP) or video files (MP4, MOV, WEBM).`);
    }

    if (!hasImageExt && !hasVideoExt) {
      throw new Error(`File extension mismatch for filename "${name}". Please check the suffix extension complies with recommended standards.`);
    }

    // Direct bounds size audits (Images = 20MB, Videos = 500MB)
    if (isImageMime || hasImageExt) {
      const maxImgBytes = 20 * 1024 * 1024; // 20 MB
      if (size > maxImgBytes) {
        throw new Error(`Selected image file size (${(size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum security boundary limit of 20 MB.`);
      }
    } else {
      const maxVidBytes = 500 * 1024 * 1024; // 500 MB
      if (size > maxVidBytes) {
        throw new Error(`Selected video file size (${(size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum security boundary limit of 500 MB.`);
      }
    }
  },

  /**
   * Uploads a validated media file to Firebase Storage
   *
   * Purpose:
   * Securely saves media bytes to storage slot '/media/{userId}/{randomId_fileName}'
   * and queries the download web links. Fails back gracefully to standard local Data URLs
   * if Cloud Storage limits are hit.
   *
   * Parameters:
   * @param {File} file - Validated raw file element.
   * @param {string} userId - Authored Owner administrator UID.
   *
   * Returns:
   * @returns {Promise<string>} Web download URI of the uploaded resource.
   */
  async uploadMedia(file: File, userId: string): Promise<string> {
    // Validate again defensively
    this.validateFile(file);

    if (isSupabaseBackend) {
      console.info("AdBoard V3 (Supabase Mode): Uploading file directly to Supabase Storage...");
      try {
        // Construct a unique file path/name
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        // Upload the file to the 'adboard-assets' bucket (public)
        const { data, error } = await supabase!.storage
          .from('adboard-assets')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) {
          throw error;
        }

        // Retrieve public URL
        const { data: publicUrlData } = supabase!.storage
          .from('adboard-assets')
          .getPublicUrl(filePath);

        return publicUrlData.publicUrl;
      } catch (error) {
        console.error("Supabase file upload faulted:", error);
        const detail = error instanceof Error ? ` (${error.message})` : '';
        throw new Error(`Upload to Supabase Storage failed${detail}. Verify the 'adboard-assets' bucket exists, is Public, and has access policies configured.`);
      }
    }

    if (isLocalBackend) {
      console.info("AdBoard (Local Backend Mode): Uploading file to the local container...");
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: getLocalAuthHeaders(),
        body: formData
      });

      if (res.status === 401) {
        throw new Error("Session expired. Please sign in again.");
      }
      if (!res.ok) {
        let message = "Local upload request faulted on the backend container.";
        try {
          const data = await res.json();
          if (data.error) message = data.error;
        } catch { /* non-JSON error body */ }
        throw new Error(message);
      }

      const data = await res.json();
      return data.url; // Returns /uploads/fileId
    }

    // Bypassing network calls when in sandbox/placeholder mode to prevent infinite pending/stalling
    if (isPlaceholder) {
      console.info("AdBoard (Sandbox Mode): Bypassing standard Firestore bucket upload. Generating immediate local Blob object URL.");
      return URL.createObjectURL(file);
    }

    const fileId = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const storageRef = ref(storage, `media/${userId}/${fileId}`);

    try {
      console.log(`Uploading media asset to cloud path media/${userId}/${fileId}...`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      return url;
    } catch (error) {
      console.error("Cloud storage upload faulted:", error);
      const detail = error instanceof Error ? ` (${error.message})` : '';
      throw new Error(`Upload to Firebase Cloud Storage failed${detail}. Verify Storage is enabled and storage.rules are published.`);
    }
  },

  /**
   * Deletes a target media asset file from Firebase Storage
   *
   * Purpose:
   * Keeps storage footprint lean by pruning stale items from bucket paths.
   */
  async deleteMedia(url: string): Promise<void> {
    if (isSupabaseBackend) {
      if (url && url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(url);
          console.log("Successfully revoked local Blob object URL to release browser memory.");
        } catch (revokeError) {
          console.warn("Could not revoke Object URL:", revokeError);
        }
      }
      try {
        const decodedUrl = decodeURIComponent(url);
        const match = decodedUrl.match(/\/storage\/v1\/object\/public\/adboard-assets\/(.+)/);
        if (match && match[1]) {
          const { error } = await supabase!.storage
            .from('adboard-assets')
            .remove([match[1]]);
          if (error) {
            throw error;
          }
          console.log("Successfully pruned asset from Supabase Storage bucket.");
        }
      } catch (err) {
        console.warn("Could not delete file from Supabase Storage bucket:", err);
      }
      return;
    }

    if (isLocalBackend) {
      if (url && url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(url);
          console.log("Successfully revoked local Blob object URL to release browser memory.");
        } catch (revokeError) {
          console.warn("Could not revoke Object URL:", revokeError);
        }
      }
      return;
    }

    if (!url || url.startsWith('data:') || url.startsWith('blob:') || isPlaceholder) {
      // Local Base64 or Blob preview, or sandbox mode, skip storage removal
      if (url && url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(url);
          console.log("Successfully revoked local Blob object URL to release browser memory.");
        } catch (revokeError) {
          console.warn("Could not revoke Object URL:", revokeError);
        }
      }
      return;
    }

    try {
      // Decode absolute path variables and remove
      const decodedUrl = decodeURIComponent(url);
      const match = decodedUrl.match(/\/o\/(media\/[^?]+)/);
      if (match && match[1]) {
        const fileRef = ref(storage, match[1]);
        await deleteObject(fileRef);
        console.log("Successfully pruned asset from Cloud Storage bucket.");
      }
    } catch (error) {
      console.warn("Could not delete file from Cloud Storage bucket. Stale file may be deleted already or permissions blocked:", error);
    }
  }
};
