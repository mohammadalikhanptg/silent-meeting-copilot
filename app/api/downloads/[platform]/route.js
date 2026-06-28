import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

// Sourcing: binaries are built by GitHub Actions (.github/workflows/smc-helper.yml)
// on every push to helper/** and published as assets on the FIXED release tag
// 'helper-latest', which the workflow updates in place. We point straight at that
// tag (not /releases/latest) so the in-app download always serves exactly the most
// recent CI build, with no dependence on GitHub's "latest release" heuristic.
// HELPER_DOWNLOAD_BASE_URL can override this if the release channel ever changes.
const RELEASE_BASE = process.env.HELPER_DOWNLOAD_BASE_URL
  || 'https://github.com/mohammadalikhanptg/silent-meeting-copilot/releases/download/helper-latest';

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
