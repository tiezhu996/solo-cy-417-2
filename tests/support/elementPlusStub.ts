// element-plus 在测试链路中只承担提示；桩记录调用，供断言“失败阶段稳定可辨”。
export interface ToastRecord {
  level: 'success' | 'warning' | 'error';
  message: string;
}

export const toastLog: ToastRecord[] = [];

export const ElMessage = {
  success(message: string) {
    toastLog.push({ level: 'success', message });
  },
  warning(message: string) {
    toastLog.push({ level: 'warning', message });
  },
  error(message: string) {
    toastLog.push({ level: 'error', message });
  },
  clear() {},
};
