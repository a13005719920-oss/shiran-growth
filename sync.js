/* ===== 安全的本机保存模式 =====
 *
 * 旧版曾在浏览器中接收 GitHub Personal Access Token，并直接调用
 * GitHub Contents API。浏览器无法安全保存写入凭证，因此该方案已停用。
 *
 * app.js 仍会调用 initSync() 和 pushToCloud()；这里保留兼容接口，
 * 让现有打卡、积分和 localStorage 持久化继续正常工作。
 */

const LOCAL_SYNC_TOKEN_KEY = 'shiran_sync_token';

function initSyncIndicator() {
  const el = document.createElement('div');
  el.id = 'syncIndicator';
  el.dataset.state = 'local';
  // 放在顶栏右侧（带 🔥 连续打卡胶囊旁边），做成同款胶囊样式。
  // 原来固定在 top:8px right:12px，会和顶栏右侧胶囊叠在一起，所以改成顶栏内的元素。
  el.style.cssText = 'display:inline-flex;align-items:center;gap:3px;font-size:11px;line-height:1.6;padding:4px 9px;border-radius:20px;background:rgba(255,255,255,.18);color:#fff;white-space:nowrap;pointer-events:none';
  el.innerHTML = '<span id="syncIcon">💾</span><span id="syncText">本机保存</span>';
  const right = document.querySelector('.tb-right');
  if (right) { right.insertBefore(el, right.firstChild); }
  else {
    el.style.position = 'fixed';
    el.style.top = '8px'; el.style.right = '12px'; el.style.zIndex = '500';
    document.body.appendChild(el);
  }
  return el;
}

function setSyncStatus(icon, text) {
  const ic = document.getElementById('syncIcon');
  const tx = document.getElementById('syncText');
  if (ic) ic.textContent = icon;
  if (tx) tx.textContent = text;
}

async function initSync() {
  // 清除旧版可能残留在当前浏览器里的已撤销凭证。
  // 隐私模式下 localStorage 读取会抛错，包一层避免启动流程被中断。
  try { localStorage.removeItem(LOCAL_SYNC_TOKEN_KEY); } catch {}
  initSyncIndicator();
  setSyncStatus('💾', '本机保存');
}

function pushToCloud() {
  // 云同步暂停。本机数据仍由 app.js 保存到 localStorage。
}
