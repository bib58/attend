'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { db, handleFirestoreError } from '../lib/firebase';
import { Auth } from '../lib/auth';
import { checkSession } from '../lib/authActions';
import { playSound } from '../lib/utils';
import firebase from '../lib/firebase';
import dynamic from 'next/dynamic';
import { getTeacherAction, getDriveAction, updateTeacherPresenceAction } from '../admin/actions';

function RemarksTextarea({ rollNo, initialValue, onSave, disabled }) {
  const [value, setValue] = useState(initialValue || 'nil');

  useEffect(() => {
    setValue(initialValue || 'nil');
  }, [initialValue]);

  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== (initialValue || 'nil')) {
          onSave(rollNo, value);
        }
      }}
      disabled={disabled}
      placeholder="Add remarks..."
      style={{
        width: '100%',
        minWidth: '130px',
        height: '36px',
        minHeight: '36px',
        fontSize: '0.8rem',
        padding: '4px 8px',
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
        borderRadius: '6px',
        color: '#fff',
        resize: 'vertical',
        outline: 'none',
        transition: 'border-color 0.2s',
      }}
      onFocus={(e) => {
        e.target.style.borderColor = 'var(--primary, #3b82f6)';
      }}
      onBlurCapture={(e) => {
        e.target.style.borderColor = 'var(--border-color, rgba(255,255,255,0.1))';
      }}
    />
  );
}

function TeacherConsoleComponent() {
  const router = useRouter();

  const [teacherId, setTeacherId] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [assignedHall, setAssignedHall] = useState('Hall 1');
  const [activeDriveId, setActiveDriveId] = useState('');
  const [driveMetadata, setDriveMetadata] = useState(null);

  const [isOnline] = useState(!!db);
  const [presentCount, setPresentCount] = useState(0);
  const [recentLogs, setRecentLogs] = useState([]);
  const [isDriveClosed, setIsDriveClosed] = useState(false);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const scannerInstance = useRef(null);
  const scannerRef = useRef(null);

  const [flash, setFlash] = useState({
    active: false,
    title: '',
    desc: '',
    subdesc: ''
  });
  const flashTimeoutRef = useRef(null);

  const [toasts, setToasts] = useState([]);

  const addToast = (type, message, description = '') => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, type, message, description }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  };

  const toast = {
    success: (msg, desc = '') => addToast('success', msg, desc),
    error: (msg, desc = '') => addToast('error', msg, desc),
    warning: (msg, desc = '') => addToast('warning', msg, desc)
  };

  const [manualRollNo, setManualRollNo] = useState('');
  const [manualStudent, setManualStudent] = useState(null);
  const [manualError, setManualError] = useState('');

  const [isVerifyingSession, setIsVerifyingSession] = useState(true);

  useEffect(() => {
    const verifySession = async () => {
      if (!Auth.isTeacherAuthenticated()) {
        await Auth.logout(router, '/login?role=invigilator');
      } else {
        setIsVerifyingSession(false);
      }
    };
    verifySession();

    const tId = sessionStorage.getItem('teacherId') || '';
    const tName = sessionStorage.getItem('teacherName') || '';
    const hall = sessionStorage.getItem('teacherHall') || 'Hall 1';
    const driveId = sessionStorage.getItem('teacherDriveId') || '';

    setTeacherId(tId);
    setTeacherName(tName);
    setAssignedHall(hall);
    setActiveDriveId(driveId);
  }, [router]);

  useEffect(() => {
    if (isVerifyingSession) return;
    if (!teacherId) return;

    const verifyTeacher = async () => {
      try {
        const teacherData = await getTeacherAction(teacherId);
        if (!teacherData || !teacherData.active) {
          await Auth.logout(router, '/login?role=invigilator');
          alert("Your invigilator session is invalid or has been deactivated.");
        } else {
          if (!teacherData.present) {
            await updateTeacherPresenceAction(teacherId, true).catch(err => console.error("Error setting teacher presence:", err));
          }

          if (teacherData.assignedHall && teacherData.assignedHall !== assignedHall) {
            setAssignedHall(teacherData.assignedHall);
            sessionStorage.setItem('teacherHall', teacherData.assignedHall);
          }
          if (teacherData.assignedDrive && teacherData.assignedDrive !== activeDriveId) {
            setActiveDriveId(teacherData.assignedDrive);
            sessionStorage.setItem('teacherDriveId', teacherData.assignedDrive);
          }
        }
      } catch (err) {
        console.error("Error verifying teacher session:", err);
      }
    };

    verifyTeacher();
  }, [teacherId, router, assignedHall, activeDriveId, isVerifyingSession]);

  useEffect(() => {
    if (isVerifyingSession) return;
    if (!activeDriveId) return;

    const fetchDrive = async () => {
      try {
        const data = await getDriveAction(activeDriveId);
        if (data) {
          setDriveMetadata(data);

          if (data.status === 'closed') {
            setIsDriveClosed(true);
          }

          if (data.halls && data.halls.length > 0) {
            const halls = data.halls.map(h => (typeof h === 'string' ? h : h.name));

            if (!halls.includes(assignedHall)) {
              setAssignedHall(halls[0]);
              sessionStorage.setItem('teacherHall', halls[0]);
            }
          }
        }
      } catch (err) {
        console.error("Failed to read drive details:", err);
      }
    };

    fetchDrive();
  }, [activeDriveId, assignedHall, isVerifyingSession]);

  useEffect(() => {
    if (isVerifyingSession) return;
    if (!activeDriveId || !db) {
      console.log("DEBUG: Listener skipped. activeDriveId:", activeDriveId, "db initialized:", !!db);
      return;
    }

    console.log("DEBUG: Subscribing to attendance listener. activeDriveId:", activeDriveId, "assignedHall:", assignedHall);

    const unsubscribe = db.collection('attendance')
      .where('driveId', '==', activeDriveId)
      .where('hall', '==', assignedHall)
      .onSnapshot((snapshot) => {
        console.log("DEBUG: Received attendance snapshot. Document count:", snapshot.size);
        const allScans = [];

        snapshot.forEach(doc => {
          const s = doc.data();
          allScans.push(s);
        });

        setPresentCount(allScans.length);

        allScans.sort((a, b) => {
          const tA = a.scannedAt && typeof a.scannedAt.toMillis === 'function' ? a.scannedAt.toMillis() : 0;
          const tB = b.scannedAt && typeof b.scannedAt.toMillis === 'function' ? b.scannedAt.toMillis() : 0;
          return tB - tA;
        });
        setRecentLogs(allScans);
      }, (error) => {
        console.error("Attendance log stream failed:", error);
        handleFirestoreError(error);
      });

    return () => unsubscribe();
  }, [activeDriveId, assignedHall, isVerifyingSession]);

  const triggerFlashFeedback = (variant, title, desc, subdesc) => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);

    setFlash({
      active: true,
      variant,
      title,
      desc,
      subdesc
    });

    flashTimeoutRef.current = setTimeout(() => {
      setFlash(prev => ({ ...prev, active: false }));
    }, 2500);
  };

  const startScanner = async () => {
    if (!activeDriveId) {
      alert("No active placement drive is assigned to your account yet.");
      return;
    }
    if (isDriveClosed) {
      alert("This placement drive has been finalized and closed. Access is locked.");
      return;
    }

    if (teacherId) {
      updateTeacherPresenceAction(teacherId, true).catch(err => console.error("Error setting teacher presence:", err));
    }

    setIsScannerOpen(true);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');

      setTimeout(() => {
        if (scannerInstance.current || !scannerRef.current) return;

        const qrScanner = new Html5Qrcode(scannerRef.current);
        scannerInstance.current = qrScanner;

        const config = {
          fps: 10,
          qrbox: (width, height) => {
            const minDim = Math.min(width, height);
            return {
              width: Math.floor(minDim * 0.7),
              height: Math.floor(minDim * 0.7)
            };
          },
          aspectRatio: 1.0
        };

        qrScanner.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            handleQrScanSuccess(decodedText);
          },
          () => {
          }
        )
          .catch((err) => {
            console.error("Failed to start camera:", err);
            alert(`Camera access error: ${err.message || err}. Please check permissions.`);
            setIsScannerOpen(false);
            scannerInstance.current = null;
          });
      }, 150);
    } catch (err) {
      console.error(err);
      alert("Failed to load camera scanner engine.");
      setIsScannerOpen(false);
    }
  };

  const stopScanner = async () => {
    if (scannerInstance.current) {
      try {
        await scannerInstance.current.stop();
      } catch (err) {
        console.error("Failed to stop scanner library:", err);
      }
      scannerInstance.current = null;
    }
    setIsScannerOpen(false);
  };

  const handleQrScanSuccess = async (decodedText) => {
    console.log("DEBUG: handleQrScanSuccess called with decodedText:", decodedText);
    await stopScanner();

    if (!activeDriveId) {
      playSound('error');
      toast.error('No Active Drive', 'Cannot record attendance without an active drive.');
      return;
    }

    let roll = '';
    let name = '';
    let salt = '';

    try {
      const parsed = JSON.parse(decodedText);
      roll = (parsed.roll || parsed.rollNo || '').trim().toUpperCase();
      name = (parsed.name || '').trim();
      salt = (parsed.salt || '').trim();
      console.log("DEBUG: Parsed QR payload - roll:", roll, "name:", name, "salt:", salt);
    } catch {
      playSound('error');
      toast.error('Invalid QR Code', 'Failed to parse QR JSON Payload.');
      return;
    }

    if (!roll) {
      playSound('error');
      toast.error('Invalid QR Code', 'Roll number is missing from payload.');
      return;
    }

    try {
      const studentDocRef = db.collection('students').doc(roll.replace(/\//g, '_'));
      const studentDoc = await studentDocRef.get();

      if (!studentDoc.exists) {
        throw new Error(`Roll No "${roll}" is not registered in this system.`);
      }

      const dbStudent = studentDoc.data();
      console.log("DEBUG: Student doc data found in db:", dbStudent);

      const dbNameLower = (dbStudent.name || '').toLowerCase();
      const scNameLower = name.toLowerCase();
      const dbSalt = dbStudent.qrSalt || '';

      if (dbSalt && dbSalt !== salt) {
        throw new Error("QR Security Code mismatch. Verification failed.");
      }
      if (dbNameLower && dbNameLower !== scNameLower) {
        if (!dbNameLower.includes(scNameLower) && !scNameLower.includes(dbNameLower)) {
          throw new Error(`Name mismatch. Registered: "${dbStudent.name}", Scanned: "${name}".`);
        }
      }

      if (driveMetadata && driveMetadata.registeredRolls && driveMetadata.halls) {
        const studentIndex = driveMetadata.registeredRolls.findIndex(
          r => (r || '').trim().toUpperCase() === roll
        );
        if (studentIndex !== -1) {
          let currentIdx = 0;
          let calculatedHall = 'Unassigned';
          for (const hall of driveMetadata.halls) {
            const capacity = typeof hall === 'string' ? 0 : (parseInt(hall.capacity, 10) || 0);
            const hallName = typeof hall === 'string' ? hall : hall.name;
            if (studentIndex >= currentIdx && studentIndex < currentIdx + capacity) {
              calculatedHall = hallName;
              break;
            }
            currentIdx += capacity;
          }
          if (calculatedHall !== 'Unassigned' && calculatedHall !== assignedHall) {
            throw new Error(`Student is assigned to ${calculatedHall}. Cannot scan in ${assignedHall}.`);
          }
        }
      }

      const attendanceDocId = `${activeDriveId}_${roll.replace(/\//g, '_')}`;
      const attendanceDocRef = db.collection('attendance').doc(attendanceDocId);
      const attendanceDoc = await attendanceDocRef.get();

      if (attendanceDoc.exists) {
        const record = attendanceDoc.data();
        playSound('warning');
        toast.error('student alredy scanned', `${dbStudent.name || name} (Scanned in: ${record.hall || 'Another Hall'})`);
        return;
      }

      const timestamp = firebase.firestore.Timestamp.now();
      const attendanceRecord = {
        driveId: activeDriveId,
        rollNo: roll,
        studentName: dbStudent.name || name,
        teacherId: teacherId || 'unknown_teacher',
        hall: assignedHall || 'Unassigned Hall',
        scannedAt: timestamp,
        status: 'Present',
        remarks: 'nil'
      };

      console.log("DEBUG: Saving attendance record to Firestore:", attendanceRecord);
      await attendanceDocRef.set(attendanceRecord);
      console.log("DEBUG: Attendance record saved successfully.");
      playSound('success');
      toast.success('student addedd successfuly', `${dbStudent.name || name} (${roll})`);

    } catch (error) {
      playSound('error');
      toast.error('Invalid QR Code', error.message);
    }
  };

  const handleManualSearch = async () => {
    if (!manualRollNo.trim()) return;
    setManualError('');
    setManualStudent(null);

    const roll = manualRollNo.trim().toUpperCase();
    console.log("DEBUG: handleManualSearch called for roll:", roll);

    if (driveMetadata && driveMetadata.registeredRolls) {
      const isRegistered = driveMetadata.registeredRolls.some(
        r => (r || '').trim().toUpperCase() === roll
      );
      if (!isRegistered) {
        console.log("DEBUG: Student roll", roll, "is not registered in driveMetadata.registeredRolls:", driveMetadata.registeredRolls);
        setManualError(`Drive has been closed or the student not present`);
        return;
      }
    }

    try {
      const studentDocRef = db.collection('students').doc(roll.replace(/\//g, '_'));
      const studentDoc = await studentDocRef.get();

      if (!studentDoc.exists) {
        console.log("DEBUG: Student doc profile not found in Firestore for doc ID:", roll.replace(/\//g, '_'));
        setManualError(`Roll No "${roll}" profile was not found in the database.`);
        return;
      }

      const sData = studentDoc.data();
      console.log("DEBUG: Student doc found for manual entry:", sData);
      setManualStudent(sData);
    } catch (err) {
      console.error("Manual search error:", err);
      setManualError(err.message || 'Error occurred while looking up student profile.');
    }
  };

  const handleConfirmManualAttendance = async () => {
    if (!manualStudent) return;
    setManualError('');

    if (!activeDriveId) {
      setManualError('No active placement drive is assigned to record attendance.');
      return;
    }

    const roll = manualStudent.rollNo;
    const name = manualStudent.name;
    console.log("DEBUG: handleConfirmManualAttendance called. roll:", roll, "name:", name, "assignedHall:", assignedHall);

    if (driveMetadata && driveMetadata.registeredRolls && driveMetadata.halls) {
      const studentIndex = driveMetadata.registeredRolls.findIndex(
        r => (r || '').trim().toUpperCase() === roll.toUpperCase()
      );
      if (studentIndex !== -1) {
        let currentIdx = 0;
        let calculatedHall = 'Unassigned';
        for (const hall of driveMetadata.halls) {
          const capacity = typeof hall === 'string' ? 0 : (parseInt(hall.capacity, 10) || 0);
          const hallName = typeof hall === 'string' ? hall : hall.name;
          if (studentIndex >= currentIdx && studentIndex < currentIdx + capacity) {
            calculatedHall = hallName;
            break;
          }
          currentIdx += capacity;
        }
        if (calculatedHall !== 'Unassigned' && calculatedHall !== assignedHall) {
          setManualError(`Student is assigned to ${calculatedHall}. Cannot scan in ${assignedHall}.`);
          return;
        }
      }
    }

    try {
      const attendanceDocId = `${activeDriveId}_${roll.replace(/\//g, '_')}`;
      const attendanceDocRef = db.collection('attendance').doc(attendanceDocId);
      const attendanceDoc = await attendanceDocRef.get();

      if (attendanceDoc.exists) {
        const record = attendanceDoc.data();
        playSound('warning');
        toast.error('student alredy scanned', `${name} (Scanned in: ${record.hall || 'Another Hall'})`);
        setManualStudent(null);
        setManualRollNo('');
        return;
      }

      const timestamp = firebase.firestore.Timestamp.now();
      const attendanceRecord = {
        driveId: activeDriveId,
        rollNo: roll,
        studentName: name,
        teacherId: teacherId || 'unknown_teacher',
        hall: assignedHall || 'Unassigned Hall',
        scannedAt: timestamp,
        status: 'Present',
        isManualBackup: true,
        remarks: 'nil'
      };

      console.log("DEBUG: Saving manual attendance record to Firestore:", attendanceRecord);
      await attendanceDocRef.set(attendanceRecord);
      console.log("DEBUG: Manual attendance record saved successfully.");
      playSound('success');
      toast.success('student addedd successfuly', `${name} (${roll})`);

      setManualStudent(null);
      setManualRollNo('');
    } catch (error) {
      console.error("Manual confirmation error:", error);
      playSound('error');
      setManualError(error.message || 'Error recording manual attendance.');
    }
  };

  const handleUpdateRemarks = async (rollNo, remarksVal) => {
    if (!activeDriveId || !db) return;
    try {
      const attendanceDocId = `${activeDriveId}_${rollNo.replace(/\//g, '_')}`;
      await db.collection('attendance').doc(attendanceDocId).update({
        remarks: remarksVal
      });
      toast.success('Remarks updated', `Saved for student ${rollNo}`);
    } catch (err) {
      console.error("Failed to update remarks:", err);
      toast.error('Failed to update remarks', err.message);
    }
  };

  const handleLogout = async () => {
    await Auth.logout(router, '/login?role=invigilator');
  };

  if (isVerifyingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0f14] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 animate-pulse">Verifying session security...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header>
        <div className="brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <h1>Placement Attend <span style={{ fontWeight: 400, fontSize: '0.85rem', color: 'var(--success)' }}>Invigilator</span></h1>
        </div>

        <div className="header-actions">
          <div
            id="cloud-sync-pill"
            className="active-drive-pill"
            style={{
              backgroundColor: isOnline ? 'var(--success-bg)' : 'var(--error-bg)',
              borderColor: isOnline ? 'var(--success)' : 'var(--error)',
              color: isOnline ? 'var(--success)' : 'var(--error)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isOnline ? 'var(--success)' : 'var(--error)' }}></span>
            {isOnline ? 'Cloud Connected' : 'Offline Mode'}
          </div>
          <div id="active-drive-display" className="active-drive-pill">
            {driveMetadata ? driveMetadata.company : 'No Active Drive'}
          </div>

          <button onClick={handleLogout} id="btn-logout" className="btn-theme-toggle" title="Log Out" aria-label="Log Out" style={{ color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.25)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '800px', width: '100%', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="panel">
          <div className="teacher-details">
            <div>
              <span className="teacher-name" id="teacher-name-display">{teacherName || 'Prof. Invigilator'}</span>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem', marginBottom: '1rem' }} id="teacher-id-display">ID: {teacherId || '—'}</div>
            </div>
            <div
              id="teacher-hall-display"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                padding: '0.45rem 1rem',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: 700,
                color: 'var(--success)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {assignedHall || 'Hall Unassigned'}
            </div>
          </div>
          <div className="counter-circle" id="present-counter-border" style={{ width: '130px', height: '130px', borderRadius: '50%', border: '6px solid var(--primary)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', margin: '1rem auto 1.5rem auto', boxShadow: '0 0 20px rgba(59, 130, 246, 0.2)' }}>
            <span className="counter-value" style={{ fontSize: '2.25rem', fontWeight: 800, color: 'white', lineHeight: 1 }}>{presentCount}</span>
            <span className="counter-desc" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginTop: '0.25rem' }}>Present</span>
          </div>

          <button onClick={startScanner} id="btn-trigger-scan" className="btn-scan-trigger" disabled={isDriveClosed || !activeDriveId} style={{ width: '100%', height: '60px', borderRadius: '14px', border: 'none', cursor: (isDriveClosed || !activeDriveId) ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #6366f1, #3b82f6)', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.4)', opacity: (isDriveClosed || !activeDriveId) ? '0.5' : '1' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z" />
            </svg>
            {!activeDriveId ? 'No Active Drive Assigned' : isDriveClosed ? 'Drive Closed' : 'Scan Candidate QR'}
          </button>
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', textAlign: 'left' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
              </svg>
              Manual Backup Entry
            </h4>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Enter Roll No (e.g. 20CS101)"
                value={manualRollNo}
                onChange={(e) => setManualRollNo(e.target.value)}
                className="form-control"
                style={{ flexGrow: 1, height: '42px', fontSize: '0.9rem' }}
                disabled={isDriveClosed}
              />
              <button
                onClick={handleManualSearch}
                className="btn btn-primary"
                style={{ minHeight: 'unset', height: '42px', padding: '0 1.25rem', fontSize: '0.85rem' }}
                disabled={isDriveClosed || !manualRollNo.trim()}
              >
                Verify
              </button>
            </div>

            {manualStudent && (
              <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '12px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', animation: 'fadeIn 0.3s ease' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Candidate Profile Found</div>
                <div style={{ fontWeight: 700, color: 'white', marginTop: '0.25rem', fontSize: '1.05rem' }}>{manualStudent.name}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Roll No: <span style={{ color: 'white', fontWeight: 600 }}>{manualStudent.rollNo}</span> &bull; Dept: <span style={{ color: 'white', fontWeight: 600 }}>{manualStudent.department}</span>
                </div>
                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleConfirmManualAttendance}
                    className="btn btn-success"
                    style={{ flexGrow: 1, minHeight: 'unset', height: '36px', fontSize: '0.85rem', padding: 0 }}
                  >
                    Confirm Presence
                  </button>
                  <button
                    onClick={() => { setManualStudent(null); setManualRollNo(''); }}
                    className="btn btn-secondary"
                    style={{ minHeight: 'unset', height: '36px', fontSize: '0.85rem', padding: '0 0.75rem' }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {manualError && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--error)', backgroundColor: 'var(--error-bg)', border: '1px solid var(--error)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                {manualError}
              </div>
            )}
          </div>
        </div>
      </main>
      <div className="panel" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', width: '80%', margin: "0 auto" }}>
        <div className="scan-list-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white', fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>
          <span>Recent Attendance Registry</span>
        </div>
        <div className="table-container" style={{ flexGrow: 1, maxHeight: '320px', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Roll No</th>
                <th>Name</th>
                <th>Hall</th>
                <th>Time</th>
                <th>Remarks</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No students scanned yet. Click Scan to start.</td>
                </tr>
              ) : (
                recentLogs.map((s, idx) => {
                  const isMyHall = s.hall === assignedHall;
                  const highlightStyle = isMyHall ? { fontWeight: 700, color: 'white' } : { color: 'var(--text-muted)' };
                  const timeStr = s.scannedAt
                    ? (typeof s.scannedAt.toDate === 'function'
                      ? s.scannedAt.toDate().toLocaleTimeString()
                      : new Date(s.scannedAt).toLocaleTimeString())
                    : '—';
                  return (
                    <tr key={idx} style={highlightStyle}>
                      <td style={{ fontWeight: 700 }}>{s.rollNo}</td>
                      <td>{s.studentName}</td>
                      <td>
                        <span className={`status-badge ${isMyHall ? 'status-present' : 'status-unmarked'}`}>
                          {s.hall}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>{timeStr}</td>
                      <td>
                        {isMyHall ? (
                          <RemarksTextarea
                            rollNo={s.rollNo}
                            initialValue={s.remarks}
                            onSave={handleUpdateRemarks}
                            disabled={isDriveClosed}
                          />
                        ) : (
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {s.remarks || 'nil'}
                          </span>
                        )}
                      </td>
                      <td style={{ width: '120px' }}>
                        {isMyHall ? (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              onClick={async () => {
                                if (!confirm(`Remove attendance for ${s.studentName} (${s.rollNo})? This cannot be undone.`)) return;
                                try {
                                  const attendanceDocId = `${activeDriveId}_${s.rollNo.replace(/\//g, '_')}`;
                                  await db.collection('attendance').doc(attendanceDocId).delete();
                                  playSound('success');
                                  toast.success('Entry removed', `${s.studentName} (${s.rollNo})`);
                                } catch (err) {
                                  console.error('Failed to remove attendance:', err);
                                  playSound('error');
                                  toast.error('Remove failed', err.message || 'Could not delete entry');
                                }
                              }}
                              style={{ fontSize: '0.82rem', padding: '0.4rem 0.6rem', backgroundColor: 'var(--error-bg)', color: 'var(--error)', border: '1px solid var(--error)', borderRadius: '6px', cursor: isDriveClosed ? 'not-allowed' : 'pointer', cursor: 'pointer' }}
                              disabled={isDriveClosed}
                              title="Remove this attendance entry"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {isScannerOpen && (
        <div className="scanner-popup-overlay" style={{ display: 'flex', position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.95)', zIndex: 2000, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '1.5rem' }}>
          <div className="scanner-header" style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'white' }}>
            <h3 style={{ fontSize: '1.35rem', margin: '0 0 0.5rem 0' }}>Align Student QR Code</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Hold the pass inside the square outline below</p>
          </div>

          <div className="scanner-viewfinder" style={{ width: '100%', maxWidth: '440px', aspectRatio: 1.0, border: '3px solid rgba(255, 255, 255, 0.2)', borderRadius: '20px', overflow: 'hidden', backgroundColor: '#000', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <div ref={scannerRef} style={{ width: '100%', height: '100%' }}></div>
          </div>

          <div className="scanner-footer" style={{ marginTop: '1.5rem', width: '100%', maxWidth: '440px' }}>
            <button onClick={stopScanner} className="btn btn-secondary btn-block" style={{ height: '52px', fontSize: '1rem', borderColor: 'rgba(255,255,255,0.2)', color: 'white' }}>
              Cancel Scan
            </button>
          </div>
        </div>
      )}
      <div className="toast-container" id="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item toast-${t.type}`} role="alert">
            <div className="toast-icon">
              {t.type === 'success' ? (
                <svg className="toast-icon-success" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : t.type === 'error' ? (
                <svg className="toast-icon-error" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" x2="12" y1="8" y2="12" />
                  <line x1="12" x2="12.01" y1="16" y2="16" />
                </svg>
              ) : (
                <svg className="toast-icon-warning" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" x2="12" y1="9" y2="13" />
                  <line x1="12" x2="12.01" y1="17" y2="17" />
                </svg>
              )}
            </div>
            <div className="toast-content">
              <div className="toast-message">{t.message}</div>
              {t.description && <div className="toast-description">{t.description}</div>}
            </div>
            <button
              className="toast-close"
              onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
              aria-label="Close notification"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" x2="6" y1="6" y2="18" />
                <line x1="6" x2="18" y1="6" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const TeacherConsole = dynamic(() => Promise.resolve(TeacherConsoleComponent), {
  ssr: false,
});

export default TeacherConsole;
