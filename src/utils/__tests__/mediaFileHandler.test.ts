/**
 * 媒体文件处理器测试
 * 这个文件用于测试MediaFileHandler的功能
 */

import { MediaFileHandler } from '../mediaFileHandler';

// 模拟Obsidian插件环境
const mockPlugin = {
  app: {
    vault: {
      createFolder: jest.fn(),
      createBinary: jest.fn(),
      getAbstractFileByPath: jest.fn(),
      getResourcePath: jest.fn()
    }
  }
} as any;

describe('MediaFileHandler', () => {
  let mediaHandler: MediaFileHandler;

  beforeEach(() => {
    mediaHandler = new MediaFileHandler(mockPlugin, 'test-deck-id');
    jest.clearAllMocks();
  });

  describe('convertMediaReferences', () => {
    it('应该正确转换HTML img标签中的媒体引用', () => {
      const savedFiles = {
        'image.jpg': 'tuanki/media/decks/test-deck-id/image.jpg',
        'audio.mp3': 'tuanki/media/decks/test-deck-id/audio.mp3'
      };

      // 模拟getObsidianResourcePath返回正确的资源路径
      mockPlugin.app.vault.getAbstractFileByPath.mockImplementation((path) => {
        if (savedFiles[Object.keys(savedFiles).find(key => savedFiles[key] === path)]) {
          return { path }; // 模拟TFile对象
        }
        return null;
      });

      mockPlugin.app.vault.getResourcePath.mockImplementation((file) => {
        return `app://obsidian.md/${file.path}`;
      });

      const content = '<img src="image.jpg" alt="test"> <audio src="audio.mp3"></audio>';
      const result = mediaHandler.convertMediaReferences(content, savedFiles);

      expect(result).toContain('app://obsidian.md/tuanki/media/decks/test-deck-id/image.jpg');
      expect(result).toContain('app://obsidian.md/tuanki/media/decks/test-deck-id/audio.mp3');
      expect(result).not.toContain('[['); // 不应该包含双重路径
    });

    it('应该正确转换Markdown图片引用', () => {
      const savedFiles = {
        'diagram.png': 'tuanki/media/decks/test-deck-id/diagram.png'
      };

      const content = '![示例图片](diagram.png)';
      const result = mediaHandler.convertMediaReferences(content, savedFiles);

      expect(result).toBe('![示例图片]([[tuanki/media/decks/test-deck-id/diagram.png]])');
    });

    it('应该处理复杂的HTML内容', () => {
      const savedFiles = {
        'complex_image.jpg': 'tuanki/media/decks/test-deck-id/complex_image.jpg'
      };

      const content = `
        <div>
          <p>这是一个测试</p>
          <img src="complex_image.jpg" style="width: 100px;" alt="复杂图片">
          <p>更多内容</p>
        </div>
      `;

      const result = mediaHandler.convertMediaReferences(content, savedFiles);
      expect(result).toContain('app://obsidian.md/tuanki/media/decks/test-deck-id/complex_image.jpg');
    });

    it('应该处理没有匹配文件的情况', () => {
      const savedFiles = {
        'existing.jpg': 'tuanki/media/decks/test-deck-id/existing.jpg'
      };

      const content = '<img src="nonexistent.jpg"> <img src="existing.jpg">';
      const result = mediaHandler.convertMediaReferences(content, savedFiles);

      expect(result).toContain('nonexistent.jpg'); // 不存在的文件保持原样
      expect(result).toContain('app://obsidian.md/tuanki/media/decks/test-deck-id/existing.jpg');
    });

    it('应该修复重复路径问题', () => {
      const savedFiles = {
        '9dbf35ab82620e32159414b58a7f71bcfd6d11b5.jpg@1192w.webp': 'tuanki/media/decks/memunr70y48vdku9dv/9dbf35ab82620e32159414b58a7f71bcfd6d11b5.jpg@1192w.webp'
      };

      // 模拟问题场景：原始内容包含复杂的文件名
      const content = '<img src="9dbf35ab82620e32159414b58a7f71bcfd6d11b5.jpg@1192w.webp">';
      const result = mediaHandler.convertMediaReferences(content, savedFiles);

      // 结果应该是干净的路径，不应该有重复或嵌套的[[]]
      expect(result).toContain('app://obsidian.md/tuanki/media/decks/memunr70y48vdku9dv/9dbf35ab82620e32159414b58a7f71bcfd6d11b5.jpg@1192w.webp');
      expect(result).not.toContain('[[tuanki/media/decks/memunr70y48vdku9dv/[[');
      expect(result).not.toContain(']]]]');
    });
  });

  describe('sanitizeFilename', () => {
    it('应该清理不安全的文件名字符', () => {
      // 通过反射访问私有方法进行测试
      const sanitizeFilename = (mediaHandler as any).sanitizeFilename.bind(mediaHandler);

      expect(sanitizeFilename('file<>name.jpg')).toBe('file__name.jpg');
      expect(sanitizeFilename('file with spaces.png')).toBe('file_with_spaces.png');
      expect(sanitizeFilename('file:with|special*chars.gif')).toBe('file_with_special_chars.gif');
      expect(sanitizeFilename('___multiple___underscores___.txt')).toBe('multiple_underscores.txt');
    });
  });
});

// 集成测试示例
describe('MediaFileHandler Integration', () => {
  it('应该创建正确的文件夹结构', async () => {
    const mediaHandler = new MediaFileHandler(mockPlugin, 'integration-test');
    
    // 模拟文件夹不存在的情况
    mockPlugin.app.vault.getAbstractFileByPath.mockReturnValue(null);
    
    const testData = new Uint8Array([1, 2, 3, 4]);
    await mediaHandler.saveMediaFile('test.jpg', testData);

    // 验证是否创建了正确的文件夹结构
    expect(mockPlugin.app.vault.createFolder).toHaveBeenCalledWith('tuanki');
    expect(mockPlugin.app.vault.createFolder).toHaveBeenCalledWith('tuanki/media');
    expect(mockPlugin.app.vault.createFolder).toHaveBeenCalledWith('tuanki/media/decks');
    expect(mockPlugin.app.vault.createFolder).toHaveBeenCalledWith('tuanki/media/decks/integration-test');
  });
});

// 性能测试示例
describe('MediaFileHandler Performance', () => {
  it('应该能够处理大量媒体文件', async () => {
    const mediaHandler = new MediaFileHandler(mockPlugin, 'performance-test');
    
    // 模拟大量媒体文件
    const mediaMapping: Record<string, string> = {};
    const mediaFiles: Record<string, Uint8Array> = {};
    
    for (let i = 0; i < 100; i++) {
      const filename = `file_${i}.jpg`;
      mediaMapping[i.toString()] = filename;
      mediaFiles[filename] = new Uint8Array([i % 256]);
    }

    const startTime = Date.now();
    const result = await mediaHandler.processMediaFiles(mediaMapping, mediaFiles);
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(5000); // 应该在5秒内完成
    expect(result.success).toBe(true);
    expect(Object.keys(result.savedFiles)).toHaveLength(100);
  });
});
