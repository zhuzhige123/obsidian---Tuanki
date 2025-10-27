/**
 * 学习模式状态管理 Store
 * 管理学习界面的活跃实例控制（单例模式确保专注学习）
 */

import { writable, derived, get } from 'svelte/store';

/**
 * 学习模式状态接口
 */
export interface StudyModeState {
  /** 当前活跃的学习实例ID（确保单例） */
  activeInstanceId: string | null;
  
  /** 是否正在学习中 */
  isStudying: boolean;
}

/**
 * 初始状态
 */
const initialState: StudyModeState = {
  activeInstanceId: null,
  isStudying: false,
};

/**
 * 创建学习模式 Store
 */
function createStudyModeStore() {
  const { subscribe, set, update } = writable<StudyModeState>(initialState);
  
  return {
    subscribe,
    
    /**
     * 注册活跃的学习实例（单例模式）
     * @returns 是否成功注册（false表示已有活跃实例）
     */
    registerInstance: (instanceId: string): boolean => {
      const currentState = get({ subscribe });
      
      // 检查是否已有活跃实例
      if (currentState.activeInstanceId && currentState.activeInstanceId !== instanceId) {
        console.warn('[StudyModeStore] 已存在活跃的学习会话，拒绝注册:', currentState.activeInstanceId);
        return false;
      }
      
      update(state => ({
        ...state,
        activeInstanceId: instanceId,
        isStudying: true,
      }));
      
      console.log('[StudyModeStore] 学习会话已注册:', instanceId);
      return true;
    },
    
    /**
     * 注销学习实例
     */
    unregisterInstance: (instanceId: string) => {
      update(state => {
        // 只有匹配的实例才能注销
        if (state.activeInstanceId === instanceId) {
          console.log('[StudyModeStore] 学习会话已注销:', instanceId);
          return {
            ...state,
            activeInstanceId: null,
            isStudying: false,
          };
        }
        return state;
      });
    },
    
    /**
     * 获取当前状态（同步）
     */
    getState: (): StudyModeState => {
      return get({ subscribe });
    },
    
    /**
     * 检查是否有活跃的学习实例
     */
    hasActiveInstance: (): boolean => {
      const state = get({ subscribe });
      return state.activeInstanceId !== null;
    },
    
    /**
     * 获取活跃实例信息
     */
    getActiveInstance: (): { id: string } | null => {
      const state = get({ subscribe });
      if (state.activeInstanceId) {
        return { id: state.activeInstanceId };
      }
      return null;
    },
    
    /**
     * 重置状态
     */
    reset: () => {
      set(initialState);
      console.log('[StudyModeStore] 状态已重置');
    },
  };
}

/**
 * 学习模式 Store 实例
 */
export const studyModeStore = createStudyModeStore();

/**
 * 派生 Store：是否正在学习
 */
export const isStudying = derived(
  studyModeStore,
  ($state) => $state.isStudying
);

/**
 * 便捷函数：尝试开始学习会话
 * @param instanceId 实例ID
 * @returns 是否成功（false表示已有活跃会话）
 */
export function tryStartStudySession(instanceId: string): boolean {
  return studyModeStore.registerInstance(instanceId);
}

/**
 * 便捷函数：结束学习会话
 * @param instanceId 实例ID
 */
export function endStudySession(instanceId: string): void {
  studyModeStore.unregisterInstance(instanceId);
}
