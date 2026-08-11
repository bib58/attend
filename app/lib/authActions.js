'use server';

import { cookies } from 'next/headers';
import { signToken, verifyToken } from './session';
import { db } from './firebaseAdmin';

export async function loginUser(passcode, role) {
  const code = passcode.trim().toUpperCase();
  if (!code) {
    return { success: false, error: 'Passcode cannot be empty.' };
  }

  const adminPasscodesStr = process.env.ADMIN_PASSCODES || process.env.NEXT_PUBLIC_ADMIN_PASSCODES || '';
  const adminPasscodes = adminPasscodesStr
    .split(',')
    .map(c => c.trim().toUpperCase())
    .filter(Boolean);

  if (role === 'admin') {
    if (adminPasscodes.includes(code)) {
      const token = await signToken({ role: 'admin' });
      const cookieStore = await cookies();
      cookieStore.set('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
      return { success: true, role: 'admin' };
    }
    return { success: false, error: 'Invalid admin passcode.' };
  }

  if (!db) {
    return { success: false, error: 'Database offline or not initialized on server.' };
  }

  try {
    const passcodeSnapshot = await db.collection('teacherPasscodes')
      .where('passcode', '==', code)
      .get();

    if (passcodeSnapshot.empty) {
      return { success: false, error: 'Invalid passcode or inactive account.' };
    }

    const passcodeDoc = passcodeSnapshot.docs[0];
    const teacherId = passcodeDoc.id;

    const teacherDoc = await db.collection('teachers').doc(teacherId).get();
    if (!teacherDoc.exists) {
      return { success: false, error: 'Invalid passcode or inactive account.' };
    }

    const teacherData = teacherDoc.data();

    if (teacherData.assignedDrive) {
      const driveDoc = await db.collection('drives').doc(teacherData.assignedDrive).get();
      if (driveDoc.exists && driveDoc.data().status === 'closed') {
        if (teacherData.active !== false) {
          await db.collection('teachers').doc(teacherId).update({ active: false });
        }
        return { success: false, error: 'Drive has been closed.' };
      }
    }

    if (!teacherData.active) {
      return { success: false, error: 'Invalid passcode or inactive account.' };
    }

    return {
      success: true,
      role: 'invigilator',
      id: teacherId,
      name: teacherData.name,
      hall: teacherData.assignedHall || '',
      driveId: teacherData.assignedDrive || ''
    };
  } catch (err) {
    console.error('Server-side login verification error:', err);
    return { success: false, error: err.message || 'Unknown database verification error.' };
  }
}

export async function logoutUser() {
  const cookieStore = await cookies();
  cookieStore.delete('session');
  return { success: true };
}

export async function checkSession() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;
    if (!token) return { authenticated: false };
    
    const payload = await verifyToken(token);
    if (!payload) return { authenticated: false };
    
    return {
      authenticated: true,
      role: payload.role,
      teacherId: payload.teacherId,
      name: payload.name,
      hall: payload.hall,
      driveId: payload.driveId
    };
  } catch (err) {
    return { authenticated: false };
  }
}
