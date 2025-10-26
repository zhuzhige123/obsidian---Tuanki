/**
 * 庆祝音效服务
 * 使用 Web Audio API 合成轻快的成就解锁音效
 */

export class CelebrationSound {
  private audioContext: AudioContext | null = null;
  private volume: number = 0.5;
  private isPlaying: boolean = false;

  /**
   * 播放庆祝音效
   */
  async play(volume: number = this.volume): Promise<void> {
    if (this.isPlaying) return;
    
    try {
      // 创建音频上下文
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      this.isPlaying = true;
      this.volume = Math.max(0, Math.min(1, volume));

      const ctx = this.audioContext;
      const now = ctx.currentTime;

      // 主增益节点
      const masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
      masterGain.gain.setValueAtTime(this.volume, now);

      // 🎹 音效序列：快速上升琶音 + 明亮和弦
      
      // 音符频率（C大调）
      const notes = [
        523.25,  // C5
        659.25,  // E5
        783.99,  // G5
        1046.50  // C6
      ];

      // 1. 快速上升琶音 (0.0s - 0.4s)
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.1);
        
        gain.gain.setValueAtTime(0, now + i * 0.1);
        gain.gain.linearRampToValueAtTime(0.3, now + i * 0.1 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.2);
        
        osc.connect(gain);
        gain.connect(masterGain);
        
        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 0.3);
      });

      // 2. 明亮和弦 (0.4s - 1.0s)
      const chordFreqs = [523.25, 659.25, 783.99]; // C-E-G
      chordFreqs.forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + 0.4);
        
        gain.gain.setValueAtTime(0, now + 0.4);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.45);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
        
        osc.connect(gain);
        gain.connect(masterGain);
        
        osc.start(now + 0.4);
        osc.stop(now + 1.0);
      });

      // 3. 星光音效 (0.6s - 1.0s)
      const shimmerOsc = ctx.createOscillator();
      const shimmerGain = ctx.createGain();
      
      shimmerOsc.type = 'sine';
      shimmerOsc.frequency.setValueAtTime(2093, now + 0.6); // C7
      
      shimmerGain.gain.setValueAtTime(0, now + 0.6);
      shimmerGain.gain.linearRampToValueAtTime(0.15, now + 0.65);
      shimmerGain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
      
      shimmerOsc.connect(shimmerGain);
      shimmerGain.connect(masterGain);
      
      shimmerOsc.start(now + 0.6);
      shimmerOsc.stop(now + 1.0);

      // 清理标志
      setTimeout(() => {
        this.isPlaying = false;
      }, 1200);

    } catch (error) {
      console.error('[CelebrationSound] 播放失败:', error);
      this.isPlaying = false;
    }
  }

  /**
   * 停止播放
   */
  stop(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isPlaying = false;
  }

  /**
   * 设置音量
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * 销毁实例
   */
  destroy(): void {
    this.stop();
  }
}

// 单例实例
let instance: CelebrationSound | null = null;

/**
 * 获取庆祝音效服务单例
 */
export function getCelebrationSound(): CelebrationSound {
  if (!instance) {
    instance = new CelebrationSound();
  }
  return instance;
}


