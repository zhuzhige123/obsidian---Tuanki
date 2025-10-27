# 🎨 导航栏样式统一设计文档

## 📋 概述

本文档记录了导航栏样式与基础设置采用统一设计令牌的改进工作，确保整个应用界面的一致性和专业性。

## 🎯 统一目标

### 设计一致性
- **统一设计令牌**: 使用与基础设置相同的CSS变量和设计令牌
- **统一视觉语言**: 保持与设置面板相同的视觉风格
- **统一交互体验**: 确保导航栏与其他组件的交互行为一致

### 技术规范
- **CSS变量映射**: 使用Tuanki设计系统的CSS变量
- **响应式设计**: 统一的断点和移动端适配
- **无障碍支持**: 符合WCAG标准的可访问性设计

## 🔄 主要改进

### 1. 导航栏主容器样式统一

#### 改进前
```css
.anki-navbar {
  /* background: inherit; */
  /* border-bottom: 1px solid var(--background-modifier-border); */
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 100;
  transition: all 0.3s ease;
}
```

#### 改进后
```css
/* 导航栏主容器 - 使用统一设计令牌 */
.anki-navbar {
  background: var(--tuanki-secondary-bg, var(--background-primary));
  border-bottom: 1px solid var(--background-modifier-border);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 100;
  transition: all 0.2s ease;
}
```

**改进点**:
- ✅ 使用统一的背景色变量 `--tuanki-secondary-bg`
- ✅ 添加底部边框保持与设置面板一致
- ✅ 统一过渡动画时长为 `0.2s`

### 2. 导航菜单面板样式统一

#### 改进前
```css
.anki-nav-menu {
  display: flex;
  gap: 0.25rem;
  background: transparent;
  border-radius: 1rem;
  padding: 0;
  box-shadow: none;
}
```

#### 改进后
```css
/* 主导航菜单 - 统一面板样式 */
.anki-nav-menu {
  display: flex;
  gap: 0.25rem;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 0.75rem;
  padding: 0.25rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
```

**改进点**:
- ✅ 使用统一的面板背景色 `--background-secondary`
- ✅ 添加边框与设置面板保持一致
- ✅ 统一圆角半径为 `0.75rem`
- ✅ 添加统一的阴影效果

### 3. 导航项按钮样式统一

#### 改进前
```css
.anki-nav-item {
  /* ... */
  padding: 0.4rem 0.75rem;
  min-height: 2.25rem;
  border-radius: 0.75rem;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  /* ... */
}
```

#### 改进后
```css
/* 导航项样式 - 统一按钮设计令牌 */
.anki-nav-item {
  /* ... */
  padding: 0.5rem 0.75rem;
  min-height: 2.5rem;
  border-radius: 0.5rem;
  transition: all 0.2s ease;
  user-select: none;
  /* ... */
}
```

**改进点**:
- ✅ 统一内边距和最小高度与设置按钮一致
- ✅ 统一圆角半径为 `0.5rem`
- ✅ 简化过渡动画，使用统一的 `0.2s ease`
- ✅ 添加 `user-select: none` 提升用户体验

### 4. 激活状态样式优化

#### 改进前
```css
.anki-nav-item.active {
  background: linear-gradient(135deg, var(--color-accent), var(--color-accent-2, #6366f1));
  color: white;
  box-shadow: 0 4px 16px rgba(139, 92, 246, 0.25);
  transform: translateY(-2px);
}
```

#### 改进后
```css
.anki-nav-item.active {
  background: var(--tuanki-accent-color, var(--color-accent));
  color: white;
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
  transform: translateY(-1px);
}
```

**改进点**:
- ✅ 使用统一的主题色变量 `--tuanki-accent-color`
- ✅ 简化背景为纯色，避免复杂渐变
- ✅ 调整阴影和位移效果，与其他组件保持一致

### 5. 图标和徽章样式统一

#### 改进前
```css
.anki-nav-icon {
  width: 20px;
  height: 20px;
}

.anki-nav-badge {
  background: #ef4444;
  padding: 0.125rem 0.375rem;
  border-radius: 0.75rem;
}
```

#### 改进后
```css
/* 导航图标 - 统一图标样式 */
.anki-nav-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* 徽章样式 - 统一通知样式 */
.anki-nav-badge {
  background: var(--text-error, #ef4444);
  padding: 0.125rem 0.25rem;
  border-radius: 0.5rem;
  min-width: 1rem;
  text-align: center;
}
```

**改进点**:
- ✅ 统一图标尺寸为 `18px`
- ✅ 使用统一的错误色变量 `--text-error`
- ✅ 优化徽章尺寸和对齐方式

## 📱 响应式设计统一

### 断点统一
- **平板断点**: `768px` - 与设置面板保持一致
- **手机断点**: `480px` - 统一移动端体验

### 移动端优化
```css
/* 小屏幕优化 - 统一移动端体验 */
@media (max-width: 480px) {
  .anki-nav-item {
    min-height: 2.5rem;
    min-width: 2.5rem;
    padding: 0.5rem;
    justify-content: center;
  }

  .anki-nav-item .anki-nav-label {
    display: none;
  }
}
```

## 🎨 设计令牌映射

### 颜色变量
| 用途 | 统一变量 | 说明 |
|------|----------|------|
| 主背景 | `--tuanki-secondary-bg` | 导航栏背景色 |
| 面板背景 | `--background-secondary` | 导航菜单背景 |
| 边框色 | `--background-modifier-border` | 统一边框 |
| 主题色 | `--tuanki-accent-color` | 激活状态背景 |
| 错误色 | `--text-error` | 徽章背景色 |

### 尺寸变量
| 用途 | 统一值 | 说明 |
|------|--------|------|
| 圆角 | `0.75rem` / `0.5rem` | 面板/按钮圆角 |
| 内边距 | `0.5rem 0.75rem` | 按钮内边距 |
| 最小高度 | `2.5rem` | 按钮最小高度 |
| 间距 | `0.25rem` | 元素间距 |

### 动画变量
| 用途 | 统一值 | 说明 |
|------|--------|------|
| 过渡时长 | `0.2s` | 统一动画时长 |
| 缓动函数 | `ease` | 简化缓动效果 |
| 位移效果 | `translateY(-1px)` | 悬停位移 |

## 🔧 技术实现

### CSS变量继承
```css
.tuanki-app {
  /* 统一设计令牌定义 */
  --tuanki-secondary-bg: var(--background-primary);
  --tuanki-accent-color: var(--color-accent);
  --tuanki-border: var(--background-modifier-border);
}
```

### 组件样式隔离
- 使用 `.anki-navbar` 作为命名空间
- 避免全局样式污染
- 保持与Obsidian主题的兼容性

## 📊 改进效果

### 视觉一致性
- ✅ 导航栏与设置面板视觉风格完全统一
- ✅ 颜色、尺寸、间距使用相同的设计令牌
- ✅ 交互效果与其他组件保持一致

### 用户体验
- ✅ 统一的交互反馈和动画效果
- ✅ 更好的移动端适配体验
- ✅ 符合无障碍设计标准

### 代码质量
- ✅ 减少重复的CSS代码
- ✅ 提高样式的可维护性
- ✅ 统一的设计系统实现

## 🚀 后续优化

### 短期计划
- [ ] 添加键盘导航支持
- [ ] 优化高对比度模式适配
- [ ] 完善RTL语言支持

### 长期规划
- [ ] 建立完整的设计系统文档
- [ ] 创建组件样式库
- [ ] 实现主题定制功能

---

**文档版本**: v1.0  
**更新时间**: 2025年1月  
**适用版本**: Tuanki v0.5.0+  
**维护状态**: ✅ 已完成并测试
