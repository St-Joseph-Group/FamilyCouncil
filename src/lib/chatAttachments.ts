import React from 'react';
import { supabase } from './supabase';

/*
 * Chat attachments. Before this existed the composer captured a File, sent only
 * its file name as the message text, and threw the file away - chat_messages has
 * had attachment_url/attachment_type columns all along with nothing filling them.
 *
 * The bucket is private. These are family governance conversations and an
 * attachment can be a restricted document, so it must not be world readable.
 */

export const CHAT_ATTACHMENT_BUCKET = 'chat-attachments';

/*
 * Ten years. The bucket is private, so the signed URL is the only way in, and
 * it is stored on the message row. A short TTL would mean every historic
 * message needed an async round trip before its image could render, and images
 * in old conversations would silently rot. Rotating the project JWT secret
 * revokes these if that is ever needed.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;

export interface UploadedAttachment {
  url: string;
  path: string;
  type: string;
}

export function isImageAttachment(mimeType?: string | null) {
  return !!mimeType && mimeType.startsWith('image/');
}

/**
 * Pull the first image out of a paste, if the clipboard carries one.
 * Returns null for ordinary text pastes so they fall through untouched.
 */
export function imageFromClipboard(event: React.ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;

  for (const item of Array.from(items)) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (!file) continue;

    // Every screenshot pastes as "image.png", so a run of them would be
    // indistinguishable in the composer and would collide in storage.
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    return new File([file], `pasted-${Date.now()}.${ext}`, { type: file.type });
  }
  return null;
}

/**
 * Upload one attachment and return a URL that can be stored on the message.
 * Returns null on failure so the caller can still send the text.
 */
export async function uploadChatAttachment(
  file: File,
  conversationId: string,
): Promise<UploadedAttachment | null> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${conversationId}/${Date.now()}-${safeName}`;
  const contentType = file.type || 'application/octet-stream';

  const { error } = await supabase.storage
    .from(CHAT_ATTACHMENT_BUCKET)
    .upload(path, file, { contentType, upsert: false });
  if (error) return null;

  const { data } = await supabase.storage
    .from(CHAT_ATTACHMENT_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (!data?.signedUrl) return null;

  return { url: data.signedUrl, path, type: contentType };
}
