<script lang="ts">
  /**
   * 礼花粒子动画组件（纯CSS实现）
   * 紫色系渐变礼花从中心向四周爆炸
   */
  
  interface Props {
    particleCount?: number; // 粒子数量
    duration?: number;      // 动画时长（秒）
  }
  
  let { particleCount = 40, duration = 2.5 }: Props = $props();
  
  // 紫色系颜色
  const colors = ['#8b5cf6', '#7c3aed', '#6d28d9', '#a78bfa', '#c4b5fd'];
  
  // 生成粒子数据
  const particles = $derived(
    Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      color: colors[Math.floor(Math.random() * colors.length)],
      // 随机发射角度（360度）
      angle: Math.random() * 360,
      // 随机发射距离（200-500px）
      distance: 200 + Math.random() * 300,
      // 随机旋转圈数
      rotation: 360 + Math.random() * 720,
      // 随机大小（4-12px）
      size: 4 + Math.random() * 8,
      // 随机延迟（0-0.2s）
      delay: Math.random() * 0.2,
      // 随机形状
      shape: Math.random() > 0.5 ? 'circle' : 'square'
    }))
  );
</script>

<div class="confetti-container">
  {#each particles as particle (particle.id)}
    <div 
      class="confetti-particle"
      class:circle={particle.shape === 'circle'}
      class:square={particle.shape === 'square'}
      style="
        --color: {particle.color};
        --angle: {particle.angle}deg;
        --distance: {particle.distance}px;
        --rotation: {particle.rotation}deg;
        --size: {particle.size}px;
        --delay: {particle.delay}s;
        --duration: {duration}s;
      "
    ></div>
  {/each}
</div>

<style>
  .confetti-container {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 1000;
  }

  .confetti-particle {
    position: absolute;
    width: var(--size);
    height: var(--size);
    background-color: var(--color);
    opacity: 0;
    animation: confetti-fall var(--duration) ease-out var(--delay) forwards;
  }

  .confetti-particle.circle {
    border-radius: 50%;
  }

  .confetti-particle.square {
    border-radius: 2px;
  }

  @keyframes confetti-fall {
    0% {
      transform: 
        translate(0, 0) 
        rotate(0deg);
      opacity: 1;
    }
    
    100% {
      transform: 
        translate(
          calc(cos(var(--angle)) * var(--distance)),
          calc(sin(var(--angle)) * var(--distance) + 600px)
        )
        rotate(var(--rotation));
      opacity: 0;
    }
  }

  /* 浏览器兼容性：使用 JavaScript 计算 */
  .confetti-particle {
    --x: calc(var(--distance) * cos(var(--angle) * 3.14159 / 180));
    --y: calc(var(--distance) * sin(var(--angle) * 3.14159 / 180) + 600px);
  }

  @keyframes confetti-fall {
    0% {
      transform: translate(0, 0) rotate(0deg);
      opacity: 1;
    }
    
    15% {
      opacity: 1;
    }
    
    100% {
      /* 使用 CSS 变量计算最终位置 */
      transform: 
        translate(var(--x), var(--y))
        rotate(var(--rotation));
      opacity: 0;
    }
  }
</style>


