/**
 * 编辑器初始化管理器
 * 解决多编辑器实例的竞态条件问题
 */

export interface InitializationOptions {
  /** 编辑器ID */
  editorId: string;
  /** 初始化延迟（毫秒） */
  delay?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
}

export interface InitializationResult {
  success: boolean;
  error?: string;
  retryCount?: number;
  duration?: number;
}

/**
 * 初始化状态
 */
export enum InitializationState {
  IDLE = 'idle',
  PENDING = 'pending',
  INITIALIZING = 'initializing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ABORTED = 'aborted'
}

/**
 * 初始化进程信息
 */
interface InitializationProcess {
  editorId: string;
  state: InitializationState;
  promise: Promise<boolean>;
  abortController: AbortController;
  startTime: number;
  retryCount: number;
  options: InitializationOptions;
}

/**
 * 全局编辑器初始化管理器
 * 单例模式，确保所有编辑器实例的初始化都通过统一管理
 */
export class EditorInitializationManager {
  private static instance: EditorInitializationManager;
  private processes = new Map<string, InitializationProcess>();
  private readonly maxConcurrentInitializations = 3;

  private constructor() {}

  static getInstance(): EditorInitializationManager {
    if (!EditorInitializationManager.instance) {
      EditorInitializationManager.instance = new EditorInitializationManager();
    }
    return EditorInitializationManager.instance;
  }

  /**
   * 安全初始化编辑器
   */
  async safeInitialize(
    editorId: string,
    initializeFn: (signal: AbortSignal) => Promise<void>,
    options: Partial<InitializationOptions> = {}
  ): Promise<InitializationResult> {
    const fullOptions: InitializationOptions = {
      editorId,
      delay: 0,
      timeout: 10000,
      maxRetries: 2,
      ...options
    };

    // 检查是否已有进程在运行
    const existingProcess = this.processes.get(editorId);
    if (existingProcess) {
      if (existingProcess.state === InitializationState.COMPLETED) {
        return { success: true, duration: 0 };
      }
      
      if (existingProcess.state === InitializationState.INITIALIZING) {
        console.log(`EditorInitManager: 等待现有初始化进程 [${editorId}]`);
        try {
          const success = await existingProcess.promise;
          return { 
            success, 
            duration: Date.now() - existingProcess.startTime,
            retryCount: existingProcess.retryCount
          };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error),
            retryCount: existingProcess.retryCount
          };
        }
      }
    }

    // 检查并发限制
    const activeProcesses = Array.from(this.processes.values())
      .filter(p => p.state === InitializationState.INITIALIZING);
    
    if (activeProcesses.length >= this.maxConcurrentInitializations) {
      console.warn(`EditorInitManager: 达到最大并发初始化限制 (${this.maxConcurrentInitializations})`);
      return { 
        success: false, 
        error: '达到最大并发初始化限制，请稍后重试' 
      };
    }

    // 创建新的初始化进程
    return await this.createInitializationProcess(editorId, initializeFn, fullOptions);
  }

  /**
   * 创建初始化进程
   */
  private async createInitializationProcess(
    editorId: string,
    initializeFn: (signal: AbortSignal) => Promise<void>,
    options: InitializationOptions
  ): Promise<InitializationResult> {
    const abortController = new AbortController();
    const startTime = Date.now();

    const process: InitializationProcess = {
      editorId,
      state: InitializationState.PENDING,
      promise: this.executeInitialization(editorId, initializeFn, abortController.signal, options),
      abortController,
      startTime,
      retryCount: 0,
      options
    };

    this.processes.set(editorId, process);

    try {
      process.state = InitializationState.INITIALIZING;
      const success = await process.promise;
      
      process.state = success ? InitializationState.COMPLETED : InitializationState.FAILED;
      
      return {
        success,
        duration: Date.now() - startTime,
        retryCount: process.retryCount
      };
    } catch (error) {
      process.state = InitializationState.FAILED;
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        retryCount: process.retryCount
      };
    } finally {
      // 延迟清理进程信息，允许其他调用者检查状态
      setTimeout(() => {
        if (process.state !== InitializationState.INITIALIZING) {
          this.processes.delete(editorId);
        }
      }, 1000);
    }
  }

  /**
   * 执行初始化逻辑
   */
  private async executeInitialization(
    editorId: string,
    initializeFn: (signal: AbortSignal) => Promise<void>,
    signal: AbortSignal,
    options: InitializationOptions
  ): Promise<boolean> {
    let retryCount = 0;
    const maxRetries = options.maxRetries || 2;

    while (retryCount <= maxRetries) {
      try {
        // 检查是否被中止
        if (signal.aborted) {
          console.log(`EditorInitManager: 初始化被中止 [${editorId}]`);
          return false;
        }

        // 添加延迟（仅第一次尝试）
        if (retryCount === 0 && options.delay && options.delay > 0) {
          await this.delay(options.delay, signal);
        }

        // 添加重试延迟（重试时）
        if (retryCount > 0) {
          const retryDelay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
          await this.delay(retryDelay, signal);
        }

        // 再次检查是否被中止
        if (signal.aborted) {
          console.log(`EditorInitManager: 初始化在延迟后被中止 [${editorId}]`);
          return false;
        }

        // 执行初始化
        console.log(`EditorInitManager: 开始初始化 [${editorId}] (尝试 ${retryCount + 1}/${maxRetries + 1})`);
        
        await Promise.race([
          initializeFn(signal),
          this.createTimeoutPromise(options.timeout || 10000, signal)
        ]);

        // 最终检查是否被中止
        if (signal.aborted) {
          console.log(`EditorInitManager: 初始化在完成后被中止 [${editorId}]`);
          return false;
        }

        console.log(`EditorInitManager: 初始化成功 [${editorId}]`);
        return true;

      } catch (error) {
        retryCount++;
        const process = this.processes.get(editorId);
        if (process) {
          process.retryCount = retryCount;
        }

        if (signal.aborted) {
          console.log(`EditorInitManager: 初始化被中止（错误处理中） [${editorId}]`);
          return false;
        }

        console.error(`EditorInitManager: 初始化失败 [${editorId}] (尝试 ${retryCount}/${maxRetries + 1}):`, error);

        if (retryCount > maxRetries) {
          throw error;
        }
      }
    }

    return false;
  }

  /**
   * 中止编辑器初始化
   */
  abortInitialization(editorId: string): boolean {
    const process = this.processes.get(editorId);
    if (process && process.state === InitializationState.INITIALIZING) {
      console.log(`EditorInitManager: 中止初始化 [${editorId}]`);
      process.abortController.abort();
      process.state = InitializationState.ABORTED;
      return true;
    }
    return false;
  }

  /**
   * 获取初始化状态
   */
  getInitializationState(editorId: string): InitializationState {
    const process = this.processes.get(editorId);
    return process ? process.state : InitializationState.IDLE;
  }

  /**
   * 清理所有进程
   */
  cleanup(): void {
    for (const [editorId, process] of this.processes) {
      if (process.state === InitializationState.INITIALIZING) {
        process.abortController.abort();
      }
    }
    this.processes.clear();
  }

  /**
   * 创建延迟Promise
   */
  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Aborted'));
        return;
      }

      const timeoutId = setTimeout(() => {
        resolve();
      }, ms);

      signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        reject(new Error('Aborted'));
      });
    });
  }

  /**
   * 创建超时Promise
   */
  private createTimeoutPromise(timeout: number, signal: AbortSignal): Promise<never> {
    return new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`初始化超时 (${timeout}ms)`));
      }, timeout);

      signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
      });
    });
  }
}

/**
 * 获取全局初始化管理器实例
 */
export function getEditorInitializationManager(): EditorInitializationManager {
  return EditorInitializationManager.getInstance();
}
