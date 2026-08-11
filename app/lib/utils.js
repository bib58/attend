export function normalizePhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned}`;
  }
  return cleaned;
}

export function parseCandidateRow(rawLine) {
  if (!rawLine) return null;
  const line = rawLine.replace(/['"]/g, '').trim();
  if (!line) return null;

  const lower = line.toLowerCase();
  if (lower.includes('name') && (lower.includes('roll') || lower.includes('email'))) {
    return null;
  }

  let name = '';
  let rollNo = '';
  let email = '';
  let parts = [];

  if (line.includes('\t')) {
    parts = line.split('\t').map(p => p.trim());
  } else if (line.includes(',')) {
    parts = line.split(',').map(p => p.trim());
  } else if (line.includes(';')) {
    parts = line.split(';').map(p => p.trim());
  } else {
   
    const tokens = line.split(/\s+/).filter(t => t.length > 0);
    const emailIdx = tokens.findIndex(t => t.includes('@'));
    if (emailIdx !== -1) {
      email = tokens[emailIdx].toLowerCase();
      tokens.splice(emailIdx, 1);
    }

    let bestRollIdx = -1;
    let highestScore = -1;

    tokens.forEach((t, idx) => {
      const isOrdinal = /^\d+(?:st|nd|rd|th)$/i.test(t);
      const hasDigitOrSlash = /\d/.test(t) || t.includes('/');
      if (hasDigitOrSlash && !isOrdinal) {
        let score = 0;
        if (t.includes('/')) score += 10;
        const digitsCount = (t.match(/\d/g) || []).length;
        score += digitsCount * 2;
        score += t.length;

        if (score > highestScore) {
          highestScore = score;
          bestRollIdx = idx;
        }
      }
    });

    if (bestRollIdx !== -1) {
      rollNo = tokens[bestRollIdx].toUpperCase();
      tokens.splice(bestRollIdx, 1);
    }

    name = tokens.join(' ');
    if (!rollNo && email) {
      rollNo = extractRollNoFromEmail(email);
    }

    if (rollNo) {
      return { name, rollNo, email };
    }
    return null;
  }

  parts = parts.filter(p => p.length > 0);

  if (parts.length >= 3) {
    name = parts[0];
    rollNo = parts[1].toUpperCase();
    email = parts[2].toLowerCase();
  } else if (parts.length === 2) {
    if (parts[1].includes('@')) {
      email = parts[1].toLowerCase();
      if (/\d/.test(parts[0]) || parts[0].includes('/')) {
        rollNo = parts[0].toUpperCase();
      } else {
        name = parts[0];
        rollNo = extractRollNoFromEmail(email);
      }
    } else if (parts[0].includes('@')) {
      email = parts[0].toLowerCase();
      rollNo = parts[1].toUpperCase();
    } else {
      name = parts[0];
      rollNo = parts[1].toUpperCase();
    }
  } else if (parts.length === 1) {
    const item = parts[0];
    if (item.includes('@')) {
      email = item.toLowerCase();
      rollNo = extractRollNoFromEmail(email);
    } else {
      rollNo = item.toUpperCase();
    }
  }

  if (!rollNo && email) {
    rollNo = extractRollNoFromEmail(email);
  }

  if (rollNo) {
    return { name, rollNo, email };
  }
  return null;
}

export function extractRollNoFromEmail(email) {
  if (!email || !email.includes('@')) return email ? email.trim().toUpperCase() : '';
  const prefix = email.split('@')[0].trim();
  const parts = prefix.split(/[_.-]+/);
  const alphanumRoll = parts.find(p => /^[a-zA-Z0-9]+$/.test(p) && /\d/.test(p) && /[a-zA-Z]/.test(p));
  if (alphanumRoll) return alphanumRoll.toUpperCase();
  const digitRoll = parts.find(p => /^\d{3,}$/.test(p));
  if (digitRoll) return digitRoll.toUpperCase();
  const lastPart = parts[parts.length - 1];
  return (lastPart || prefix).toUpperCase();
}

export function parseCandidateInputs(str) {
  if (!str) return [];
  const lines = str.split(/[\r\n]+/);
  const candidates = [];
  lines.forEach(rawLine => {
    const candidate = parseCandidateRow(rawLine);
    if (candidate) {
      candidates.push(candidate);
    }
  });
  return candidates;
}

export function parseTeachersInput(str) {
  if (!str) return [];
  const lines = str.split(/[\r\n]+/);
  const teachers = [];
  let headerSkipped = false;
  lines.forEach(line => {
    if (!line.trim()) return;
    
    const lower = line.toLowerCase();
    if (!headerSkipped && (lower.includes('name') || lower.includes('phone') || lower.includes('email'))) {
      headerSkipped = true;
      return;
    }

    const parts = line.split(',');
    const name = parts[0] ? parts[0].trim() : '';
    let phone = parts[1] ? parts[1].trim() : '';
    let email = parts[2] ? parts[2].trim().toLowerCase() : '';

    if (name) {
      phone = normalizePhoneNumber(phone);
      teachers.push({ name, phone, email });
    }
  });
  return teachers;
}

export function playSound(type) {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (type === 'success') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'warning') {
      const t1 = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.frequency.setValueAtTime(600, t1);
      gain1.gain.setValueAtTime(0.08, t1);
      gain1.gain.exponentialRampToValueAtTime(0.005, t1 + 0.08);
      osc1.start(t1);
      osc1.stop(t1 + 0.08);

      const t2 = t1 + 0.12;
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.setValueAtTime(600, t2);
      gain2.gain.setValueAtTime(0.08, t2);
      gain2.gain.exponentialRampToValueAtTime(0.005, t2 + 0.08);
      osc2.start(t2);
      osc2.stop(t2 + 0.08);
    } else if (type === 'error') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(110, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) {
    console.warn("Audio Context blocked or not supported:", e);
  }
}

export function generatePasscode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let passcode = '';
  for (let i = 0; i < 6; i++) {
    passcode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return passcode;
}
