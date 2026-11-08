/** 键盘与鼠标输入。pressed() 只在按下的那一帧为 true。 */
export class Input {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  private dragging = false;
  locked = false;
  enabled = true;

  constructor(private el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.dragging = true;
      if (e.button === 0 && this.enabled && !this.locked) {
        try { const p = (el as any).requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch { /* 有些环境不允许鼠标锁定，改用右键拖动 */ }
      }
    });
    addEventListener('mouseup', (e) => { if (e.button === 2) this.dragging = false; });
    addEventListener('mousemove', (e) => {
      if (this.locked || this.dragging) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el; });
  }

  down(code: string) { return this.enabled && this.keys.has(code); }
  pressed(code: string) { return this.enabled && this.justPressed.has(code); }
  /** 每帧结束时调用 */
  endFrame() { this.justPressed.clear(); }
  /** 每个渲染帧读取镜头输入后调用 */
  consumeMouse() { this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0; }
  releaseLock() { if (this.locked) document.exitPointerLock(); }
}
