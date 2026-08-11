'use server';

import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import twilio from 'twilio';
import { db } from '../lib/firebaseAdmin';
import { cookies } from 'next/headers';
import { verifyToken } from '../lib/session';

async function verifyAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  const session = await verifyToken(token);
  if (!session || session.role !== 'admin') {
    throw new Error('Unauthorized');
  }
}


export async function sendTwilioSMS({ accountSid, authToken, from, to, body }) {
  try {
    await verifyAdminSession();
    const isPlaceholder = (val) => !val || val === '[AuthToken]' || val === '[AccountSid]' || val === '[TwilioFrom]';

    const twilioSid = !isPlaceholder(accountSid) ? accountSid : (process.env.TWILIO_ACCOUNT_SID);
    const twilioToken = !isPlaceholder(authToken) ? authToken : process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = !isPlaceholder(from) ? from : (process.env.TWILIO_FROM_NUMBER);

    if (!twilioSid || !twilioToken || twilioToken === '[AuthToken]') {
      return { success: false, error: 'Twilio Account SID or Auth Token is missing.' };
    }

    const client = twilio(twilioSid, twilioToken);
    const message = await client.messages.create({
      body: body,
      from: twilioFrom,
      to: to
    });

    return { success: true, sid: message.sid };
  } catch (err) {
    console.error("Twilio SMS Server Action Error:", err);
    return { success: false, error: err.message || 'Unknown Twilio error' };
  }
}

export async function getTwilioStatus() {
  await verifyAdminSession();
  return {
    sidConfigured: !!process.env.TWILIO_ACCOUNT_SID,
    tokenConfigured: !!process.env.TWILIO_AUTH_TOKEN,
    fromConfigured: !!process.env.TWILIO_FROM_NUMBER
  };
}

export async function sendDrivePasscodesSMS({ activeDriveId, twilioConfig, origin }) {
  try {
    await verifyAdminSession();

    const driveDoc = await db.collection('drives').doc(activeDriveId).get();
    if (!driveDoc.exists) {
      return { success: false, error: 'Drive not found.' };
    }
    const driveData = driveDoc.data();

    const teachersSnap = await db.collection('teachers')
      .where('assignedDrive', '==', activeDriveId)
      .get();

    if (teachersSnap.empty) {
      return { success: true, count: 0, logs: [] };
    }

    const { sid, token, from } = twilioConfig;
    const isPlaceholder = (val) => !val || val === '[AuthToken]' || val === '[AccountSid]' || val === '[TwilioFrom]';

    const twilioSid = !isPlaceholder(sid) ? sid : (process.env.TWILIO_ACCOUNT_SID);
    const twilioToken = !isPlaceholder(token) ? token : process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = !isPlaceholder(from) ? from : (process.env.TWILIO_FROM_NUMBER);

    if (!twilioSid || !twilioToken || twilioToken === '[AuthToken]') {
      return { success: false, error: 'Twilio Account SID or Auth Token is missing.' };
    }

    const client = twilio(twilioSid, twilioToken);
    let sentCount = 0;
    const logs = [];

    for (const doc of teachersSnap.docs) {
      const teacherData = doc.data();
      const teacherId = doc.id;
      if (!teacherData.assignedHall || teacherData.assignedHall.trim() === '') {
        continue;
      }
      if (!teacherData.phone) {
        logs.push(`Failed for ${teacherData.name}: Phone number is missing [X]`);
        continue;
      }

      const passcodeDoc = await db.collection('teacherPasscodes').doc(teacherId).get();
      const passcode = passcodeDoc.exists ? passcodeDoc.data().passcode : '';

      if (!passcode) {
        logs.push(`Failed for ${teacherData.name}: Passcode not found [X]`);
        continue;
      }

      try {
        const messageBody = `Hello ${teacherData.name}, you are assigned to ${teacherData.assignedHall} for the ${driveData.company} placement drive. Your login passcode is ${passcode}. Login at: ${origin || 'http://localhost:3000'}/login?role=invigilator`;

        await client.messages.create({
          body: messageBody,
          from: twilioFrom,
          to: teacherData.phone
        });

        logs.push(`SMS dispatched to: ${teacherData.phone} [✓]`);
        sentCount++;
      } catch (err) {
        logs.push(`Failed for ${teacherData.phone || teacherData.name}: ${err.message} [X]`);
      }
    }

    return { success: true, count: sentCount, logs };
  } catch (err) {
    console.error("Bulk Twilio SMS Server Action Error:", err);
    return { success: false, error: err.message || 'Unknown error' };
  }
}

export async function getDrivesAction() {
  await verifyAdminSession();
  const snapshot = await db.collection('drives').get();
  const registry = {};
  snapshot.forEach(doc => {
    registry[doc.id] = doc.data();
  });
  return registry;
}

export async function getDriveAction(driveId) {
  const doc = await db.collection('drives').doc(driveId).get();
  if (!doc.exists) return null;
  return doc.data();
}

export async function saveDriveAction(driveId, driveData) {
  await verifyAdminSession();
  await db.collection('drives').doc(driveId).set(driveData);
  return { success: true };
}

export async function updateDriveAction(driveId, updatedDriveData) {
  await verifyAdminSession();
  await db.collection('drives').doc(driveId).update(updatedDriveData);
  return { success: true };
}

export async function deleteDriveAction(driveId) {
  await verifyAdminSession();

  await db.collection('drives').doc(driveId).delete();

  const teachersSnap = await db.collection('teachers').where('assignedDrive', '==', driveId).get();
  if (!teachersSnap.empty) {
    const teacherBatch = db.batch();
    teachersSnap.forEach(doc => {
      const teacherId = doc.id;
      teacherBatch.delete(db.collection('teachers').doc(teacherId));
      teacherBatch.delete(db.collection('teacherPasscodes').doc(teacherId));
    });
    await teacherBatch.commit();
  }

  const attendanceSnap = await db.collection('attendance').where('driveId', '==', driveId).get();
  if (!attendanceSnap.empty) {
    const attendanceBatch = db.batch();
    attendanceSnap.forEach(doc => {
      attendanceBatch.delete(db.collection('attendance').doc(doc.id));
    });
    await attendanceBatch.commit();
  }

  return { success: true };
}

export async function closeDriveAction(activeDriveId) {
  await verifyAdminSession();
  await db.collection('drives').doc(activeDriveId).update({ status: 'closed' });

  const teachersSnap = await db.collection('teachers')
    .where('assignedDrive', '==', activeDriveId)
    .get();

  if (!teachersSnap.empty) {
    const batch = db.batch();
    teachersSnap.forEach(doc => {
      batch.update(db.collection('teachers').doc(doc.id), { active: false });
    });
    await batch.commit();
  }
  return { success: true };
}

export async function getTeachersForDriveAction(driveId) {
  await verifyAdminSession();
  const snapshot = await db.collection('teachers').where('assignedDrive', '==', driveId).get();
  const list = [];
  snapshot.forEach(doc => {
    list.push({ id: doc.id, ...doc.data() });
  });
  return list;
}

export async function getTeacherAction(teacherId) {
  const doc = await db.collection('teachers').doc(teacherId).get();
  if (!doc.exists) return null;
  return doc.data();
}

export async function saveTeachersAndPasscodesAction(teachersData, driveId) {
  await verifyAdminSession();
  if (teachersData && teachersData.length > 0) {
    const batch = db.batch();

    for (const t of teachersData) {
      const teacherId = t.id;
      const teacherRef = db.collection('teachers').doc(teacherId);
      batch.set(teacherRef, {
        name: t.name,
        email: t.email || '',
        phone: t.phone,
        assignedDrive: driveId,
        assignedHall: t.assignedHall,
        active: true
      });

      const passcodeRef = db.collection('teacherPasscodes').doc(teacherId);
      batch.set(passcodeRef, {
        passcode: t.passcode
      });
    }

    await batch.commit();
  }
  return { success: true };
}

export async function updateTeacherPresenceAction(teacherId, present) {
  await db.collection('teachers').doc(teacherId).update({ present });
  return { success: true };
}

export async function saveStudentsAction(studentsData) {
  await verifyAdminSession();
  const chunkSize = 400;
  for (let i = 0; i < studentsData.length; i += chunkSize) {
    const chunk = studentsData.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const s of chunk) {
      const studentRef = db.collection('students').doc(s.rollNo.replace(/\//g, '_'));
      batch.set(studentRef, {
        rollNo: s.rollNo,
        name: s.name,
        email: s.email,
        department: s.department,
        qrSalt: s.qrSalt,
        qrHash: s.qrHash
      });
    }
    await batch.commit();
  }
  return { success: true };
}

export async function resetAttendanceAction(driveId) {
  await verifyAdminSession();
  const snapshot = await db.collection('attendance').where('driveId', '==', driveId).get();
  const chunkSize = 400;
  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const doc of chunk) {
      batch.delete(db.collection('attendance').doc(doc.id));
    }
    await batch.commit();
  }
  return { success: true };
}

export async function getStudentsForDriveAction(rolls) {
  await verifyAdminSession();
  if (!rolls || rolls.length === 0) return [];
  const studentRefs = rolls.map(r => db.collection('students').doc(r.replace(/\//g, '_')));
  const docs = await db.getAll(...studentRefs);
  const list = docs.map(doc => {
    if (doc.exists) {
      const data = doc.data();
      return { rollNo: data.rollNo || doc.id, ...data };
    }
    return null;
  }).filter(Boolean);
  return list;
}

export async function getTeachersWithPasscodesAction(driveId) {
  await verifyAdminSession();
  const teachersSnap = await db.collection('teachers')
    .where('assignedDrive', '==', driveId)
    .get();

  const list = [];
  for (const doc of teachersSnap.docs) {
    const teacherId = doc.id;
    const passcodeDoc = await db.collection('teacherPasscodes').doc(teacherId).get();
    const passcode = passcodeDoc.exists ? passcodeDoc.data().passcode : '—';
    list.push({
      id: teacherId,
      ...doc.data(),
      passcode
    });
  }
  return list;
}

export async function getRMAccessToken(credentials) {
  try {
    await verifyAdminSession();
    const email = credentials?.email || process.env.RM_API_EMAIL;
    const password = credentials?.password || process.env.RM_API_PASSWORD;

    if (!email || !password) {
      return { success: false, error: 'Credentials missing. Please click the red "RM Login" button at the top and enter your credentials.' };
    }

    const res = await fetch('https://rm.dcedtu.in/api/rm/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Login failed: ${res.status} - ${errText}` };
    }

    const data = await res.json();
    const token = data.accessToken || data.access_token || (data.data && (data.data.accessToken || data.data.access_token));
    if (!token) {
      return { success: false, error: 'Access token not found in response payload' };
    }

    return { success: true, token };
  } catch (err) {
    console.error("getRMAccessToken error:", err);
    return { success: false, error: err.message || 'Unknown network error' };
  }
}


export async function sendRMEmail({
  accessToken,
  toEmail,
  subject,
  html,
  text,
}) {
  try {
    await verifyAdminSession();

    const bodyPayload = {
      toAddresses: [toEmail],
      subject: subject,
      textBody: text || "Placement drive notification",
    };

    console.log("[sendRMEmail] Sending to:", toEmail, "| payload size:", JSON.stringify(bodyPayload).length, "bytes");

    const res = await fetch(
      "https://rm.dcedtu.in/api/rm/external/email",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
      }
    );

    const resText = await res.text();

    if (!res.ok) {
      return {
        success: false,
        error: `Email send failed: ${res.status} - ${resText}`,
      };
    }

    return {
      success: true,
    };
  } catch (err) {
    console.error("sendRMEmail error:", err);

    return {
      success: false,
      error: err?.message || "Unknown network error",
    };
  }
}
