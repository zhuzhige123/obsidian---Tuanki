/**
 * 基于容器宽度的响应式工具
 * 用于 Obsidian 插件中根据标签页/侧边栏宽度自适应布局
 */

export interface ResponsiveBreakpoints {
  mobile: number;
  tablet: number;
  desktop: number;
}

export interface ResponsiveState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  breakpoint: 'mobile' | 'tablet' | 'desktop';
}

export const DEFAULT_BREAKPOINTS: ResponsiveBreakpoints = {
  mobile: 480,   // 小于480px为移动端
  tablet: 768,   // 480-768px为平板端
  desktop: 1024  // 大于768px为桌面端
};

/**
 * 根据容器宽度计算响应式状态
 */
export function getResponsiveState(
  width: number, 
  breakpoints: ResponsiveBreakpoints = DEFAULT_BREAKPOINTS
): ResponsiveState {
  const isMobile = width < breakpoints.mobile;
  const isTablet = width >= breakpoints.mobile && width < breakpoints.tablet;
  const isDesktop = width >= breakpoints.tablet;

  let breakpoint: 'mobile' | 'tablet' | 'desktop';
  if (isMobile) {
    breakpoint = 'mobile';
  } else if (isTablet) {
    breakpoint = 'tablet';
  } else {
    breakpoint = 'desktop';
  }

  return {
    isMobile,
    isTablet,
    isDesktop,
    width,
    breakpoint
  };
}

/**
 * 创建容器宽度观察器
 */
export function createContainerObserver(
  element: HTMLElement,
  callback: (state: ResponsiveState) => void,
  breakpoints: ResponsiveBreakpoints = DEFAULT_BREAKPOINTS
): () => void {
  if (!element) {
    console.warn('[ResponsiveUtils] Element is null or undefined');
    return () => {};
  }

  // 使用 ResizeObserver 监听容器大小变化
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const width = entry.contentRect.width;
      const state = getResponsiveState(width, breakpoints);
      callback(state);
    }
  });

  // 开始观察
  resizeObserver.observe(element);

  // 立即触发一次回调
  const initialWidth = element.clientWidth;
  const initialState = getResponsiveState(initialWidth, breakpoints);
  callback(initialState);

  // 返回清理函数
  return () => {
    resizeObserver.disconnect();
  };
}

/**
 * 创建响应式状态管理器（用于 Svelte 组件）
 * 这个函数返回一个工厂函数，在 Svelte 组件中调用
 */
export function createResponsiveManager(
  breakpoints: ResponsiveBreakpoints = DEFAULT_BREAKPOINTS
) {
  return function(element: HTMLElement | null) {
    // 初始状态
    let currentState: ResponsiveState = {
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      width: 0,
      breakpoint: 'desktop'
    };

    let cleanup: (() => void) | null = null;
    let subscribers: Array<(state: ResponsiveState) => void> = [];

    // 订阅状态变化
    function subscribe(callback: (state: ResponsiveState) => void) {
      subscribers.push(callback);
      // 立即调用一次
      callback(currentState);

      return () => {
        const index = subscribers.indexOf(callback);
        if (index > -1) {
          subscribers.splice(index, 1);
        }
      };
    }

    // 更新状态并通知订阅者
    function updateState(newState: ResponsiveState) {
      currentState = newState;
      subscribers.forEach(callback => callback(newState));
    }

    // 初始化观察器
    function init() {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }

      if (element) {
        cleanup = createContainerObserver(element, updateState, breakpoints);
      }
    }

    // 销毁
    function destroy() {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
      subscribers = [];
    }

    return {
      subscribe,
      init,
      destroy,
      get state() { return currentState; },
      get isMobile() { return currentState.isMobile; },
      get isTablet() { return currentState.isTablet; },
      get isDesktop() { return currentState.isDesktop; },
      get width() { return currentState.width; },
      get breakpoint() { return currentState.breakpoint; }
    };
  };
}

/**
 * 生成基于容器宽度的 CSS 类名
 */
export function getResponsiveClasses(state: ResponsiveState, prefix = 'responsive'): string[] {
  const classes = [
    `${prefix}-${state.breakpoint}`,
    `${prefix}-width-${Math.floor(state.width / 100) * 100}`
  ];

  if (state.isMobile) classes.push(`${prefix}-mobile`);
  if (state.isTablet) classes.push(`${prefix}-tablet`);
  if (state.isDesktop) classes.push(`${prefix}-desktop`);

  return classes;
}

/**
 * 为 Obsidian 插件优化的断点配置
 * 考虑到侧边栏的典型宽度
 */
export const OBSIDIAN_BREAKPOINTS: ResponsiveBreakpoints = {
  mobile: 280,   // 侧边栏最小宽度 - 降低阈值
  tablet: 400,   // 中等侧边栏宽度 - 降低阈值
  desktop: 500   // 较宽的侧边栏或主面板 - 降低阈值
};

/**
 * 检测是否在 Obsidian 侧边栏中
 */
export function isInSidebar(element: HTMLElement): boolean {
  // 检查父元素是否包含侧边栏相关的类名
  let current = element.parentElement;
  while (current) {
    const classList = current.classList;
    if (classList.contains('mod-right-split') ||
        classList.contains('mod-left-split')) {
      return true;
    }
    // 检查是否在主编辑区
    if (classList.contains('workspace-leaf-content') &&
        !classList.contains('mod-right-split') &&
        !classList.contains('mod-left-split')) {
      return false;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * 获取适合 Obsidian 环境的响应式配置
 */
export function getObsidianResponsiveConfig(element: HTMLElement): ResponsiveBreakpoints {
  const inSidebar = isInSidebar(element);
  return inSidebar ? OBSIDIAN_BREAKPOINTS : DEFAULT_BREAKPOINTS;
}
