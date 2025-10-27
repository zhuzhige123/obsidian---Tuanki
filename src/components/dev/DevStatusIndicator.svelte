<script lang="ts">
  /**
   * 开发状态指示器
   * 显示热重载状态、构建信息和性能指标
   */
  
  import { onMount, onDestroy } from 'svelte';
  import { performanceMonitor } from '../../config/performance';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';

  interface Props {
    /** 是否显示详细信息 */
    showDetails?: boolean;
    /** 位置 */
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    /** 是否可拖拽 */
    draggable?: boolean;
  }

  let {
    showDetails = false,
    position = 'bottom-right',
    draggable = true
  }: Props = $props();

  // 状态
  let isConnected = $state(true);
  let buildStatus = $state<'idle' | 'building' | 'success' | 'error'>('idle');
  let lastBuildTime = $state<Date | null>(null);
  let buildDuration = $state(0);
  let errorMessage = $state('');
  let isExpanded = $state(false);
  let isDragging = $state(false);
  let dragPosition = $state({ x: 0, y: 0 });

  // 性能指标
  let memoryUsage = $state(0);
  let buildCount = $state(0);
  let avgBuildTime = $state(0);

  // 清理函数
  let cleanup: (() => void)[] = [];

  /**
   * 检查开发环境
   */
  function isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development' || 
           window.location.hostname === 'localhost' ||
           window.location.hostname === '127.0.0.1';
  }

  /**
   * 连接到开发服务器
   */
  function connectToDevServer(): void {
    // 模拟 WebSocket 连接到开发服务器
    if (typeof window !== 'undefined' && 'WebSocket' in window) {
      try {
        const ws = new WebSocket('ws://localhost:3000/dev-status');
        
        ws.onopen = () => {
          isConnected = true;
          console.log('[DevStatusIndicator] Connected to dev server');
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleDevServerMessage(data);
          } catch (error) {
            console.warn('[DevStatusIndicator] Invalid message:', event.data);
          }
        };
        
        ws.onclose = () => {
          isConnected = false;
          console.log('[DevStatusIndicator] Disconnected from dev server');
          
          // 尝试重连
          setTimeout(connectToDevServer, 3000);
        };
        
        ws.onerror = (error) => {
          console.warn('[DevStatusIndicator] WebSocket error:', error);
          isConnected = false;
        };
        
        cleanup.push(() => {
          ws.close();
        });
      } catch (error) {
        console.warn('[DevStatusIndicator] WebSocket not available');
        isConnected = false;
      }
    }
  }

  /**
   * 处理开发服务器消息
   */
  function handleDevServerMessage(data: any): void {
    switch (data.type) {
      case 'build-start':
        buildStatus = 'building';
        break;
        
      case 'build-success':
        buildStatus = 'success';
        lastBuildTime = new Date();
        buildDuration = data.duration || 0;
        buildCount++;
        
        // 3秒后重置状态
        setTimeout(() => {
          if (buildStatus === 'success') {
            buildStatus = 'idle';
          }
        }, 3000);
        break;
        
      case 'build-error':
        buildStatus = 'error';
        errorMessage = data.error || '构建失败';
        break;
        
      case 'performance':
        memoryUsage = data.memory || 0;
        avgBuildTime = data.avgBuildTime || 0;
        break;
    }
  }

  /**
   * 更新性能指标
   */
  function updatePerformanceMetrics(): void {
    if (performanceMonitor) {
      const stats = performanceMonitor.getAllStats();
      const memoryStats = performanceMonitor.getMemoryStats();
      
      if (stats['build-time']) {
        avgBuildTime = Math.round(stats['build-time'].avg);
      }
      
      if (memoryStats) {
        memoryUsage = Math.round(memoryStats.current / 1024 / 1024); // MB
      }
    }
  }

  /**
   * 切换展开状态
   */
  function toggleExpanded(): void {
    isExpanded = !isExpanded;
  }

  /**
   * 处理拖拽开始
   */
  function handleDragStart(event: MouseEvent): void {
    if (!draggable) return;
    
    isDragging = true;
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    dragPosition = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  }

  /**
   * 处理拖拽移动
   */
  function handleDragMove(event: MouseEvent): void {
    if (!isDragging) return;
    
    const indicator = document.querySelector('.dev-status-indicator') as HTMLElement;
    if (indicator) {
      indicator.style.left = `${event.clientX - dragPosition.x}px`;
      indicator.style.top = `${event.clientY - dragPosition.y}px`;
      indicator.style.right = 'auto';
      indicator.style.bottom = 'auto';
    }
  }

  /**
   * 处理拖拽结束
   */
  function handleDragEnd(): void {
    isDragging = false;
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
  }

  /**
   * 获取状态图标
   */
  function getStatusIcon(): string {
    switch (buildStatus) {
      case 'building':
        return 'loader';
      case 'success':
        return 'check-circle';
      case 'error':
        return 'x-circle';
      default:
        return isConnected ? 'wifi' : 'wifi-off';
    }
  }

  /**
   * 获取状态颜色
   */
  function getStatusColor(): string {
    switch (buildStatus) {
      case 'building':
        return 'var(--text-accent)';
      case 'success':
        return 'var(--text-success)';
      case 'error':
        return 'var(--text-error)';
      default:
        return isConnected ? 'var(--text-success)' : 'var(--text-muted)';
    }
  }

  // 组件挂载
  onMount(() => {
    // 只在开发环境显示
    if (!isDevelopment()) {
      return;
    }

    console.log('[DevStatusIndicator] Initializing dev status indicator');
    
    // 连接到开发服务器
    connectToDevServer();
    
    // 定期更新性能指标
    const performanceInterval = setInterval(updatePerformanceMetrics, 2000);
    cleanup.push(() => clearInterval(performanceInterval));
    
    // 初始更新
    updatePerformanceMetrics();
  });

  // 组件销毁
  onDestroy(() => {
    cleanup.forEach(fn => fn());
    cleanup = [];
  });

  // 如果不是开发环境，不渲染组件
  if (!isDevelopment()) {
    // 返回空内容
  }
</script>

{#if isDevelopment()}
  <div 
    class="dev-status-indicator {position}"
    class:expanded={isExpanded}
    class:dragging={isDragging}
    onmousedown={handleDragStart}
  >
    <div class="status-icon" onclick={toggleExpanded}>
      <EnhancedIcon 
        name={getStatusIcon()} 
        size="16" 
        style="color: {getStatusColor()}"
      />
      {#if buildStatus === 'building'}
        <div class="spinner"></div>
      {/if}
    </div>

    {#if isExpanded}
      <div class="status-details">
        <div class="status-header">
          <span class="status-title">开发状态</span>
          <button class="close-btn" onclick={toggleExpanded}>
            <EnhancedIcon name="x" size="12" />
          </button>
        </div>

        <div class="status-info">
          <div class="info-item">
            <span class="label">连接状态:</span>
            <span class="value" class:connected={isConnected}>
              {isConnected ? '已连接' : '未连接'}
            </span>
          </div>

          <div class="info-item">
            <span class="label">构建状态:</span>
            <span class="value" style="color: {getStatusColor()}">
              {buildStatus === 'idle' ? '空闲' : 
               buildStatus === 'building' ? '构建中' :
               buildStatus === 'success' ? '成功' : '失败'}
            </span>
          </div>

          {#if lastBuildTime}
            <div class="info-item">
              <span class="label">最后构建:</span>
              <span class="value">{lastBuildTime.toLocaleTimeString()}</span>
            </div>
          {/if}

          {#if buildDuration > 0}
            <div class="info-item">
              <span class="label">构建耗时:</span>
              <span class="value">{buildDuration}ms</span>
            </div>
          {/if}

          {#if showDetails}
            <div class="info-item">
              <span class="label">构建次数:</span>
              <span class="value">{buildCount}</span>
            </div>

            {#if avgBuildTime > 0}
              <div class="info-item">
                <span class="label">平均耗时:</span>
                <span class="value">{avgBuildTime}ms</span>
              </div>
            {/if}

            {#if memoryUsage > 0}
              <div class="info-item">
                <span class="label">内存使用:</span>
                <span class="value">{memoryUsage}MB</span>
              </div>
            {/if}
          {/if}

          {#if buildStatus === 'error' && errorMessage}
            <div class="error-message">
              <EnhancedIcon name="alert-triangle" size="12" />
              <span>{errorMessage}</span>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .dev-status-indicator {
    position: fixed;
    z-index: 10000;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: var(--shadow-s);
    font-size: 0.75rem;
    user-select: none;
    transition: all 0.2s ease;
  }

  .dev-status-indicator.top-left {
    top: 1rem;
    left: 1rem;
  }

  .dev-status-indicator.top-right {
    top: 1rem;
    right: 1rem;
  }

  .dev-status-indicator.bottom-left {
    bottom: 1rem;
    left: 1rem;
  }

  .dev-status-indicator.bottom-right {
    bottom: 1rem;
    right: 1rem;
  }

  .dev-status-indicator.dragging {
    cursor: grabbing;
    box-shadow: var(--shadow-l);
  }

  .status-icon {
    position: relative;
    padding: 0.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .status-icon:hover {
    background: var(--background-modifier-hover);
  }

  .spinner {
    position: absolute;
    inset: 0;
    border: 2px solid transparent;
    border-top: 2px solid var(--text-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .status-details {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 0.5rem;
    min-width: 200px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: var(--shadow-s);
    overflow: hidden;
  }

  .dev-status-indicator.top-left .status-details,
  .dev-status-indicator.top-right .status-details {
    bottom: auto;
    top: 100%;
    margin-bottom: 0;
    margin-top: 0.5rem;
  }

  .status-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .status-title {
    font-weight: 600;
    color: var(--text-normal);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .status-info {
    padding: 0.75rem;
  }

  .info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .info-item:last-child {
    margin-bottom: 0;
  }

  .label {
    color: var(--text-muted);
  }

  .value {
    color: var(--text-normal);
    font-weight: 500;
  }

  .value.connected {
    color: var(--text-success);
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--background-modifier-error);
    border-radius: 4px;
    color: var(--text-error);
    font-size: 0.7rem;
    margin-top: 0.5rem;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .dev-status-indicator {
      font-size: 0.7rem;
    }

    .status-details {
      min-width: 180px;
    }
  }
</style>
