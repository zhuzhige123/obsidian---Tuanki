<script lang="ts">
  /**
   * 彩色圆点波浪动画组件
   * 复用 BouncingBallsLoader 的弹跳动画风格
   */
  
  interface Props {
    dotCount?: number;  // 圆点数量
    size?: number;      // 圆点大小
  }
  
  let { dotCount = 5, size = 16 }: Props = $props();
  
  // 渐变色彩（紫-蓝-粉）
  const colors = [
    '#8b5cf6', // 紫色
    '#7c3aed', // 深紫
    '#6366f1', // 靛蓝
    '#3b82f6', // 蓝色
    '#ec4899'  // 粉色
  ];
  
  const dots = $derived(
    Array.from({ length: dotCount }, (_, i) => ({
      id: i,
      color: colors[i % colors.length],
      delay: i * 0.15  // 每个圆点延迟 0.15s
    }))
  );
</script>

<div class="waving-dots">
  {#each dots as dot (dot.id)}
    <div 
      class="dot"
      style="
        --color: {dot.color};
        --delay: {dot.delay}s;
        --size: {size}px;
      "
    ></div>
  {/each}
</div>

<style>
  .waving-dots {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 60px;
    padding: 20px 0;
  }

  .dot {
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: var(--color);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    animation: dot-bounce 0.6s ease-in-out var(--delay) infinite alternate;
  }

  @keyframes dot-bounce {
    0% {
      transform: translateY(0) scale(1);
    }
    
    50% {
      transform: translateY(-30px) scale(1);
    }
    
    100% {
      transform: translateY(0) scale(1);
    }
  }
</style>


