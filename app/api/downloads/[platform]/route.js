import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

// Sourcing: binaries are built by GitHub Actions on the helper branch / main CI and
// published as GitHub Release assets on mohammadalikhanptg/silent-meeting-copilot.
// HELPER_DOWNLOAD_BASE_URL can be overridden via env var; defaults to the latest release path.
const RELEASE_BASE = process.env.HELPER_DOWNLOAD_BASE_URL
  || 'https://github.com/mohammadalikhanptg/silent-meeting-copilot/releases/latest/download';

const PLATFORMS = {
  mac: { file: 'SMC-Helper.dmg', label: 'Mac DMG' },
  'mac-zip': { file: 'SMC-Helper-mac.zip', label: 'Mac ZIP' },
  win: { file: 'SMC-Helper-Setup.exe', label: 'Windows installer' },
};

export async function GET(request, { params }) {
  const session = await getSessionPayload();
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { platform } = await params;
  const entry = PLATFORMS[platform];
  if (!entry) {
    return NextResponse.json({ error: 'Unknown platform. Use: mac, mac-zip, win' }, { status: 404 });
  }

  const downloadUrl = `${RELEASE_BASE}/${entry.file}`;
  return NextResponse.redirect(downloadUrl, { status: 302 });
}
