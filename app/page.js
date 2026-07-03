import { redirect } from 'next/navigation';
import { getSessionPayload } from './lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getSessionPayload();
  if (!session) redirect('/login');
  redirect('/home');
}
