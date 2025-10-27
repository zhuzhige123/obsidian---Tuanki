# Development Guide

This guide provides detailed information for developing with this Obsidian Svelte 5 plugin template.

## 🛠️ Development Setup

### Initial Setup

1. **Clone and install**:
   ```bash
   git clone <your-repo>
   cd your-plugin
   bun install
   ```

2. **Configure your plugin**:
   - Update `package.json` name, description, author
   - Update `public/manifest.json` with your plugin details
   - Update plugin class name in `src/main.ts`

3. **Start development**:
   ```bash
   bun run dev
   ```

### Development Workflow

1. **Make changes** to your source files
2. **Hot reload** automatically updates the plugin
3. **Test** in Obsidian by enabling the plugin
4. **Debug** using browser dev tools (Ctrl+Shift+I)

## 🏗️ Architecture

### Plugin Structure

```
src/
├── main.ts              # Plugin entry point
├── components/          # Svelte components
│   ├── study/          # 学习相关组件
│   ├── settings/       # 设置界面组件
│   │   └── SimplifiedParsingSettings.svelte
│   └── ui/             # 通用 UI 组件
├── utils/              # 工具函数
│   ├── fsrs/          # FSRS 算法实现
│   └── parsing/       # 卡片解析引擎
│       ├── SimplifiedCardParser.ts
│       └── CardParsingEngine.ts
├── data/               # 数据模型和存储
└── styles/             # 样式文件
```

### Key Concepts

#### Plugin Class
The main plugin class extends Obsidian's `Plugin`:

```typescript
export default class MyPlugin extends Plugin {
  async onload() {
    // Register views, commands, settings
  }
  
  onunload() {
    // Cleanup
  }
}
```

#### Views
Views are Obsidian UI containers that hold your Svelte components:

```typescript
export class ExampleView extends ItemView {
  component!: Component;
  
  async onOpen() {
    this.component = new Component({
      target: this.contentEl,
    });
  }
  
  async onClose() {
    this.component?.$destroy();
  }
}
```

#### Components
Svelte 5 components using the new runes system:

```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```

## 🎨 Styling Guidelines

### UnoCSS Usage

Use utility classes for consistent styling:

```svelte
<!-- Good -->
<div class="p-4 bg-blue-50 border border-blue-200 rounded-lg">
  <h2 class="text-lg font-semibold text-blue-800">Title</h2>
</div>

<!-- Avoid inline styles -->
<div style="padding: 1rem; background: #eff6ff;">
  <h2 style="font-size: 1.125rem; font-weight: 600;">Title</h2>
</div>
```

### Obsidian Theme Integration

Respect Obsidian's theme system:

```svelte
<!-- Use semantic colors that adapt to themes -->
<div class="bg-background text-foreground border-border">
  Content that adapts to light/dark themes
</div>
```

## 🔧 Configuration

### Vite Configuration

Key settings in `vite.config.ts`:

```typescript
export default defineConfig(({ mode }) => ({
  plugins: [
    UnoCSS(),
    svelte({
      compilerOptions: {
        compatibility: {
          componentApi: 4  // Obsidian compatibility
        }
      }
    })
  ],
  build: {
    lib: {
      entry: "src/main",
      formats: ["cjs"],  // CommonJS for Obsidian
    },
    rollupOptions: {
      external: ["obsidian", "electron", ...builtins],
    },
  },
}));
```

### TypeScript Configuration

Important settings in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "target": "ES2022",
    "types": ["svelte", "node", "bun-types"]
  }
}
```

## 🧪 Testing

### Manual Testing

1. **Build the plugin**: `bun run build`
2. **Copy to test vault**: Files go to `test-vault/.obsidian/plugins/`
3. **Enable in Obsidian**: Settings > Community plugins
4. **Test functionality**: Use ribbon icons, commands, views

### Debugging

1. **Open dev tools**: Ctrl+Shift+I in Obsidian
2. **Check console**: Look for errors or logs
3. **Inspect elements**: Debug UI issues
4. **Network tab**: Check for resource loading issues

## 📦 Building and Distribution

### Development Build
```bash
bun run dev  # Builds to test-vault/
```

### Production Build
```bash
bun run build  # Builds to build/
```

### Release Process

1. **Update version** in `package.json` and `public/manifest.json`
2. **Build for production**: `bun run build`
3. **Test thoroughly** in a clean Obsidian vault
4. **Create release** with built files
5. **Submit to community** (if publishing publicly)

## 🚨 Common Issues

### Component Not Rendering
- Check browser console for errors
- Verify component is properly imported
- Ensure target element exists

### Styles Not Applied
- Check UnoCSS configuration
- Verify class names are correct
- Ensure CSS is being generated

### Plugin Not Loading
- Check manifest.json syntax
- Verify all required files are present
- Check Obsidian console for errors

### Hot Reload Not Working
- Restart development server
- Check file watchers aren't blocked
- Verify Vite configuration

## 🎯 Best Practices

### Code Organization
- Keep components small and focused
- Use TypeScript for type safety
- Follow consistent naming conventions
- Document complex logic

### Performance
- Avoid heavy computations in components
- Use `$derived` for computed values
- Clean up resources in `onClose`
- Minimize DOM manipulations

### User Experience
- Provide loading states
- Handle errors gracefully
- Follow Obsidian's UI patterns
- Test with different themes

### Security
- Validate user inputs
- Sanitize HTML content
- Use Obsidian's built-in APIs
- Avoid eval() and similar functions

## 📚 Additional Resources

- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Svelte 5 Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [UnoCSS Interactive Docs](https://unocss.dev/interactive/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

Happy developing! 🚀
