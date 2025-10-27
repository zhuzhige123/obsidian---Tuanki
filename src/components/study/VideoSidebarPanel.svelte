<script lang="ts">
  import { onMount } from 'svelte';
  import type { VideoItem } from '../../types/video-course-types';
  import { VIDEO_STATUS_CONFIG } from '../../types/video-course-types';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';

  /**
   * Props接口
   */
  interface Props {
    /** 视频项列表 */
    videos: VideoItem[];
    
    /** 当前高亮的视频文件名 */
    currentVideoId?: string;
    
    /** 点击视频回调 */
    onVideoClick: (video: VideoItem) => void;
  }

  let { 
    videos, 
    currentVideoId, 
    onVideoClick 
  }: Props = $props();

  /**
   * 获取视频状态配置
   */
  function getStatusConfig(video: VideoItem) {
    return VIDEO_STATUS_CONFIG[video.status];
  }

  /**
   * 处理视频点击
   */
  function handleVideoClick(video: VideoItem) {
    if (video.clickable) {
      onVideoClick(video);
    }
  }

  /**
   * 获取文件名（不含路径）
   */
  function getDisplayName(filename: string): string {
    // 移除可能的路径前缀
    const parts = filename.split(/[/\\]/);
    return parts[parts.length - 1];
  }
</script>

<aside class="video-sidebar-panel">
  <!-- 侧边栏头部 -->
  <div class="sidebar-header">
    <div class="header-content">
      <EnhancedIcon name="film" size={18} />
      <h3 class="sidebar-title">视频目录</h3>
    </div>
    <span class="video-count">{videos.length}</span>
  </div>

  <!-- 视频列表 -->
  <div class="video-list-container">
    {#if videos.length === 0}
      <div class="empty-state">
        <EnhancedIcon name="inbox" size={32} />
        <p>此牌组暂无视频文件</p>
        <span class="empty-hint">在卡片中添加视频后将自动显示</span>
      </div>
    {:else}
      <div class="video-list">
        {#each videos as video (video.filename)}
          {@const statusConfig = getStatusConfig(video)}
          <div 
            class="video-item"
            class:current={video.status === 'current'}
            class:studied={video.status === 'studied'}
            class:pending={video.status === 'pending'}
            class:clickable={video.clickable}
            onclick={() => handleVideoClick(video)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleVideoClick(video);
              }
            }}
            role="button"
            tabindex={video.clickable ? 0 : -1}
            title={video.clickable ? '点击定位到视频' : ''}
          >
            <!-- 状态图标 -->
            <span 
              class="status-icon"
              style="color: {statusConfig.color}"
            >
              {statusConfig.icon}
            </span>

            <!-- 视频名称 -->
            <span class="video-name">
              {getDisplayName(video.filename)}
            </span>

            <!-- 当前播放指示器 -->
            {#if video.status === 'current'}
              <span class="pulse-indicator"></span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- 底部提示 -->
  <div class="sidebar-footer">
    <div class="legend">
      <div class="legend-item">
        <span class="legend-icon current-icon">▶</span>
        <span>当前</span>
      </div>
      <div class="legend-item">
        <span class="legend-icon studied-icon">✓</span>
        <span>已学习</span>
      </div>
      <div class="legend-item">
        <span class="legend-icon pending-icon">○</span>
        <span>待学习</span>
      </div>
    </div>
  </div>
</aside>

<style>
  .video-sidebar-panel {
    display: flex;
    flex-direction: column;
    width: 280px;
    height: 100%;
    background: var(--background-secondary);
    border-right: 1px solid var(--background-modifier-border);
    overflow: hidden;
    
    /* Grid定位 - 固定在第1列，跨越两行 */
    grid-column: 1;
    grid-row: 1 / 3;
  }

  /* 头部样式 */
  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sidebar-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .video-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 8px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }

  /* 视频列表容器 */
  .video-list-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .video-list-container::-webkit-scrollbar {
    width: 6px;
  }

  .video-list-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .video-list-container::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 3px;
  }

  .video-list-container::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }

  /* 空状态 */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;
    color: var(--text-muted);
  }

  .empty-state p {
    margin: 12px 0 4px;
    font-size: 14px;
    color: var(--text-normal);
  }

  .empty-hint {
    font-size: 12px;
    color: var(--text-muted);
  }

  /* 视频列表 */
  .video-list {
    list-style: none;
    margin: 0;
    padding: 8px;
  }

  .video-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    margin-bottom: 4px;
    border-radius: 6px;
    transition: all 0.2s ease;
    cursor: default;
  }

  .video-item.clickable {
    cursor: pointer;
  }

  .video-item.clickable:hover {
    background: var(--background-modifier-hover);
  }

  /* 当前视频样式 */
  .video-item.current {
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
    animation: highlight-pulse 2s ease-in-out infinite;
  }

  .video-item.current .video-name {
    color: white;
  }

  .video-item.current .status-icon {
    color: white !important;
  }

  /* 已学习视频样式 */
  .video-item.studied {
    opacity: 0.6;
  }

  .video-item.studied .video-name {
    text-decoration: line-through;
    color: var(--text-muted);
  }

  /* 待学习视频样式 */
  .video-item.pending {
    opacity: 0.8;
  }

  .video-item.pending .video-name {
    color: var(--text-normal);
  }

  /* 状态图标 */
  .status-icon {
    font-size: 14px;
    font-weight: 600;
    flex-shrink: 0;
    width: 16px;
    text-align: center;
  }

  /* 视频名称 */
  .video-name {
    flex: 1;
    font-size: 13px;
    line-height: 1.4;
    word-break: break-word;
    color: var(--text-normal);
  }

  /* 脉冲指示器 */
  .pulse-indicator {
    position: absolute;
    right: 12px;
    width: 8px;
    height: 8px;
    background: white;
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(1.3);
    }
  }

  @keyframes highlight-pulse {
    0%, 100% {
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
    }
    50% {
      box-shadow: 0 2px 12px rgba(16, 185, 129, 0.5);
    }
  }

  /* 底部图例 */
  .sidebar-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
  }

  .legend {
    display: flex;
    align-items: center;
    justify-content: space-around;
    gap: 8px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .legend-icon {
    font-size: 12px;
    font-weight: 600;
  }

  .legend-icon.current-icon {
    color: #10b981;
  }

  .legend-icon.studied-icon {
    color: #6b7280;
  }

  .legend-icon.pending-icon {
    color: var(--text-muted);
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .video-sidebar-panel {
      width: 240px;
    }

    .sidebar-footer {
      display: none;
    }
  }
</style>

