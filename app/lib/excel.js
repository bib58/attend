import * as XLSX from 'xlsx';
import { extractRollNoFromEmail, normalizePhoneNumber } from './utils';

export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}



export function parseStudentExcel(rows) {
  if (!rows || rows.length === 0) return [];
  
  let nameIdx = 0;
  let rollIdx = 1;
  let emailIdx = 2;
  
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i];
    if (!row) continue;
    const hasName = row.some(cell => cell !== undefined && cell !== null && String(cell).toLowerCase().includes('name'));
    const hasRoll = row.some(cell => cell !== undefined && cell !== null && (String(cell).toLowerCase().includes('roll') || String(cell).toLowerCase().includes('roll no') || String(cell).toLowerCase().includes('roll number')));
    const hasEmail = row.some(cell => cell !== undefined && cell !== null && String(cell).toLowerCase().includes('email'));
    if (hasName || hasRoll || hasEmail) {
      headerRowIndex = i;
      row.forEach((cell, idx) => {
        if (cell === undefined || cell === null) return;
        const val = String(cell).toLowerCase();
        if (val.includes('name')) nameIdx = idx;
        else if (val.includes('roll')) rollIdx = idx;
        else if (val.includes('email')) emailIdx = idx;
      });
      break;
    }
  }
  
  const startRow = headerRowIndex + 1;
  const students = [];
  
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    const name = row[nameIdx] !== undefined && row[nameIdx] !== null ? String(row[nameIdx]).trim() : '';
    let rollNo = row[rollIdx] !== undefined && row[rollIdx] !== null ? String(row[rollIdx]).trim().toUpperCase() : '';
    const email = row[emailIdx] !== undefined && row[emailIdx] !== null ? String(row[emailIdx]).trim().toLowerCase() : '';
    
    if (!rollNo && email) {
      rollNo = extractRollNoFromEmail(email);
    }
    
    if (rollNo || name) {
      students.push({ name, rollNo, email });
    }
  }
  
  return students;
}

export function parseTeacherExcel(rows) {
  if (!rows || rows.length === 0) return [];
  
  let nameIdx = 0;
  let phoneIdx = 1;
  let emailIdx = 2;
  
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i];
    if (!row) continue;
    const hasName = row.some(cell => cell !== undefined && cell !== null && String(cell).toLowerCase().includes('name'));
    const hasPhone = row.some(cell => cell !== undefined && cell !== null && (String(cell).toLowerCase().includes('phone') || String(cell).toLowerCase().includes('mobile') || String(cell).toLowerCase().includes('contact')));
    const hasEmail = row.some(cell => cell !== undefined && cell !== null && String(cell).toLowerCase().includes('email'));
    if (hasName || hasPhone || hasEmail) {
      headerRowIndex = i;
      row.forEach((cell, idx) => {
        if (cell === undefined || cell === null) return;
        const val = String(cell).toLowerCase();
        if (val.includes('name')) nameIdx = idx;
        else if (val.includes('phone') || val.includes('mobile') || val.includes('contact')) phoneIdx = idx;
        else if (val.includes('email')) emailIdx = idx;
      });
      break;
    }
  }
  
  const startRow = headerRowIndex + 1;
  const teachers = [];
  
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    const name = row[nameIdx] !== undefined && row[nameIdx] !== null ? String(row[nameIdx]).trim() : '';
    let phone = row[phoneIdx] !== undefined && row[phoneIdx] !== null ? String(row[phoneIdx]).trim() : '';
    let email = row[emailIdx] !== undefined && row[emailIdx] !== null ? String(row[emailIdx]).trim().toLowerCase() : '';
    
    if (name) {
      phone = normalizePhoneNumber(phone);
      teachers.push({ name, phone, email });
    }
  }
  
  return teachers;
}
