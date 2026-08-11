import { loginUser, logoutUser } from './authActions';

export const Auth = {
  isAdminAuthenticated() {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('exam_attendance_auth') === 'true' &&
      sessionStorage.getItem('exam_attendance_role') === 'admin';
  },

  isTeacherAuthenticated() {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('exam_attendance_auth') === 'true' &&
      sessionStorage.getItem('exam_attendance_role') === 'invigilator' &&
      sessionStorage.getItem('teacherId') !== null;
  },

  async login(passcode, role) {
    const result = await loginUser(passcode, role);
    if (!result.success) {
      throw new Error(result.error || "Failed to verify. Please try again.");
    }

    if (typeof window !== "undefined") {
      sessionStorage.setItem("exam_attendance_role", result.role);
      sessionStorage.setItem("exam_attendance_auth", "true");
      if (result.role === "admin") {
        sessionStorage.removeItem("teacherId");
        sessionStorage.removeItem("teacherName");
        sessionStorage.removeItem("teacherHall");
        sessionStorage.removeItem("teacherDriveId");
      } else {
        sessionStorage.setItem("teacherId", result.id);
        sessionStorage.setItem("teacherName", result.name);
        sessionStorage.setItem("teacherHall", result.hall || '');
        sessionStorage.setItem("teacherDriveId", result.driveId || '');
      }
    }

    return result;
  },

  async logout(router = null, redirectUrl = '/') {
    try {
      await logoutUser();
    } catch (err) {
      console.error("Logout server action failed:", err);
    }
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('exam_attendance_role');
      sessionStorage.removeItem('exam_attendance_auth');
      sessionStorage.removeItem('teacherId');
      sessionStorage.removeItem('teacherName');
      sessionStorage.removeItem('teacherHall');
      sessionStorage.removeItem('teacherDriveId');

      if (redirectUrl) {
        if (router) {
          router.push(redirectUrl);
        } else {
          window.location.href = redirectUrl;
        }
      }
    }
  }
};

