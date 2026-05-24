import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '../../api/client';
import { Avatar, AVATAR_PALETTE } from './Avatar';
import { XIcon } from './icons';

export interface EditableProfile {
  username: string;
  avatarColor: string | null;
  avatarImage: string | null;
}

interface Props {
  initial: EditableProfile;
  onClose: () => void;
  onSaved: (p: EditableProfile) => void;
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

// Center-crop a chosen image to a small square JPEG data URL. Keeping it tiny
// (160px, q0.82 ≈ 10–20KB) means it fits in the DB text column and the PATCH
// body without any object-storage infrastructure.
function fileToAvatarDataUrl(file: File, size = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas unsupported'));
        return;
      }
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

export function EditProfileModal({ initial, onClose, onSaved }: Props) {
  const [name, setName] = useState(initial.username);
  const [color, setColor] = useState<string | null>(initial.avatarColor);
  const [image, setImage] = useState<string | null>(initial.avatarImage);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const trimmed = name.trim();
  const nameValid = USERNAME_RE.test(trimmed);
  const nameChanged = trimmed !== initial.username;
  const colorChanged = color !== initial.avatarColor;
  const imageChanged = image !== initial.avatarImage;
  const dirty = (nameChanged && nameValid) || colorChanged || imageChanged;

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      toast.error('Please choose a PNG, JPG or WebP image.');
      return;
    }
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setImage(dataUrl);
    } catch {
      toast.error('Could not process that image.');
    }
  }

  async function save() {
    if (!dirty || saving) return;
    if (nameChanged && !nameValid) return;

    const patch: Record<string, unknown> = {};
    if (nameChanged) patch.username = trimmed;
    if (colorChanged) patch.avatarColor = color;
    if (imageChanged) patch.avatarImage = image;

    setSaving(true);
    try {
      const res = await apiClient.patch<EditableProfile>('/auth/me', patch);
      toast.success('Profile updated');
      onSaved({
        username: res.data.username,
        avatarColor: res.data.avatarColor,
        avatarImage: res.data.avatarImage,
      });
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: { error?: string; issues?: { message: string }[] } } };
      if (ax.response?.status === 409) toast.error('That username is already taken.');
      else toast.error(ax.response?.data?.issues?.[0]?.message ?? ax.response?.data?.error ?? 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tierup-overlay" role="dialog" aria-modal="true" aria-label="Edit profile" onClick={onClose}>
      <div className="edit-card" onClick={(e) => e.stopPropagation()}>
        <button className="tierup-close" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        <div className="edit-title">Edit profile</div>

        <div className="edit-avatar-row">
          <Avatar username={trimmed || initial.username} avatarColor={color} avatarImage={image} className="acc-ava edit-ava-preview" />
          <div className="edit-avatar-ctrls">
            <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
              {image ? 'Change photo' : 'Upload photo'}
            </button>
            {image && (
              <button type="button" className="btn btn-ghost edit-remove" onClick={() => setImage(null)}>Remove photo</button>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void onPickFile(e)} />
          </div>
        </div>

        <div className="edit-field">
          <label className="edit-label">Avatar colour {image && <span className="edit-hint">· shown when no photo</span>}</label>
          <div className="swatches">
            {AVATAR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={'swatch' + (color === c ? ' sel' : '')}
                style={{ background: c }}
                aria-label={`Colour ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="edit-field">
          <label className="edit-label" htmlFor="edit-username">Username</label>
          <input
            id="edit-username"
            className="edit-input"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
          />
          <div className={'edit-validation' + (nameChanged && !nameValid ? ' err' : '')}>
            {nameChanged && !nameValid
              ? '3–20 characters · letters, numbers and underscores only'
              : 'This is how you appear on the leaderboard and your profile URL.'}
          </div>
        </div>

        <div className="edit-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
