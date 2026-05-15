<script lang="ts">
  interface Props {
    message?: string;
    compact?: boolean;
    showMessage?: boolean;
  }

  let { message = "加载中...", compact = false, showMessage = true }: Props = $props();
</script>

<div class:compact class="bouncing-balls-loader">
  <div class="loader-wrapper">
    <div class="circle"></div>
    <div class="circle"></div>
    <div class="circle"></div>
    <div class="shadow"></div>
    <div class="shadow"></div>
    <div class="shadow"></div>
  </div>
  {#if showMessage && message}
    <div class="loader-message">{message}</div>
  {/if}
</div>

<style>
  .bouncing-balls-loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    padding: 3rem 2rem;
    width: 100%;
    height: 100%;
    min-height: 300px;
  }

  .bouncing-balls-loader.compact {
    gap: 0.5rem;
    padding: 0;
    width: auto;
    height: auto;
    min-height: 0;
  }

  .loader-wrapper {
    width: 200px;
    height: 60px;
    position: relative;
    z-index: 1;
  }

  .bouncing-balls-loader.compact .loader-wrapper {
    width: 84px;
    height: 28px;
  }

  .circle {
    width: 20px;
    height: 20px;
    position: absolute;
    border-radius: 50%;
    background-color: var(--interactive-accent, #7c3aed);
    left: 15%;
    transform-origin: 50%;
    animation: circle-bounce 0.5s alternate infinite ease;
  }

  .bouncing-balls-loader.compact .circle {
    width: 10px;
    height: 10px;
    animation-name: circle-bounce-compact;
  }

  @keyframes circle-bounce {
    0% {
      top: 60px;
      height: 5px;
      border-radius: 50px 50px 25px 25px;
      transform: scaleX(1.7);
    }

    40% {
      height: 20px;
      border-radius: 50%;
      transform: scaleX(1);
    }

    100% {
      top: 0%;
    }
  }

  @keyframes circle-bounce-compact {
    0% {
      top: 28px;
      height: 3px;
      border-radius: 50px 50px 25px 25px;
      transform: scaleX(1.7);
    }

    40% {
      height: 10px;
      border-radius: 50%;
      transform: scaleX(1);
    }

    100% {
      top: 0%;
    }
  }

  .circle:nth-child(2) {
    left: 45%;
    animation-delay: 0.2s;
  }

  .circle:nth-child(3) {
    left: auto;
    right: 15%;
    animation-delay: 0.3s;
  }

  .shadow {
    width: 20px;
    height: 4px;
    border-radius: 50%;
    background-color: rgba(0, 0, 0, 0.3);
    position: absolute;
    top: 62px;
    transform-origin: 50%;
    z-index: -1;
    left: 15%;
    filter: blur(1px);
    animation: shadow-scale 0.5s alternate infinite ease;
  }

  .bouncing-balls-loader.compact .shadow {
    width: 10px;
    height: 2px;
    top: 30px;
    animation-name: shadow-scale-compact;
  }

  @keyframes shadow-scale {
    0% {
      transform: scaleX(1.5);
    }

    40% {
      transform: scaleX(1);
      opacity: 0.7;
    }

    100% {
      transform: scaleX(0.2);
      opacity: 0.4;
    }
  }

  @keyframes shadow-scale-compact {
    0% {
      transform: scaleX(1.5);
    }

    40% {
      transform: scaleX(1);
      opacity: 0.7;
    }

    100% {
      transform: scaleX(0.2);
      opacity: 0.4;
    }
  }

  .shadow:nth-child(4) {
    left: 45%;
    animation-delay: 0.2s;
  }

  .shadow:nth-child(5) {
    left: auto;
    right: 15%;
    animation-delay: 0.3s;
  }

  .loader-message {
    font-size: 0.875rem;
    color: var(--text-muted, #6b7280);
    font-weight: 500;
    text-align: center;
    animation: fade-pulse 2s ease-in-out infinite;
  }

  .bouncing-balls-loader.compact .loader-message {
    font-size: 0.75rem;
  }

  @keyframes fade-pulse {
    0%,
    100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }
</style>

