import { Modal, App } from 'obsidian';
import { mount, unmount } from 'svelte';
import EnhancedActivationForm from './EnhancedActivationForm.svelte';
import './activation-modal.css';

/**
 * 使用Obsidian原生Modal API的激活模态框
 * 解决自定义模态框在Obsidian中的定位和层级问题
 */
export class ActivationModal extends Modal {
  private plugin: any;
  private onSave: () => void | Promise<void>;
  private component: any;
  
  constructor(app: App, plugin: any, onSave: () => void | Promise<void>) {
    super(app);
    this.plugin = plugin;
    this.onSave = onSave;
  }
  
  onOpen() {
    const { contentEl } = this;
    
    // 清空内容
    contentEl.empty();
    
    // 设置模态框样式
    this.modalEl.addClass('weave-activation-modal');
    
    // 挂载Svelte组件
    this.component = mount(EnhancedActivationForm, {
      target: contentEl,
      props: {
        plugin: this.plugin,
        onSave: this.onSave,
        standalone: false, // 在Modal中不显示容器装饰
        onActivationSuccess: (licenseInfo: any) => {
          // 激活成功后延迟关闭
          setTimeout(() => {
            this.close();
          }, 2000);
        },
        onDeactivationSuccess: async () => {
          await this.onSave();
          this.close();
        },
      }
    });
  }
  
  onClose() {
    const { contentEl } = this;
    
    // 销毁Svelte组件
    if (this.component) {
      void unmount(this.component);
      this.component = null;
    }
    
    contentEl.empty();
  }
}
