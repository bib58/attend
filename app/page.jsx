'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Auth } from './lib/auth';
import { checkSession } from './lib/authActions';
import Ghar from './Home';

export default function Home() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const routeTo = async (portal) => {
    if (!mounted) return;

    const session = await checkSession();

    if (portal === 'admin') {
      await Auth.logout(router, '/login?role=admin');
    } else if (portal === 'teacher') {
      if (session.authenticated && session.role === 'invigilator') {
        router.push('/teacher');
      } else {
        await Auth.logout(router, '/login?role=invigilator');
      }
    } else {
      console.warn(`Unrecognized portal: ${portal}`);
    }
  };

  return <Ghar routeTo={routeTo} />;
}