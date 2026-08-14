// Google Drive Registration Logger Helper
// Appends logged-in account name, email, time, and login method to a CSV file in Google Drive

const FILE_NAME = 'DailyCal_Pendaftaran_User.csv';
const CSV_HEADER = 'Waktu,Nama Akun,Email,Metode Login,Ruang Keluarga\n';

export interface DriveLogEntry {
  accountName: string;
  email: string;
  method: 'Google' | 'Email/Password' | 'Room Code';
  familyCode?: string;
}

/**
 * Ensures the Google Drive registration CSV log file exists and appends the entry.
 * Runs non-blockingly so any network or token expiration issue will not disrupt the user's login experience.
 */
export async function logUserToGoogleDrive(
  accessToken: string,
  entry: DriveLogEntry
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  if (!accessToken) {
    return { success: false, error: 'No access token provided' };
  }

  try {
    // 1. Search if the file already exists in user's Drive
    const query = encodeURIComponent(`name = '${FILE_NAME}' and trashed = false`);
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType)`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.warn('Google Drive search files failed:', searchRes.status, errText);
      return { success: false, error: `Drive search error: ${searchRes.status}` };
    }

    const searchData = await searchRes.json();
    const existingFiles = searchData.files || [];

    const now = new Date();
    const formattedDate = now.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const sanitizeCsvField = (str: string = '') => {
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const newRow = `${sanitizeCsvField(formattedDate)},${sanitizeCsvField(entry.accountName)},${sanitizeCsvField(entry.email)},${sanitizeCsvField(entry.method)},${sanitizeCsvField(entry.familyCode || '-')}\n`;

    if (existingFiles.length === 0) {
      // Create new file with initial content
      const fullContent = CSV_HEADER + newRow;
      const metadata = {
        name: FILE_NAME,
        mimeType: 'text/csv',
        description: 'Daftar riwayat pendaftaran dan login pengguna aplikasi DailyCal',
      };

      const form = new FormData();
      form.append(
        'metadata',
        new Blob([JSON.stringify(metadata)], { type: 'application/json' })
      );
      form.append('file', new Blob([fullContent], { type: 'text/csv' }));

      const createRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: form,
        }
      );

      if (!createRes.ok) {
        const createErr = await createRes.text();
        console.warn('Google Drive create file failed:', createRes.status, createErr);
        return { success: false, error: `Drive create error: ${createRes.status}` };
      }

      const fileData = await createRes.json();
      console.log('✅ Berhasil membuat file pendaftaran baru di Google Drive:', fileData.id);
      return { success: true, fileId: fileData.id };
    } else {
      // File exists - fetch existing content, append new row, and update via PATCH upload
      const fileId = existingFiles[0].id;
      const downloadRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      let existingContent = '';
      if (downloadRes.ok) {
        existingContent = await downloadRes.text();
      }

      // If header is missing, add header
      let updatedContent = existingContent;
      if (!updatedContent.trim().startsWith('Waktu')) {
        updatedContent = CSV_HEADER + updatedContent;
      }
      if (!updatedContent.endsWith('\n') && updatedContent.length > 0) {
        updatedContent += '\n';
      }
      updatedContent += newRow;

      const updateRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'text/csv',
          },
          body: updatedContent,
        }
      );

      if (!updateRes.ok) {
        const updateErr = await updateRes.text();
        console.warn('Google Drive update file failed:', updateRes.status, updateErr);
        return { success: false, error: `Drive update error: ${updateRes.status}` };
      }

      console.log('✅ Berhasil menambahkan data user baru ke Google Drive:', fileId);
      return { success: true, fileId };
    }
  } catch (err: any) {
    console.error('Google Drive logging error:', err);
    return { success: false, error: err?.message || 'Unknown error' };
  }
}

/**
 * Fetch and parse registered users directly from the Google Drive CSV file.
 */
export async function getDriveRegisteredUsers(
  accessToken: string
): Promise<{ total: number; entries: { time: string; name: string; email: string; method: string; family: string }[]; fileId?: string }> {
  if (!accessToken) return { total: 0, entries: [] };

  try {
    const query = encodeURIComponent(`name = '${FILE_NAME}' and trashed = false`);
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!searchRes.ok) return { total: 0, entries: [] };
    const searchData = await searchRes.json();
    const existingFiles = searchData.files || [];

    if (existingFiles.length === 0) return { total: 0, entries: [] };

    const fileId = existingFiles[0].id;
    const downloadRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!downloadRes.ok) return { total: 0, entries: [], fileId };
    const content = await downloadRes.text();

    const lines = content.split('\n').filter(line => line.trim().length > 0);
    if (lines.length <= 1) return { total: 0, entries: [], fileId };

    // Parse CSV rows
    const entries = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Basic CSV parser handling quotes
      const match = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
      const cleanCols = (match || line.split(',')).map(c => c.replace(/^"|"$/g, '').trim());
      if (cleanCols.length >= 2) {
        entries.push({
          time: cleanCols[0] || '-',
          name: cleanCols[1] || '-',
          email: cleanCols[2] || '-',
          method: cleanCols[3] || '-',
          family: cleanCols[4] || '-',
        });
      }
    }

    return {
      total: entries.length,
      entries: entries.reverse(), // latest first
      fileId
    };
  } catch (err) {
    console.warn('Error reading Drive registered users:', err);
    return { total: 0, entries: [] };
  }
}
