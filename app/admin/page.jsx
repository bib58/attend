'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db, handleFirestoreError } from '../lib/firebase';
import { Auth } from '../lib/auth';
import { checkSession } from '../lib/authActions';
import { generatePasscode, playSound } from '../lib/utils';
import { parseExcelFile, parseStudentExcel, parseTeacherExcel } from '../lib/excel';
import {
  sendTwilioSMS,
  getTwilioStatus,
  sendDrivePasscodesSMS,
  getDrivesAction,
  saveDriveAction,
  updateDriveAction,
  deleteDriveAction,
  closeDriveAction,
  getTeachersForDriveAction,
  saveTeachersAndPasscodesAction,
  saveStudentsAction,
  resetAttendanceAction,
  getStudentsForDriveAction,
  getTeachersWithPasscodesAction,
  getRMAccessToken,
  sendRMEmail
} from './actions';
import dynamic from 'next/dynamic';

function AdminConsoleComponent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('setup-tab');
  const [isVerifyingSession, setIsVerifyingSession] = useState(true);

  const [emailConfig, setEmailConfig] = useState({
    senderEmail: '',
    senderName: '',
    apiKey: ''
  });

  const [twilioConfig, setTwilioConfig] = useState({
    sid: '',
    token: '',
    from: ''
  });

  const [twilioEnvStatus, setTwilioEnvStatus] = useState({
    sidConfigured: false,
    tokenConfigured: false,
    fromConfigured: false
  });

  const [activeDriveId, setActiveDriveId] = useState('');
  const [drivesRegistry, setDrivesRegistry] = useState({});
  const [studentsList, setStudentsList] = useState([]);
  const [teachersList, setTeachersList] = useState([]);
  const [attendanceList, setAttendanceList] = useState([]);
  const [companyName, setCompanyName] = useState('');
  const [driveDate, setDriveDate] = useState('');
  const [hallsConfig, setHallsConfig] = useState([{ name: 'Hall 1', capacity: '' }]);
  const [studentCSVFile, setStudentCSVFile] = useState(null);
  const [studentCSVFileName, setStudentCSVFileName] = useState('Choose Student Excel');
  const [teacherCSVFile, setTeacherCSVFile] = useState(null);
  const [teacherCSVFileName, setTeacherCSVFileName] = useState('Choose Teacher Excel');
  const [parsedUploadedTeachers, setParsedUploadedTeachers] = useState([]);
  const [activeRegistryFilter, setActiveRegistryFilter] = useState('upcoming');
  const [allotmentSearchQuery, setAllotmentSearchQuery] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingDriveId, setEditingDriveId] = useState(null);
  const [setupAlert, setSetupAlert] = useState({ type: '', msg: '' });
  const [emailAlert, setEmailAlert] = useState({ type: '', msg: '' });
  const [twilioAlert, setTwilioAlert] = useState({ type: '', msg: '' });
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrSearchQuery, setQrSearchQuery] = useState('');
  const [isDashboardFullScreen, setIsDashboardFullScreen] = useState(false);
  const [isPasscodeModalOpen, setIsPasscodeModalOpen] = useState(false);
  const [teachersWithPasscodes, setTeachersWithPasscodes] = useState([]);
  const [isFetchingPasscodes, setIsFetchingPasscodes] = useState(false);
  const [passcodeSearchQuery, setPasscodeSearchQuery] = useState('');
  const [batchStatus, setBatchStatus] = useState({
    active: false,
    title: '',
    current: 0,
    total: 0,
    logs: []
  });

  const [isRMLoginModalOpen, setIsRMLoginModalOpen] = useState(false);
  const [rmLoginCreds, setRMLoginCreds] = useState({ email: '', password: '' });
  const [rmAccessToken, setRMAccessTokenState] = useState('');

  const handleDashboardFullscreenToggle = () => {
    setIsDashboardFullScreen((prev) => !prev);
  };


  useEffect(() => {
    const verifySession = async () => {
      const session = await checkSession();
      if (!session.authenticated || session.role !== 'admin') {
        await Auth.logout(router, '/login?role=admin');
      } else {
        setIsVerifyingSession(false);
      }
    };
    verifySession();

    const emailCfg = JSON.parse(sessionStorage.getItem('exam_attendance_email_config') || '{}');
    setEmailConfig({
      senderEmail: emailCfg.senderEmail || 'admin@dcedtu.in',
      senderName: emailCfg.senderName || 'Placement Cell',
      apiKey: emailCfg.apiKey || 'random_password_here_123'
    });

    const twilioCfg = JSON.parse(sessionStorage.getItem('exam_attendance_twilio') || '{}');
    setTwilioConfig({
      sid: twilioCfg.sid || '',
      token: twilioCfg.token || '',
      from: twilioCfg.from || ''
    });

    const checkTwilioEnv = async () => {
      try {
        const status = await getTwilioStatus();
        setTwilioEnvStatus(status);
      } catch (err) {
        console.error("Failed to check Twilio environment configuration status:", err);
      }
    };
    checkTwilioEnv();

    const savedActiveDriveId = sessionStorage.getItem('adminActiveDriveId') || '';
    setActiveDriveId(savedActiveDriveId);
  }, [router]);


  useEffect(() => {
    document.body.style.overflow = isDashboardFullScreen ? 'hidden' : '';

    return () => {
      document.body.style.overflow = '';
    };
  }, [isDashboardFullScreen]);


  useEffect(() => {
    if (isVerifyingSession) return;

    let active = true;
    const fetchDrives = async () => {
      try {
        const registry = await getDrivesAction();
        if (!active) return;
        setDrivesRegistry(registry);

        setActiveDriveId(prevActiveDriveId => {
          const savedDriveId = sessionStorage.getItem('adminActiveDriveId');
          if (savedDriveId && registry[savedDriveId]) {
            return savedDriveId;
          } else if (Object.keys(registry).length > 0 && !savedDriveId) {
            const firstId = Object.keys(registry)[0];
            sessionStorage.setItem('adminActiveDriveId', firstId);
            return firstId;
          }
          return prevActiveDriveId;
        });
      } catch (err) {
        console.error("Failed to fetch drives:", err);
      }
    };

    fetchDrives();
    const interval = setInterval(fetchDrives, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isVerifyingSession]);


  useEffect(() => {
    if (isVerifyingSession) return;
    if (!activeDriveId || !db || !drivesRegistry[activeDriveId]) {
      Promise.resolve().then(() => {
        setStudentsList(prev => prev.length === 0 ? prev : []);
        setTeachersList(prev => prev.length === 0 ? prev : []);
        setAttendanceList(prev => prev.length === 0 ? prev : []);
      });
      return;
    }

    const driveInfo = drivesRegistry[activeDriveId];

    const rolls = driveInfo.registeredRolls || [];
    if (rolls.length > 0) {
      getStudentsForDriveAction(rolls)
        .then(list => {
          setStudentsList(list);
        })
        .catch(err => console.error("Error fetching students:", err));
    } else {
      setStudentsList([]);
    }

    const unsubAttendance = db.collection('attendance')
      .where('driveId', '==', activeDriveId)
      .onSnapshot(snapshot => {
        const scans = [];
        snapshot.forEach(doc => {
          scans.push(doc.data());
        });

        scans.sort((a, b) => {
          const tA = a.scannedAt && typeof a.scannedAt.toMillis === 'function' ? a.scannedAt.toMillis() : 0;
          const tB = b.scannedAt && typeof b.scannedAt.toMillis === 'function' ? b.scannedAt.toMillis() : 0;
          return tB - tA;
        });
        setAttendanceList(scans);
      }, err => {
        console.error("Attendance listener failed:", err);
        handleFirestoreError(err);
      });

    let teachersActive = true;
    const fetchTeachers = async () => {
      try {
        const list = await getTeachersForDriveAction(activeDriveId);
        if (!teachersActive) return;
        setTeachersList(list);
      } catch (err) {
        console.error("Teachers fetch failed:", err);
      }
    };
    fetchTeachers();
    const teachersInterval = setInterval(fetchTeachers, 5000);

    return () => {
      unsubAttendance();
      teachersActive = false;
      clearInterval(teachersInterval);
    };

  }, [activeDriveId, drivesRegistry, isVerifyingSession]);


  const loadDrive = (id) => {
    setActiveDriveId(id);
    sessionStorage.setItem('adminActiveDriveId', id);
  };

  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsText(file);
    });
  };


  const handleAddHall = () => {
    setHallsConfig([...hallsConfig, { name: `Hall ${hallsConfig.length + 1}`, capacity: '' }]);
  };

  const handleRemoveHall = (idx) => {
    const updated = hallsConfig.filter((_, i) => i !== idx);
    setHallsConfig(updated);
  };

  const handleHallConfigChange = (idx, field, value) => {
    const updated = hallsConfig.map((h, i) => {
      if (i === idx) {
        return { ...h, [field]: value };
      }
      return h;
    });
    setHallsConfig(updated);
  };


  const handleTeacherFileSelected = async (e) => {
    const file = e.target.files[0];
    if (!file) {
      setTeacherCSVFile(null);
      setTeacherCSVFileName('Choose Teacher Excel');
      setParsedUploadedTeachers([]);
      return;
    }
    setTeacherCSVFile(file);
    setTeacherCSVFileName(file.name);

    try {
      const rows = await parseExcelFile(file);
      const parsed = parseTeacherExcel(rows);
      if (parsed.length === 0) {
        throw new Error("Teacher Excel contains no valid rows.");
      }


      const updated = parsed.map((t, idx) => {
        const assignedHall = hallsConfig[idx % hallsConfig.length]?.name || 'Hall 1';
        return { ...t, assignedHall };
      });
      setParsedUploadedTeachers(updated);
    } catch (err) {
      setSetupAlert({ type: 'error', msg: `Parsing teachers Excel failed: ${err.message}` });
      setTeacherCSVFile(null);
      setTeacherCSVFileName('Choose Teacher Excel');
      setParsedUploadedTeachers([]);
    }
  };

  const handleTeacherPreviewHallChange = (idx, hallName) => {
    const updated = parsedUploadedTeachers.map((t, i) => {
      if (i === idx) {
        return { ...t, assignedHall: hallName };
      }
      return t;
    });
    setParsedUploadedTeachers(updated);
  };


  const handleCreateDrive = async (e) => {
    e.preventDefault();
    setSetupAlert({ type: 'warning', msg: 'Processing student and teacher documents...' });

    const company = companyName.trim();
    const date = driveDate;

    if (!company || !date || !studentCSVFile || !teacherCSVFile) {
      setSetupAlert({ type: 'error', msg: 'Company name, Date, and both Excel files are required.' });
      return;
    }

    try {

      const studentRows = await parseExcelFile(studentCSVFile);
      const parsedStudents = parseStudentExcel(studentRows);
      if (parsedStudents.length === 0) {
        throw new Error("Student Excel contains no valid rows.");
      }


      if (hallsConfig.length === 0) {
        throw new Error("Please configure at least one hall.");
      }

      const totalCapacity = hallsConfig.reduce((sum, h) => sum + (parseInt(h.capacity, 10) || 0), 0);
      const studentCount = parsedStudents.length;

      if (studentCount !== totalCapacity) {
        playSound('error');
        throw new Error(`Verification Failed: Total number of students in Excel (${studentCount}) does not match the sum of capacities in all halls (${totalCapacity}).`);
      }


      let currentTeachers = parsedUploadedTeachers;
      if (currentTeachers.length === 0) {
        const teacherRows = await parseExcelFile(teacherCSVFile);
        const parsed = parseTeacherExcel(teacherRows);
        currentTeachers = parsed.map((t, idx) => {
          const assignedHall = hallsConfig[idx % hallsConfig.length]?.name || 'Hall 1';
          return { ...t, assignedHall };
        });
      }

      if (currentTeachers.length === 0) {
        throw new Error("Teacher Excel contains no valid rows.");
      }

      const companySlug = company.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const driveId = `${companySlug}_${date}`;


      setSetupAlert({ type: 'warning', msg: `Uploading ${parsedStudents.length} student entries...` });
      const studentsToSave = parsedStudents.map(s => {
        const salt = generatePasscode();
        return {
          rollNo: s.rollNo,
          name: s.name,
          email: s.email || `${s.rollNo.toLowerCase()}@student.edu`,
          department: s.rollNo.includes('/') ? s.rollNo.split('/')[1] : 'GEN',
          qrSalt: salt,
          qrHash: `hash_${s.rollNo.toLowerCase()}_${salt}`
        };
      });

      console.log("DEBUG: Calling saveStudentsAction server action...");
      await saveStudentsAction(studentsToSave);
      console.log("DEBUG: saveStudentsAction server action succeeded.");

      setSetupAlert({ type: 'warning', msg: `Allocating and creating ${currentTeachers.length} teacher accounts...` });
      const assignedTeacherIds = [];
      const teachersListToSave = [];

      currentTeachers.forEach((t, idx) => {
        const passcode = generatePasscode();
        const cleanPhone = t.phone.replace(/[^0-9]/g, '') || 'no-phone';
        const teacherId = `t_${cleanPhone}_${idx}`;
        assignedTeacherIds.push(teacherId);

        teachersListToSave.push({
          id: teacherId,
          name: t.name,
          email: t.email || '',
          phone: t.phone,
          assignedHall: t.assignedHall,
          passcode: passcode
        });
      });
      console.log("DEBUG: Calling saveTeachersAndPasscodesAction server action...");
      await saveTeachersAndPasscodesAction(teachersListToSave, driveId);
      console.log("DEBUG: saveTeachersAndPasscodesAction server action succeeded.");

      const driveData = {
        company: company,
        date: date,
        status: 'active',
        assignedTeachers: assignedTeacherIds,
        registeredRolls: parsedStudents.map(s => s.rollNo),
        halls: hallsConfig.map(h => ({ name: h.name, capacity: parseInt(h.capacity, 10) }))
      };

      console.log("DEBUG: Calling saveDriveAction server action...");
      await saveDriveAction(driveId, driveData);
      console.log("DEBUG: saveDriveAction server action succeeded.");

      setSetupAlert({ type: 'success', msg: `Drive "${company}" successfully created and active!` });

      setCompanyName('');
      setDriveDate('');
      setStudentCSVFile(null);
      setStudentCSVFileName('Choose Student Excel');
      setTeacherCSVFile(null);
      setTeacherCSVFileName('Choose Teacher Excel');
      setParsedUploadedTeachers([]);
      setHallsConfig([{ name: 'Hall 1', capacity: '' }]);

      loadDrive(driveId);

    } catch (err) {
      console.error(err);
      setSetupAlert({ type: 'error', msg: `Drive creation failed: ${err.message}` });
    }
  };


  const enterEditMode = (driveId) => {
    loadDrive(driveId);
    setIsEditMode(true);
    setEditingDriveId(driveId);

    const drive = drivesRegistry[driveId];
    if (!drive) return;

    setCompanyName(drive.company);
    setDriveDate(drive.date);

    if (drive.halls && drive.halls.length > 0) {
      setHallsConfig(drive.halls.map(h => ({ name: h.name, capacity: h.capacity })));
    } else {
      setHallsConfig([{ name: 'Hall 1', capacity: '' }]);
    }

    setStudentCSVFileName('Choose Excel (Optional - to overwrite students)');
    setTeacherCSVFileName('Choose Excel (Optional - to overwrite teachers)');
    setSetupAlert({ type: '', msg: '' });
  };

  const exitEditMode = () => {
    setIsEditMode(false);
    setEditingDriveId(null);
    setCompanyName('');
    setDriveDate('');
    setHallsConfig([{ name: 'Hall 1', capacity: '' }]);
    setStudentCSVFile(null);
    setStudentCSVFileName('Choose Student Excel');
    setTeacherCSVFile(null);
    setTeacherCSVFileName('Choose Teacher Excel');
    setParsedUploadedTeachers([]);
    setSetupAlert({ type: '', msg: '' });
  };

  const handleUpdateDrive = async (e) => {
    e.preventDefault();
    setSetupAlert({ type: 'warning', msg: 'Saving placement drive changes...' });

    const company = companyName.trim();
    const date = driveDate;

    if (!company || !date) {
      setSetupAlert({ type: 'error', msg: 'Company name and Date are required.' });
      return;
    }

    try {
      if (hallsConfig.length === 0) {
        throw new Error("Please configure at least one hall.");
      }

      const totalCapacity = hallsConfig.reduce((sum, h) => sum + (parseInt(h.capacity, 10) || 0), 0);

      const updatedDriveData = {
        company: company,
        date: date,
        halls: hallsConfig.map(h => ({ name: h.name, capacity: parseInt(h.capacity, 10) }))
      };


      if (studentCSVFile) {
        setSetupAlert({ type: 'warning', msg: 'Parsing new Student Excel document...' });
        const studentRows = await parseExcelFile(studentCSVFile);
        const parsedStudents = parseStudentExcel(studentRows);
        if (parsedStudents.length === 0) {
          throw new Error("New Student Excel contains no valid rows.");
        }

        if (parsedStudents.length !== totalCapacity) {
          playSound('error');
          throw new Error(`Verification Failed: Total number of students in Excel (${parsedStudents.length}) does not match the sum of capacities in all halls (${totalCapacity}).`);
        }

        setSetupAlert({ type: 'warning', msg: `Uploading ${parsedStudents.length} student entries...` });
        const studentsToSave = parsedStudents.map(s => {
          const salt = generatePasscode();
          return {
            rollNo: s.rollNo,
            name: s.name,
            email: s.email || `${s.rollNo.toLowerCase()}@student.edu`,
            department: s.rollNo.includes('/') ? s.rollNo.split('/')[1] : 'GEN',
            qrSalt: salt,
            qrHash: `hash_${s.rollNo.toLowerCase()}_${salt}`
          };
        });

        await saveStudentsAction(studentsToSave);

        updatedDriveData.registeredRolls = parsedStudents.map(s => s.rollNo);
      } else {
        const currentRollsCount = drivesRegistry[editingDriveId]?.registeredRolls?.length || 0;
        if (currentRollsCount !== totalCapacity) {
          playSound('error');
          throw new Error(`Verification Failed: Total hall capacities (${totalCapacity}) must match registered student size (${currentRollsCount}). Please upload a new Student Excel containing ${totalCapacity} students.`);
        }
      }


      if (teacherCSVFile || parsedUploadedTeachers.length > 0) {
        setSetupAlert({ type: 'warning', msg: 'Allocating and updating teacher accounts...' });
        let currentTeachers = parsedUploadedTeachers;
        if (currentTeachers.length === 0 && teacherCSVFile) {
          const teacherRows = await parseExcelFile(teacherCSVFile);
          const parsed = parseTeacherExcel(teacherRows);
          currentTeachers = parsed.map((t, idx) => {
            const assignedHall = hallsConfig[idx % hallsConfig.length]?.name || 'Hall 1';
            return { ...t, assignedHall };
          });
        }

        if (currentTeachers.length === 0) {
          throw new Error("Teacher Excel contains no valid rows.");
        }

        const assignedTeacherIds = [];
        const teachersListToSave = [];

        currentTeachers.forEach((t, idx) => {
          const passcode = generatePasscode();
          const cleanPhone = t.phone.replace(/[^0-9]/g, '') || 'no-phone';
          const teacherId = `t_${cleanPhone}_${idx}`;
          assignedTeacherIds.push(teacherId);

          teachersListToSave.push({
            id: teacherId,
            name: t.name,
            email: t.email || '',
            phone: t.phone,
            assignedHall: t.assignedHall,
            passcode: passcode
          });
        });
        await saveTeachersAndPasscodesAction(teachersListToSave, editingDriveId);

        updatedDriveData.assignedTeachers = assignedTeacherIds;
      }


      await updateDriveAction(editingDriveId, updatedDriveData);
      setSetupAlert({ type: 'success', msg: `Drive "${company}" successfully updated!` });

      exitEditMode();
      loadDrive(editingDriveId);

    } catch (err) {
      console.error(err);
      setSetupAlert({ type: 'error', msg: `Update error: ${err.message}` });
    }
  };


  const handleDeleteDrive = async (driveId) => {
    if (!confirm(`Are you sure you want to delete drive "${driveId}"? This will permanently delete the drive metadata, all assigned invigilators/teachers, and all attendance logs.`)) {
      return;
    }

    try {
      setSetupAlert({ type: 'warning', msg: 'Deleting drive and all associated data...' });
      await deleteDriveAction(driveId);

      setSetupAlert({ type: 'success', msg: 'Drive and all associated data deleted completely.' });
      if (activeDriveId === driveId) {
        setActiveDriveId('');
        sessionStorage.removeItem('adminActiveDriveId');
      }
    } catch (err) {
      console.error(err);
      setSetupAlert({ type: 'error', msg: `Delete failed: ${err.message}` });
    }
  };

  const handleResetLogs = async () => {
    if (!activeDriveId) return;
    if (!confirm("Are you sure you want to clear all scans for this drive? This action is permanent!")) {
      return;
    }

    try {
      await resetAttendanceAction(activeDriveId);
      alert("Attendance records reset successfully.");
    } catch (err) {
      alert(`Reset failed: ${err.message}`);
    }
  };

  const handleFinalizeDrive = async () => {
    if (!activeDriveId) return;
    if (!confirm("Close and finalize attendance? Teachers will not be able to scan new records.")) {
      return;
    }

    try {
      await closeDriveAction(activeDriveId);
      alert("Drive status closed successfully.");
    } catch (err) {
      alert(`Finalize failed: ${err.message}`);
    }
  };


  const handleExportCSV = () => {
    if (!activeDriveId || studentsList.length === 0) return;

    try {
      const attendanceMap = {};
      attendanceList.forEach(rec => {
        attendanceMap[rec.rollNo] = rec;
      });

      let csvContent = "Name,Roll No,Email,Status,Hall,Invigilator,Scanned Time,Remarks\n";

      studentsList.forEach(s => {
        const scan = attendanceMap[s.rollNo];
        const status = scan ? 'Present' : 'Absent';
        const hall = scan ? scan.hall : '—';
        const invigilator = scan ? scan.teacherId : '—';

        let time = '—';
        if (scan && scan.scannedAt) {
          const dateObj = typeof scan.scannedAt.toDate === 'function'
            ? scan.scannedAt.toDate()
            : new Date(scan.scannedAt);
          const yyyy = dateObj.getFullYear();
          const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
          const dd = String(dateObj.getDate()).padStart(2, '0');
          const hh = String(dateObj.getHours()).padStart(2, '0');
          const min = String(dateObj.getMinutes()).padStart(2, '0');
          const ss = String(dateObj.getSeconds()).padStart(2, '0');
          time = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
        }

        const remarksRaw = scan ? (scan.remarks || 'nil') : 'nil';
        const remarks = remarksRaw.replace(/"/g, '""');

        csvContent += `"${s.name}","${s.rollNo}","${s.email}","${status}","${hall}","${invigilator}","${time}","${remarks}"\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Attendance_Report_${drivesRegistry[activeDriveId]?.company}_${drivesRegistry[activeDriveId]?.date}.csv`;
      link.click();
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    }
  };


  const handleSaveEmailConfig = () => {
    sessionStorage.setItem('exam_attendance_email_config', JSON.stringify(emailConfig));
    setEmailAlert({ type: 'success', msg: 'Email configurations saved.' });
    setTimeout(() => setEmailAlert({ type: '', msg: '' }), 3000);
  };

  const handleSaveTwilioConfig = () => {
    sessionStorage.setItem('exam_attendance_twilio', JSON.stringify(twilioConfig));
    setTwilioAlert({ type: 'success', msg: 'Twilio configurations saved.' });
    setTimeout(() => setTwilioAlert({ type: '', msg: '' }), 3000);
  };

  const handleBulkSMSTeachers = async () => {
    if (teachersList.length === 0) return;
    const activeDrive = drivesRegistry[activeDriveId];
    if (!activeDrive) return;

    const hasSid = twilioConfig.sid || twilioEnvStatus.sidConfigured;
    const hasToken = twilioConfig.token || twilioEnvStatus.tokenConfigured;
    const hasFrom = twilioConfig.from || twilioEnvStatus.fromConfigured;

    if (!hasSid || !hasToken || !hasFrom) {
      alert("Please configure the Twilio SMS Gateway credentials in the setup section or environment variables first.");
      return;
    }

    const teachersWithHalls = teachersList.filter(t => t.assignedHall && t.assignedHall.trim() !== '');

    if (teachersWithHalls.length === 0) {
      alert("No teachers are assigned to any halls.");
      return;
    }

    if (!confirm(`Send automated login passcode SMS to all ${teachersWithHalls.length} assigned invigilators via Twilio?`)) {
      return;
    }

    setBatchStatus({
      active: true,
      title: 'Dispatching teacher passcode SMS...',
      current: 0,
      total: teachersWithHalls.length,
      logs: []
    });

    try {
      const result = await sendDrivePasscodesSMS({
        activeDriveId,
        twilioConfig,
        origin: window.location.origin
      });

      if (result && result.success) {
        setBatchStatus(prev => ({
          ...prev,
          current: result.count,
          logs: result.logs
        }));
      } else {
        alert(`Failed to send SMS: ${result?.error || 'Unknown error'}`);
        setBatchStatus({ active: false, title: '', current: 0, total: 0, logs: [] });
      }
    } catch (err) {
      alert(`Error sending bulk SMS: ${err.message}`);
      setBatchStatus({ active: false, title: '', current: 0, total: 0, logs: [] });
    }

    alert("Bulk teacher SMS dispatch completed.");
  };

  const handleBulkSendRMEmail = async () => {
    if (studentsList.length === 0) {
      alert("No students registered for this drive.");
      return;
    }

    if (!confirm(`Are you sure you want to send notification emails to all ${filteredStudentsForQR.length} filtered students via DTU RM Portal?`)) {
      return;
    }

    setBatchStatus({
      active: true,
      title: 'Authenticating with RM Portal...',
      current: 0,
      total: filteredStudentsForQR.length,
      logs: []
    });

    try {
      let accessToken = rmAccessToken;
      if (!accessToken) {
        const loginRes = await getRMAccessToken(rmLoginCreds);
        if (!loginRes.success) {
          alert(`Authentication failed: ${loginRes.error || 'Unknown login error'}`);
          setBatchStatus({ active: false, title: '', current: 0, total: 0, logs: [] });
          return;
        }
        accessToken = loginRes.token;
        setRMAccessTokenState(accessToken);
      }

      setBatchStatus(prev => ({
        ...prev,
        title: 'Dispatching student notification emails...',
        logs: ['Successfully authenticated with DTU RM Portal. Starting dispatch...']
      }));

      let successCount = 0;
      const activeDrive = drivesRegistry[activeDriveId];
      const company = activeDrive ? activeDrive.company : 'Placement Drive';
      const date = activeDrive ? activeDrive.date : '';

      for (let i = 0; i < filteredStudentsForQR.length; i++) {
        const s = filteredStudentsForQR[i];
        const allotment = studentAllotments.find(a => a.rollNo === s.rollNo);
        const hall = allotment ? allotment.allottedHall : 'Not yet assigned';

        setBatchStatus(prev => ({
          ...prev,
          current: i + 1
        }));

        try {
          const plainText = `Dear ${s.name},

Your registration for the placement drive of ${company} scheduled on ${date} has been confirmed.

${company} Placement Drive

Hall Assignment: ${hall}

Please report to ${hall} on time. Make sure to carry your college ID card and physical copies of your resume.

Important Instructions:
Attendance will be verified by invigilators at the hall entrance. Please arrive at least 15 minutes prior to the start time.

Regards,
Center for Career Development and Industry Engagement
(Formerly Department of Training and Placement)
Delhi Technological University`;

          const result = await sendRMEmail({
            accessToken,
            toEmail: s.email,
            subject: `Placement Drive Notification - ${company}`,
            text: plainText,
          });

          if (result && result.success) {
            successCount++;
            setBatchStatus(prev => ({
              ...prev,
              logs: [...prev.logs, `Notification sent to ${s.name} (${s.rollNo}) [✓]`]
            }));
          } else {
            setBatchStatus(prev => ({
              ...prev,
              logs: [...prev.logs, `Failed for ${s.name} (${s.rollNo}): ${result?.error || 'Server error'} [X]`]
            }));
          }
        } catch (innerErr) {
          setBatchStatus(prev => ({
            ...prev,
            logs: [...prev.logs, `Failed for ${s.name} (${s.rollNo}): ${innerErr.message} [X]`]
          }));
        }
      }

      alert(`Batch email dispatch completed. Sent: ${successCount}/${filteredStudentsForQR.length}`);
    } catch (err) {
      alert(`Error during batch email dispatch: ${err.message}`);
      setBatchStatus({ active: false, title: '', current: 0, total: 0, logs: [] });
    }
  };

  const handleSendSingleRMEmail = async (student) => {
    if (!confirm(`Send placement notification email to ${student.name} (${student.rollNo})?`)) {
      return;
    }

    setBatchStatus({
      active: true,
      title: `Sending notification to ${student.name}...`,
      current: 0,
      total: 1,
      logs: []
    });

    try {
      let accessToken = rmAccessToken;
      if (!accessToken) {
        const loginRes = await getRMAccessToken(rmLoginCreds);
        if (!loginRes.success) {
          alert(`Authentication failed: ${loginRes.error || 'Unknown login error'}`);
          setBatchStatus({ active: false, title: '', current: 0, total: 0, logs: [] });
          return;
        }
        accessToken = loginRes.token;
        setRMAccessTokenState(accessToken);
      }
      const activeDrive = drivesRegistry[activeDriveId];

      const company = activeDrive?.company ?? "Placement Drive";
      const date = activeDrive?.date ?? "";
      const allotment = studentAllotments.find(a => a.rollNo === student.rollNo);
      const hall = allotment ? allotment.allottedHall : 'Not yet assigned';

      const plainText = `Dear ${student.name},

Your registration for the placement drive of ${company} scheduled on ${date}.

${company} Placement Drive

Hall Assigned: ${hall}

Please report to ${hall} on time. Make sure to carry your college ID card and physical copies of your resume.

Regards,
Center for Career Development and Industry Engagement
(Formerly Department of Training and Placement)
Delhi Technological University`;

      const result = await sendRMEmail({
        accessToken,
        toEmail: student.email,
        subject: `Placement Drive Notification - ${company}`,
        text: plainText,
      });

      if (result && result.success) {
        setBatchStatus(prev => ({
          ...prev,
          current: 1,
          logs: [`Notification sent to ${student.name} successfully [✓]`]
        }));
        alert(`Notification email sent to ${student.name} successfully!`);
      } else {
        alert(`Failed to send email: ${result?.error || 'Server error'}`);
        setBatchStatus({ active: false, title: '', current: 0, total: 0, logs: [] });
      }
    } catch (err) {
      alert(`Error sending notification email: ${err.message}`);
      setBatchStatus({ active: false, title: '', current: 0, total: 0, logs: [] });
    }
  };

  const handleBulkSendTeacherEmail = async () => {
    if (teachersList.length === 0) {
      alert("No teachers registered for this drive.");
      return;
    }

    const teachersWithHalls = teachersList.filter(t => t.assignedHall && t.assignedHall.trim() !== '');

    if (teachersWithHalls.length === 0) {
      alert("No teachers are assigned to any halls.");
      return;
    }

    if (!confirm(`Send passcode emails to all ${teachersWithHalls.length} assigned invigilators via DTU RM Portal?`)) {
      return;
    }

    setBatchStatus({
      active: true,
      title: 'Authenticating with RM Portal...',
      current: 0,
      total: teachersWithHalls.length,
      logs: []
    });

    try {
      let accessToken = rmAccessToken;
      if (!accessToken) {
        const loginRes = await getRMAccessToken(rmLoginCreds);
        if (!loginRes.success) {
          alert(`Authentication failed: ${loginRes.error || 'Unknown login error'}`);
          setBatchStatus({ active: false, title: '', current: 0, total: 0, logs: [] });
          return;
        }
        accessToken = loginRes.token;
        setRMAccessTokenState(accessToken);
      }

      setBatchStatus(prev => ({
        ...prev,
        title: 'Dispatching teacher passcode emails...',
        logs: ['Successfully authenticated with DTU RM Portal. Starting dispatch...']
      }));

      let successCount = 0;
      const activeDrive = drivesRegistry[activeDriveId];
      const company = activeDrive ? activeDrive.company : 'Placement Drive';
      const date = activeDrive ? activeDrive.date : '';
      const loginUrl = `${window.location.origin}/login?role=invigilator`;

      let teachersData = [];
      try {
        teachersData = await getTeachersWithPasscodesAction(activeDriveId);
      } catch (err) {
        alert(`Failed to fetch teacher passcodes: ${err.message}`);
        setBatchStatus({ active: false, title: '', current: 0, total: 0, logs: [] });
        return;
      }

      for (let i = 0; i < teachersWithHalls.length; i++) {
        const t = teachersWithHalls[i];

        setBatchStatus(prev => ({
          ...prev,
          current: i + 1
        }));

        if (!t.email || t.email.trim() === '') {
          setBatchStatus(prev => ({
            ...prev,
            logs: [...prev.logs, `Skipped ${t.name}: No email address [X]`]
          }));
          continue;
        }

        const teacherPasscodeData = teachersData.find(td => td.id === t.id);
        const passcode = teacherPasscodeData ? teacherPasscodeData.passcode : 'N/A';

        try {
          const plainText = `Dear ${t.name},

You have been assigned for the ${company} placement drive${date ? ` scheduled on ${date}` : ''}.

Assignment Details:
- Hall: ${t.assignedHall}
- Your Login Passcode: ${passcode}

Regards,
Center for Career Development and Industry Engagement
(Formerly Department of Training and Placement)
Delhi Technological University`;

          const result = await sendRMEmail({
            accessToken,
            toEmail: t.email,
            subject: `Invigilator Assignment - ${company} Placement Drive`,
            text: plainText,
          });

          if (result && result.success) {
            successCount++;
            setBatchStatus(prev => ({
              ...prev,
              logs: [...prev.logs, `Passcode email sent to ${t.name} (${t.assignedHall}) [✓]`]
            }));
          } else {
            setBatchStatus(prev => ({
              ...prev,
              logs: [...prev.logs, `Failed for ${t.name}: ${result?.error || 'Server error'} [X]`]
            }));
          }
        } catch (innerErr) {
          setBatchStatus(prev => ({
            ...prev,
            logs: [...prev.logs, `Failed for ${t.name}: ${innerErr.message} [X]`]
          }));
        }
      }

      alert(`Teacher email dispatch completed. Sent: ${successCount}/${teachersWithHalls.length}`);
    } catch (err) {
      alert(`Error during teacher email dispatch: ${err.message}`);
      setBatchStatus({ active: false, title: '', current: 0, total: 0, logs: [] });
    }
  };

  const addBatchLog = (msg) => {
    setBatchStatus(prev => ({
      ...prev,
      logs: [...prev.logs, msg]
    }));
  };


  const downloadQR = async (student) => {
    const payload = JSON.stringify({
      roll: student.rollNo,
      name: student.name,
      salt: student.qrSalt || ''
    });

    const src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}`;
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `QR_${student.rollNo.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Failed to download QR code directly:", err);

      window.open(src, '_blank');
    }
  };

  const handleDisplayPasscodes = async () => {
    if (!activeDriveId) {
      alert("Please select or activate a drive first.");
      return;
    }
    setIsPasscodeModalOpen(true);
    setIsFetchingPasscodes(true);
    try {
      const data = await getTeachersWithPasscodesAction(activeDriveId);
      setTeachersWithPasscodes(data);
    } catch (err) {
      console.error("Failed to fetch teacher passcodes:", err);
      alert("Failed to fetch teacher passcodes: " + err.message);
    } finally {
      setIsFetchingPasscodes(false);
    }
  };

  const handleLogout = () => {
    Auth.logout(router);
  };


  const activeDrive = drivesRegistry[activeDriveId];
  const registeredCount = activeDrive?.registeredRolls?.length || 0;
  const presentCount = attendanceList.length;
  const absentCount = Math.max(0, registeredCount - presentCount);
  const teachersCount = teachersList.length;


  const hallTeachersMap = {};
  const activeHalls = drivesRegistry[activeDriveId]?.halls || [];
  activeHalls.forEach(h => {
    const hName = typeof h === 'string' ? h : h.name;
    hallTeachersMap[hName] = [];
  });
  teachersList.forEach(t => {
    if (hallTeachersMap[t.assignedHall]) {
      const displayName = t.present ? `${t.name} (Present)` : t.name;
      hallTeachersMap[t.assignedHall].push(displayName);
    }
  });


  const hallPresentCountMap = {};
  activeHalls.forEach(h => {
    const hName = typeof h === 'string' ? h : h.name;
    hallPresentCountMap[hName] = 0;
  });
  attendanceList.forEach(rec => {
    if (hallPresentCountMap[rec.hall] !== undefined) {
      hallPresentCountMap[rec.hall]++;
    }
  });


  const filteredStudentsForQR = studentsList.filter(s => {
    const query = qrSearchQuery.trim().toLowerCase();
    const roll = s.rollNo ? s.rollNo.toLowerCase() : '';
    const name = s.name ? s.name.toLowerCase() : '';
    return roll.includes(query) || name.includes(query);
  });

  const hallTeachersMapNames = {};
  activeHalls.forEach(h => {
    const hName = typeof h === 'string' ? h : h.name;
    hallTeachersMapNames[hName] = [];
  });
  teachersList.forEach(t => {
    const hName = t.assignedHall;
    if (hallTeachersMapNames[hName] !== undefined) {
      hallTeachersMapNames[hName].push(t.name);
    }
  });

  const studentAllotments = [];
  const hallCapacityAllotted = {};
  activeHalls.forEach(h => {
    const hName = typeof h === 'string' ? h : h.name;
    hallCapacityAllotted[hName] = 0;
  });

  let hallIndex = 0;
  let studentsAllocatedToCurrentHall = 0;

  studentsList.forEach(student => {
    let allottedHall = 'Unassigned';
    let teachers = [];

    while (hallIndex < activeHalls.length) {
      const currentHall = activeHalls[hallIndex];
      const hName = typeof currentHall === 'string' ? currentHall : currentHall.name;
      const capacity = typeof currentHall === 'string' ? 0 : (parseInt(currentHall.capacity, 10) || 0);

      if (studentsAllocatedToCurrentHall < capacity) {
        allottedHall = hName;
        teachers = hallTeachersMapNames[hName] || [];
        studentsAllocatedToCurrentHall++;
        hallCapacityAllotted[hName]++;
        break;
      } else {
        hallIndex++;
        studentsAllocatedToCurrentHall = 0;
      }
    }

    studentAllotments.push({
      ...student,
      allottedHall,
      teachers: teachers.join(', ') || 'No Invigilator Assigned'
    });
  });

  const filteredAllotments = studentAllotments.filter(item => {
    const q = allotmentSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (item.rollNo || '').toLowerCase().includes(q) ||
      (item.name || '').toLowerCase().includes(q) ||
      (item.allottedHall || '').toLowerCase().includes(q) ||
      (item.teachers || '').toLowerCase().includes(q) ||
      (item.email || '').toLowerCase().includes(q) ||
      (item.department || '').toLowerCase().includes(q)
    );
  });

  if (isVerifyingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0f14] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header
        style={{
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.05), rgba(15, 23, 42, 0) 60%)'
        }}
      >
        <div className="brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <h1>Placement Attend <span style={{ fontWeight: 400, fontSize: '0.80rem', color: '#FF7377' }}>Admin</span></h1>
        </div>

        <div className="header-actions">
          <div
            id="cloud-sync-pill"
            className="active-drive-pill"
            style={{
              backgroundColor: db ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${db ? '#22c55e' : '#ef4444'}`,
              color: db ? '#22c55e' : '#ef4444',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: db ? '#22c55e' : '#ef4444' }}></span>
            {db ? 'Cloud Connected' : 'Connecting...'}
          </div>
          <div id="active-drive-display" className="active-drive-pill">
            {drivesRegistry[activeDriveId] ? `${drivesRegistry[activeDriveId].company} (${drivesRegistry[activeDriveId].date})` : 'No Active Drive'}
          </div>

          <button
            onClick={() => setIsRMLoginModalOpen(true)}
            id="btn-rm-login"
            style={{
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '0 0.85rem',
              height: '34px',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'background-color 0.2s ease',
              marginRight: '0.25rem'
            }}
            title="RM Portal Login"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
            RM Login
          </button>

          <button onClick={handleLogout} id="btn-logout" className="btn-theme-toggle" title="Log Out" aria-label="Log Out" style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.25)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </header>

      <nav
        className="nav-tabs"
        style={{
          background: 'rgba(239, 68, 68, 0.04)',
          borderBottom: '1px solid rgba(239, 68, 68, 0.15)'
        }}
      >
        <button
          onClick={() => setActiveTab('setup-tab')}
          className={`tab-btn ${activeTab === 'setup-tab' ? 'active' : ''}`}
          id="nav-setup-btn"
          style={{
            borderBottom: activeTab === 'setup-tab' ? '2px solid #FF474C' : '2px solid transparent',
            color: activeTab === 'setup-tab' ? '#FF474C' : undefined
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
          </svg>
          Setup & Registry
        </button>
        <button
          onClick={() => setActiveTab('dashboard-tab')}
          className={`tab-btn ${activeTab === 'dashboard-tab' ? 'active' : ''}`}
          id="nav-dashboard-btn"
          style={{
            borderBottom: activeTab === 'dashboard-tab' ? '2px solid #FF474C' : '2px solid transparent',
            color: activeTab === 'dashboard-tab' ? '#FF474C' : undefined
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
          </svg>
          Live Dashboard
        </button>
      </nav>

      <main>


        {activeTab === 'setup-tab' && (
          <section id="setup-tab" className="tab-content active">
            <div className="grid-2">


              <div className="panel">
                <div className="panel-title" id="setup-panel-title">
                  {isEditMode ? 'Update Placement Drive' : 'Create Placement Drive'}
                </div>

                {setupAlert.msg && (
                  <div className={`alert-box alert-${setupAlert.type}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {setupAlert.type === 'success'
                        ? <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" />
                        : <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>}
                    </svg>
                    <div>{setupAlert.msg}</div>
                  </div>
                )}

                <form onSubmit={isEditMode ? handleUpdateDrive : handleCreateDrive} autoComplete="off">
                  <div className="form-group">
                    <label htmlFor="company-name">Company Name</label>
                    <input
                      type="text"
                      id="company-name"
                      className="form-control"
                      placeholder="e.g. Google India"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="exam-date">Placement Drive Date</label>
                    <input
                      type="date"
                      id="exam-date"
                      className="form-control"
                      required
                      value={driveDate}
                      onChange={(e) => setDriveDate(e.target.value)}
                    />
                  </div>


                  <div className="form-group" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem', backgroundColor: 'rgba(30, 41, 59, 0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <label style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Halls Configuration</label>
                      <button
                        type="button"
                        onClick={handleAddHall}
                        className="btn btn-secondary"
                        style={{ minHeight: '28px', height: '28px', padding: '0 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        Add Hall
                      </button>
                    </div>
                    <div id="halls-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {hallsConfig.map((hall, idx) => (
                        <div key={idx} className="hall-row" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input
                            type="text"
                            className="form-control hall-name"
                            placeholder="Hall Name"
                            style={{ flex: 2 }}
                            required
                            value={hall.name}
                            onChange={(e) => handleHallConfigChange(idx, 'name', e.target.value)}
                          />
                          <input
                            type="number"
                            className="form-control hall-capacity"
                            placeholder="Capacity"
                            style={{ flex: 1.5 }}
                            min="1"
                            required
                            value={hall.capacity}
                            onChange={(e) => handleHallConfigChange(idx, 'capacity', e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveHall(idx)}
                            className="btn btn-danger btn-remove-hall"
                            style={{ minHeight: '38px', height: '38px', width: '38px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Student Excel File Upload</label>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      Excel Columns: <code>Name, Roll No, Email</code>
                    </div>
                    <div className="file-upload-wrapper">
                      <div className="file-upload-label">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                        </svg>
                        <span>{studentCSVFileName}</span>
                      </div>
                      <input
                        type="file"
                        className="file-upload-input"
                        accept=".xlsx, .xls"
                        required={!isEditMode}
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            setStudentCSVFile(file);
                            setStudentCSVFileName(file.name);
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Teachers Excel File Upload</label>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      Excel Columns: <code>Name, Phone, Email</code>
                    </div>
                    <div className="file-upload-wrapper">
                      <div className="file-upload-label">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                        </svg>
                        <span>{teacherCSVFileName}</span>
                      </div>
                      <input
                        type="file"
                        className="file-upload-input"
                        accept=".xlsx, .xls"
                        required={!isEditMode}
                        onChange={handleTeacherFileSelected}
                      />
                    </div>


                    {parsedUploadedTeachers.length > 0 && (
                      <div id="uploaded-teachers-panel" style={{ marginTop: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', backgroundColor: 'rgba(30, 41, 59, 0.3)' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Uploaded Invigilators Allocation</div>
                        <div className="table-container" style={{ maxHeight: '250px', marginTop: 0 }}>
                          <table>
                            <thead>
                              <tr>
                                <th>Name</th>
                                <th>Phone</th>
                                <th>Email</th>
                                <th style={{ width: '150px' }}>Assign to</th>
                              </tr>
                            </thead>
                            <tbody>
                              {parsedUploadedTeachers.map((t, idx) => (
                                <tr key={idx}>
                                  <td style={{ fontWeight: 600, color: 'white' }}>{t.name}</td>
                                  <td style={{ fontSize: '0.85rem' }}>{t.phone}</td>
                                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t.email || '—'}</td>
                                  <td>
                                    <select
                                      className="form-control"
                                      style={{
                                        padding: '0.25rem 1.75rem 0.25rem 0.5rem',
                                        height: 'auto',
                                        minHeight: 'auto',
                                        fontSize: '0.85rem',
                                        width: '100%',
                                        minWidth: '125px',
                                        boxSizing: 'border-box',
                                        color: 'var(--text-main)',
                                        backgroundColor: 'var(--bg-color)',
                                      }}
                                      value={t.assignedHall}
                                      onChange={(e) => handleTeacherPreviewHallChange(idx, e.target.value)}
                                    >
                                      {hallsConfig.map(h => (
                                        <option
                                          key={h.name}
                                          value={h.name}
                                          style={{
                                            backgroundColor: 'var(--panel-bg)',
                                            color: 'var(--text-main)',
                                          }}
                                        >
                                          {h.name}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button
                      type="submit"
                      className="btn btn-block"
                      id="btn-submit-drive"
                      style={{
                        backgroundColor: '#FF7377',
                        border: '1px solid #dc2626',
                        color: '#fff',
                      }}
                    >
                      {isEditMode ? 'Save & Update Drive' : 'Create & Initialize Drive'}
                    </button>

                    {isEditMode && (
                      <button
                        type="button"
                        onClick={exitEditMode}
                        className="btn btn-block"
                        id="btn-cancel-edit"
                        style={{
                          backgroundColor: '#3b82f6',
                          border: '1px solid #2563eb',
                          color: '#fff',
                        }}
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                </form>
              </div>
              <div className="config-accordion" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="panel">
                  <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Placement Drives Registry</span>
                    <div className="registry-filter-tabs" style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'rgba(15, 23, 42, 0.4)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <button
                        type="button"
                        onClick={() => setActiveRegistryFilter('upcoming')}
                        className={`filter-tab ${activeRegistryFilter === 'upcoming' ? 'active' : ''}`}
                        style={{
                          background: activeRegistryFilter === 'upcoming' ? '#FF7377' : 'none',
                          border: 'none',
                          color: activeRegistryFilter === 'upcoming' ? 'white' : 'var(--text-muted)',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Upcoming
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveRegistryFilter('all')}
                        className={`filter-tab ${activeRegistryFilter === 'all' ? 'active' : ''}`}
                        style={{
                          background: activeRegistryFilter === 'all' ? '#FF7377' : 'none',
                          border: 'none',
                          color: activeRegistryFilter === 'all' ? 'white' : 'var(--text-muted)',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        All
                      </button>
                    </div>
                  </div>

                  <div id="drive-list-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {Object.keys(drivesRegistry).length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No drives created yet.</div>
                    ) : (
                      Object.keys(drivesRegistry)
                        .filter(k => {
                          if (activeRegistryFilter === 'all') return true;
                          const drive = drivesRegistry[k];
                          const todayStr = new Date().toISOString().split('T')[0];
                          return drive.date >= todayStr && drive.status !== 'closed';
                        })
                        .sort((a, b) => drivesRegistry[b].date.localeCompare(drivesRegistry[a].date))
                        .map(k => {
                          const drive = drivesRegistry[k];
                          const isActive = activeDriveId === k;
                          const isClosed = drive.status === 'closed';
                          const statusLabel = isClosed ? 'Finalized' : 'Open';
                          return (
                            <div
                              key={k}
                              className="drive-item"
                              style={{
                                border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border-color)'}`,
                                backgroundColor: isActive ? 'rgba(59, 130, 246, 0.05)' : 'var(--panel-bg)',
                                borderRadius: '12px',
                                padding: '1rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 700, color: 'white' }}>{drive.company}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                  Date: {drive.date} &bull; Registered: {drive.registeredRolls ? drive.registeredRolls.length : 0} &bull; Status: <span style={{ color: isClosed ? 'var(--error)' : 'var(--success)', fontWeight: 600 }}>{statusLabel}</span>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '0.35rem' }}>
                                <button className="btn btn-secondary" style={{ minHeight: '32px', height: '32px', fontSize: '0.75rem', padding: '0 0.75rem' }} onClick={() => loadDrive(k)}>Activate</button>
                                <button className="btn btn-secondary" style={{ minHeight: '32px', height: '32px', fontSize: '0.75rem', padding: '0 0.75rem', backgroundColor: 'var(--border-color)', color: 'var(--text-main)' }} onClick={() => enterEditMode(k)}>Edit</button>
                                <button className="btn btn-danger" style={{ minHeight: '32px', height: '32px', fontSize: '0.75rem', padding: '0 0.5rem' }} onClick={() => handleDeleteDrive(k)}>&times;</button>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>

                {/* <div className="panel">
                  <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>SMS Gateway Configuration (Twilio)</span>
                  </div>
                  {twilioAlert.msg && (
                    <div className="alert-box alert-success" style={{ padding: '0.5rem 1rem', marginBottom: '1rem' }}>
                      {twilioAlert.msg}
                    </div>
                  )}
                  <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div className="form-group">
                      <label htmlFor="twilio-sid-input">Account SID</label>
                      <input
                        type="text"
                        id="twilio-sid-input"
                        className="form-control"
                        placeholder={twilioEnvStatus.sidConfigured ? "Using Environment Variable" : "AC..."}
                        value={twilioConfig.sid}
                        onChange={(e) => setTwilioConfig({ ...twilioConfig, sid: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="twilio-token-input">Auth Token</label>
                      <input
                        type="password"
                        id="twilio-token-input"
                        className="form-control"
                        placeholder={twilioEnvStatus.tokenConfigured ? "Using Environment Variable (••••••••)" : "••••••••"}
                        value={twilioConfig.token}
                        onChange={(e) => setTwilioConfig({ ...twilioConfig, token: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="twilio-from-input">From Phone Number</label>
                      <input
                        type="text"
                        id="twilio-from-input"
                        className="form-control"
                        placeholder={twilioEnvStatus.fromConfigured ? "Using Environment Variable" : "+1234567890"}
                        value={twilioConfig.from}
                        onChange={(e) => setTwilioConfig({ ...twilioConfig, from: e.target.value })}
                      />
                    </div>
                  </div>
                  <button onClick={handleSaveTwilioConfig} className="btn btn-secondary btn-block">Save SMS Credentials</button>
                </div> */}
              </div>
            </div>

            <div className="panel" style={{ marginTop: '1.5rem' }}>
              <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Student Hall Allotment & Invigilator Registry</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>
                  Active Drive: {activeDrive ? `${activeDrive.company} (${activeDrive.date})` : 'None'}
                </span>
              </div>

              {!activeDrive ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Please activate or select a placement drive from the registry to view student hall allotments.
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                      Allotment Summary
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                      {activeHalls.map((hall, idx) => {
                        const hName = typeof hall === 'string' ? hall : hall.name;
                        const capacity = typeof hall === 'string' ? 0 : (parseInt(hall.capacity, 10) || 0);
                        const allotted = hallCapacityAllotted[hName] || 0;
                        const percent = capacity > 0 ? Math.min(100, Math.round((allotted / capacity) * 100)) : 0;
                        const teachers = hallTeachersMapNames[hName] || [];

                        return (
                          <div key={idx} className="stat-card" style={{ borderLeft: '4px solid #FF7377', backgroundColor: 'rgba(15, 23, 42, 0.4)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, color: 'white', fontSize: '1rem' }}>{hName}</span>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: allotted === capacity ? 'var(--success)' : '#FF7377' }}>
                                {allotted === capacity ? 'Full' : 'Filling'}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>
                              Allotted: <strong style={{ color: 'white' }}>{allotted}</strong> / {capacity} Students
                            </div>

                            <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '3px', margin: '0.5rem 0', overflow: 'hidden' }}>
                              <div style={{ width: `${percent}%`, height: '100%', backgroundColor: '#FF7377', borderRadius: '3px' }} />
                            </div>

                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                              Invigilators: <span style={{ color: 'white', fontWeight: 500 }}>{teachers.join(', ') || 'None assigned'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Showing {filteredAllotments.length} of {studentAllotments.length} students
                    </div>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search by Roll No, Name, Hall, or Teacher..."
                      style={{ width: '320px', fontSize: '0.85rem' }}
                      value={allotmentSearchQuery}
                      onChange={(e) => setAllotmentSearchQuery(e.target.value)}
                    />
                  </div>

                  <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Roll No</th>
                          <th>Student Name</th>
                          <th>Email</th>
                          <th>Department</th>
                          <th>Allotted Hall</th>
                          <th>Assigned Invigilators</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAllotments.length === 0 ? (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                              {studentAllotments.length === 0 ? 'No registered students for this drive.' : 'No allotments match your search query.'}
                            </td>
                          </tr>
                        ) : (
                          filteredAllotments.map((student, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 700, color: 'white' }}>{student.rollNo}</td>
                              <td>{student.name}</td>
                              <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{student.email}</td>
                              <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{student.department || 'GEN'}</td>
                              <td>
                                <span className="status-badge status-present" style={{ textTransform: 'none', backgroundColor: 'rgba(255, 115, 119, 0.1)', border: '1px solid rgba(255, 115, 119, 0.3)', color: '#FF7377' }}>
                                  {student.allottedHall}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.85rem', color: student.teachers.includes('No Invigilator') ? 'var(--text-muted)' : 'white' }}>
                                {student.teachers}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </section>
        )}


        {activeTab === 'dashboard-tab' && (
          <section id="dashboard-tab" className="tab-content active" style={isDashboardFullScreen ? { position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 9999, backgroundColor: 'var(--bg-color)', overflowY: 'auto', padding: '2rem 1.5rem', margin: 0, maxWidth: 'none' } : {}}
          >
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '1.25rem', textAlign: 'left' }}>
                <div className="stat-label" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Students Registered</div>
                <div id="stat-registered" className="stat-val" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'white', margin: '0.25rem 0' }}>{registeredCount}</div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--success)', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '1.25rem', textAlign: 'left' }}>
                <div className="stat-label" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Present Candidates</div>
                <div id="stat-present" className="stat-val" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'white', margin: '0.25rem 0' }}>{presentCount}</div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--error)', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '1.25rem', textAlign: 'left' }}>
                <div className="stat-label" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Absent Candidates</div>
                <div id="stat-absent" className="stat-val" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'white', margin: '0.25rem 0' }}>{absentCount}</div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--warning)', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '1.25rem', textAlign: 'left' }}>
                <div className="stat-label" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Invigilators Linked</div>
                <div id="stat-teachers" className="stat-val" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'white', margin: '0.25rem 0' }}>{teachersCount}</div>
              </div>
            </div>

            <div className='flex flex-col gap-4'>
              <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="panel-title">
                  <span>Real-Time Attendance Streams</span>
                  <button
                    onClick={handleDashboardFullscreenToggle}
                    className="btn btn-secondary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.8rem',
                      padding: '0.35rem 0.7rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      fontWeight: 'normal',
                      textTransform: 'none',
                      minHeight: 'auto'
                    }}
                  >
                    {isDashboardFullScreen ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4" />
                        </svg>
                        Exit Full Screen
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                        </svg>
                        Full Screen
                      </>
                    )}
                  </button>
                </div>
                <div className="table-container" style={{ flexGrow: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Roll No</th>
                        <th>Student Name</th>
                        <th>Invigilator</th>
                        <th>Hall</th>
                        <th>Scanned Time</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody id="live-logs-body">
                      {attendanceList.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Waiting for candidate scans...</td>
                        </tr>
                      ) : (
                        attendanceList.map((s, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 700, color: 'white' }}>{s.rollNo}</td>
                            <td>{s.studentName}</td>
                            <td>{s.teacherId}</td>
                            <td><span className="status-badge status-present">{s.hall}</span></td>
                            <td style={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
                              {s.scannedAt
                                ? (typeof s.scannedAt.toDate === 'function'
                                  ? s.scannedAt.toDate().toLocaleTimeString()
                                  : new Date(s.scannedAt).toLocaleTimeString())
                                : '—'}
                            </td>
                            <td>
                              <span style={{ fontSize: '0.85rem', color: s.remarks && s.remarks !== 'nil' ? '#fbbf24' : 'var(--text-muted)' }}>
                                {s.remarks || 'nil'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>


              <div className="panel">
                <div className="panel-title">Hall Breakdown Registry</div>
                <div className="table-container" style={{ marginBottom: '1.5rem' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Hall Name</th>
                        <th>Assigned Invigilators</th>
                        <th>Present Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeHalls.length === 0 ? (
                        <tr>
                          <td colSpan="3" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>No active drive data.</td>
                        </tr>
                      ) : (
                        activeHalls.map((hall, idx) => {
                          const hName = typeof hall === 'string' ? hall : hall.name;
                          const invs = hallTeachersMap[hName]?.length > 0 ? hallTeachersMap[hName].join(', ') : 'None assigned';
                          return (
                            <tr key={idx}>
                              <td style={{ fontWeight: 700, color: 'white' }}>{hName}</td>
                              <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{invs}</td>
                              <td style={{ fontWeight: 700, color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>{hallPresentCountMap[hName] || 0} present</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: '0.5rem',
                    width: '100%',
                  }}
                >
                  <button
                    onClick={handleBulkSendRMEmail}
                    className="btn btn-primary"
                    style={{
                      flex: 1,
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      border: 'none',
                      fontSize: '0.95rem',
                      height: '45px',
                    }}
                  >
                    Manage Student Emails
                  </button>

                  <button
                    onClick={handleBulkSendTeacherEmail}
                    className="btn btn-success"
                    style={{
                      flex: 1,
                      fontSize: '0.95rem',
                      height: '45px',
                      backgroundColor: 'hotpink',
                    }}
                  >
                    Bulk Send Passcodes
                  </button>

                  <button
                    onClick={handleExportCSV}
                    className="btn btn-success"
                    style={{ flex: 1 }}
                  >
                    Export CSV Report
                  </button>

                  <button
                    onClick={handleResetLogs}
                    className="btn btn-secondary"
                    style={{
                      flex: 1,
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      color: 'var(--error)',
                    }}
                  >
                    Reset Drive Logs
                  </button>

                  <button
                    onClick={handleFinalizeDrive}
                    className="btn btn-danger"
                    style={{ flex: 1 }}
                  >
                    Finalize Drive
                  </button>

                  <button
                    onClick={handleDisplayPasscodes}
                    className="btn bg-orange-400"
                    style={{ flex: 1 }}
                  >
                    Display Passcodes
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

      </main>


      {isQrModalOpen && (
        <div id="qr-email-modal" className="modal-overlay" style={{ display: 'flex', position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.8)', zIndex: 1000, justifyContent: 'center', alignItems: 'center', padding: '1rem', backdropFilter: 'blur(4px)' }}>
          <div className="modal-card" style={{ background: 'var(--panel-bg)', width: '100%', maxWidth: '960px', borderRadius: '24px', border: '1px solid var(--border-color)', padding: '2rem', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', maxHeight: '90vh' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.35rem', color: 'var(--text-light)' }}>Student Notification Portal</h2>
                <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Search and dispatch batch email notifications to registered students</p>
              </div>
              <button
                onClick={() => {
                  setIsQrModalOpen(false);
                  setBatchStatus({ active: false, title: '', current: 0, total: 0, logs: [] });
                }}
                className="btn-icon-close"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>


            <div className="qr-toolbar" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search Roll No or Name..."
                style={{ width: '260px', fontSize: '0.85rem' }}
                value={qrSearchQuery}
                onChange={(e) => setQrSearchQuery(e.target.value)}
              />
              <button
                onClick={handleBulkSendRMEmail}
                className="btn btn-primary"
                style={{ background: 'linear-gradient(135deg, #4f46e5, #3b82f6)', border: 'none', fontSize: '0.85rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                Send Bulk Email Notifications ({filteredStudentsForQR.length})
              </button>
            </div>
            {batchStatus.active && (
              <div id="batch-email-status-panel" className="batch-status-panel" style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.9rem', color: 'white' }}>{batchStatus.title}</strong>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)' }}>{batchStatus.current}/{batchStatus.total}</span>
                </div>
                <div className="progress-bar-container" style={{ backgroundColor: 'var(--border-color)', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                  <div style={{ width: `${Math.round((batchStatus.current / batchStatus.total) * 100)}%`, height: '100%', background: 'linear-gradient(to right, #6366f1, #3b82f6)', transition: 'width 0.2s ease' }}></div>
                </div>
                <div style={{ maxHeight: '100px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  {batchStatus.logs.map((log, idx) => (
                    <p key={idx} style={{ margin: '2px 0' }}>{log}</p>
                  ))}
                </div>
              </div>
            )}


            <div id="qr-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', overflowY: 'auto', padding: '0.5rem', flexGrow: 1 }}>
              {filteredStudentsForQR.length === 0 ? (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No registered students found matching filter criteria.
                </div>
              ) : (
                filteredStudentsForQR.map((s, idx) => {
                  return (
                    <div key={idx} className="qr-card" style={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                      <div style={{ fontWeight: 700, color: 'white', fontSize: '0.95rem' }}>{s.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{s.rollNo}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.email}</div>

                      <div style={{ margin: '1rem 0', background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.15)', borderRadius: '12px', width: '156px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                          <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                      </div>

                      <div style={{ width: '100%' }}>
                        <button className="btn btn-primary" style={{ width: '100%', minHeight: '32px', height: '32px', fontSize: '0.8rem', background: 'linear-gradient(135deg, #6366f1, #3b82f6)', border: 'none', borderRadius: '8px', fontWeight: 600 }} onClick={() => handleSendSingleRMEmail(s)}>Send Email</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {isPasscodeModalOpen && (
        <div id="passcodes-modal" className="modal-overlay" style={{ display: 'flex', position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.8)', zIndex: 1000, justifyContent: 'center', alignItems: 'center', padding: '1rem', backdropFilter: 'blur(4px)' }}>
          <div className="modal-card" style={{ background: 'var(--panel-bg)', width: '100%', maxWidth: '960px', borderRadius: '24px', border: '1px solid var(--border-color)', padding: '2rem', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', maxHeight: '90vh' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.35rem', color: 'var(--text-light)' }}>Invigilator Passcodes Portal</h2>
                <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>View, copy, or reference login credentials for assigned teachers</p>
              </div>
              <button
                onClick={() => {
                  setIsPasscodeModalOpen(false);
                  setPasscodeSearchQuery('');
                }}
                className="btn-icon-close"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <div className="qr-toolbar" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search Teacher Name or Hall..."
                style={{ width: '260px', fontSize: '0.85rem' }}
                value={passcodeSearchQuery}
                onChange={(e) => setPasscodeSearchQuery(e.target.value)}
              />
            </div>

            {isFetchingPasscodes ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexGrow: 1, gap: '1rem', padding: '3rem 0' }}>
                <div style={{ width: '40px', height: '40px', border: '4px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%' }} className="animate-spin"></div>
                <p style={{ color: 'var(--text-muted)' }}>Retrieving secure passcodes...</p>
              </div>
            ) : (
              <div className="table-container" style={{ flexGrow: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Invigilator Name</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Assigned Hall</th>
                      <th>Login Passcode</th>
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teachersWithPasscodes.filter(t => {
                      const q = passcodeSearchQuery.toLowerCase().trim();
                      if (!q) return true;
                      return (
                        (t.name || '').toLowerCase().includes(q) ||
                        (t.assignedHall || '').toLowerCase().includes(q) ||
                        (t.phone || '').toLowerCase().includes(q) ||
                        (t.email || '').toLowerCase().includes(q)
                      );
                    }).length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                          No invigilators found.
                        </td>
                      </tr>
                    ) : (
                      teachersWithPasscodes
                        .filter(t => {
                          const q = passcodeSearchQuery.toLowerCase().trim();
                          if (!q) return true;
                          return (
                            (t.name || '').toLowerCase().includes(q) ||
                            (t.assignedHall || '').toLowerCase().includes(q) ||
                            (t.phone || '').toLowerCase().includes(q) ||
                            (t.email || '').toLowerCase().includes(q)
                          );
                        })
                        .map((t, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 600, color: 'white' }}>{t.name}</td>
                            <td style={{ fontSize: '0.85rem' }}>{t.phone}</td>
                            <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t.email || '—'}</td>
                            <td>
                              <span className="status-badge" style={{ textTransform: 'none', backgroundColor: 'rgba(255, 115, 119, 0.1)', border: '1px solid rgba(255, 115, 119, 0.3)', color: '#FF7377' }}>
                                {t.assignedHall || '—'}
                              </span>
                            </td>
                            <td style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 'bold', color: '#FF7377', letterSpacing: '1px' }}>
                              {t.passcode}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                className="btn btn-secondary"
                                style={{ minHeight: '28px', height: '28px', fontSize: '0.75rem', padding: '0 0.5rem' }}
                                onClick={() => {
                                  navigator.clipboard.writeText(t.passcode);
                                  alert(`Passcode for ${t.name} copied to clipboard!`);
                                }}
                              >
                                Copy
                              </button>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {isRMLoginModalOpen && (
        <div id="rm-login-modal" className="modal-overlay" style={{ display: 'flex', position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.8)', zIndex: 1000, justifyContent: 'center', alignItems: 'center', padding: '1rem', backdropFilter: 'blur(4px)' }}>
          <div className="modal-card" style={{ background: 'var(--panel-bg)', width: '100%', maxWidth: '450px', borderRadius: '24px', border: '1px solid var(--border-color)', padding: '2rem', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-light)' }}>RM Portal Authentication</h2>
                <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Enter credentials to obtain external API access tokens</p>
              </div>
              <button
                onClick={() => setIsRMLoginModalOpen(false)}
                className="btn-icon-close"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="rm-email-input" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>RM Portal Email</label>
              <input
                type="email"
                id="rm-email-input"
                className="form-control"
                placeholder=""
                value={rmLoginCreds.email}
                onChange={(e) => setRMLoginCreds({ ...rmLoginCreds, email: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="rm-pwd-input" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>RM Portal Password</label>
              <input
                type="password"
                id="rm-pwd-input"
                className="form-control"
                placeholder="••••••••••••"
                value={rmLoginCreds.password}
                onChange={(e) => setRMLoginCreds({ ...rmLoginCreds, password: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>

            <button
              onClick={async () => {
                if (!rmLoginCreds.email || !rmLoginCreds.password) {
                  alert('Please enter both email and password.');
                  return;
                }
                try {
                  const res = await getRMAccessToken(rmLoginCreds);
                  if (res.success && res.token) {
                    setRMAccessTokenState(res.token);
                    alert('Authenticated successfully! Access Token obtained and saved for session.');
                    setIsRMLoginModalOpen(false);
                  } else {
                    alert(`Authentication failed: ${res.error || 'Invalid credentials'}`);
                  }
                } catch (err) {
                  alert(`Error authenticating: ${err.message}`);
                }
              }}
              className="btn btn-danger"
              style={{
                width: '100%',
                height: '42px',
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
              Authenticate & Save Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const AdminConsole = dynamic(() => Promise.resolve(AdminConsoleComponent), {
  ssr: false,
});

export default AdminConsole;
