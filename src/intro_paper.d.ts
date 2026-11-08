export interface PaperIntro { start(at?: number): void; skip(): void; stop(): void; setMuted(m: boolean): void; readonly TOTAL: number; readonly T: number }
export function prefetchIntroVoice(base: string): void;
export function mountPaperIntro(root: HTMLElement, opts: { audioBase?: string; muted?: boolean; voice?: boolean; onEnd?: () => void; onMute?: (m: boolean) => void }): PaperIntro;
