/**
 * URL/展示层 dir 处理：宿主完整目录不暴露到地址栏
 * - API 内部仍使用绝对路径（flowspecDir），保证后端解析正确
 * - 展示层仅显示相对、简洁的目录名
 */

export function isAbsoluteDir(dir: string): boolean {
  if (!dir) return false;
  // POSIX absolute
  if (dir.startsWith('/')) return true;
  // Windows absolute C:\ or \\ 
  if (/^[a-zA-Z]:[\\/]/.test(dir)) return true;
  if (dir.startsWith('\\\\')) return true;
  // 包含宿主典型路径特征（如 /home/ /Users/ /var/）且较长，视为绝对
  if (dir.includes('/') && dir.split('/').length > 3 && (dir.includes('/home/') || dir.includes('/Users/') || dir.includes('/var/'))) return true;
  return false;
}

export function displayDir(dir: string): string {
  if (!dir) return 'flowspec';
  if (!isAbsoluteDir(dir)) return dir;
  // 绝对路径 -> 仅取末级目录名，兜底 flowspec
  const parts = dir.replace(/\\/g, '/').split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? 'flowspec';
  // 若末级不是 flowspec 相关，仍返回 flowspec 以避免暴露完整宿主结构
  if (last === 'flowspec' || last.length <= 32) return last || 'flowspec';
  return 'flowspec';
}

/** 清理地址栏：移除或相对化绝对 dir，保留 id/holder/api 等非敏感参数 */
export function cleanUrlDirParam(): void {
  try {
    const u = new URL(window.location.href);
    const dir = u.searchParams.get('dir');
    if (!dir) return;
    if (isAbsoluteDir(dir)) {
      // 策略：移除绝对 dir，预览默认即 flowspec，无需暴露宿主路径
      // 若需保留，则改为相对 displays；此处选择移除，最干净
      u.searchParams.delete('dir');
      // 同时若仍需语义，可改为 u.searchParams.set('dir', displayDir(dir));
      window.history.replaceState(null, '', u.toString());
    }
  } catch {}
}

/** 切换 flow 时保持 URL 整洁：仅设置 id，不回写绝对 dir */
export function pushCleanUrl(nextId: string): void {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('id', nextId);
    // 若当前 URL 仍带绝对 dir，顺便清理
    const dir = u.searchParams.get('dir');
    if (dir && isAbsoluteDir(dir)) {
      u.searchParams.delete('dir');
    }
    window.history.pushState(null, '', u.toString());
  } catch {}
}
