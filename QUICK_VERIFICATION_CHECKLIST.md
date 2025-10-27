# 统一ID系统 - 快速验证清单

**验证目标**: 确保新UUID系统在所有入口点正常工作  
**预计时间**: 15-30分钟  
**优先级**: P0

---

## ✅ 编译检查

```bash
# 1. 构建项目，确保无TypeScript错误
npm run build

# 期望结果：构建成功，无类型错误
```

---

## ✅ 功能验证

### 1. 手动创建卡片 ⭐⭐⭐
**测试步骤**:
1. 启动Obsidian
2. 打开Tuanki插件
3. 手动创建一张新卡片
4. 检查卡片数据：

**期望结果**:
```json
{
  "uuid": "tk-xm8k3p2a7b9h",  // ✅ 新格式，15位，tk-前缀
  "id": "card-1729458932..."   // ✅ 内部ID保持不变
}
```

**验证方法**:
- 打开开发者工具Console
- 查看卡片创建日志
- 确认UUID格式为`tk-{12位字母数字}`

---

### 2. 批量解析 ⭐⭐⭐
**测试步骤**:
1. 创建测试Markdown文件：
```markdown
---start---
Q: 测试问题1
A: 测试答案1
---div---

Q: 测试问题2  
A: 测试答案2
---end---
```

2. 配置批量解析映射
3. 执行批量解析
4. 检查生成的卡片UUID

**期望结果**:
- ✅ 所有卡片UUID格式为`tk-{12位}`
- ✅ 无UUID重复
- ✅ 解析成功日志

---

### 3. Anki导入 ⭐⭐
**测试步骤**:
1. 打开AnkiConnect
2. 导入一张Anki卡片
3. 检查生成的Tuanki卡片

**期望结果**:
```typescript
// 新导入的卡片
uuid: "tk-yyy..."  // ✅ 新格式

// 已有映射的卡片
uuid: "uuid-123..." // ✅ 保持旧UUID（复用映射）
```

---

### 4. AI生成卡片 ⭐
**测试步骤**:
1. 使用AI助手生成卡片
2. 检查生成的卡片UUID

**期望结果**:
- ✅ UUID格式为`tk-{12位}`
- ✅ 生成成功

---

## ✅ 兼容性验证

### 旧UUID识别 ⭐⭐
**测试步骤**:
1. 在Console中运行：
```javascript
const { isValidUUID } = require('./src/utils/helpers.ts');

// 测试新格式
isValidUUID('tk-xm8k3p2a7b9h')  // 应返回 true

// 测试旧UUID v4格式
isValidUUID('550e8400-e29b-41d4-a716-446655440000')  // 应返回 true

// 测试临时ID格式
isValidUUID('tuanki-card-1729458932-xyz123')  // 应返回 true

// 测试无效格式
isValidUUID('invalid-id')  // 应返回 false
```

**期望结果**:
- ✅ 新旧格式均能正确验证
- ✅ 无效格式正确拒绝

---

### BlockID验证 ⭐
**测试步骤**:
```javascript
const { isValidBlockId, normalizeBlockId } = require('./src/utils/helpers.ts');

// 测试有效BlockID
isValidBlockId('3ka8m2')      // 应返回 true
isValidBlockId('^3ka8m2')     // 应返回 true

// 规范化
normalizeBlockId('3ka8m2')    // 应返回 '^3ka8m2'
normalizeBlockId('^3ka8m2')   // 应返回 '^3ka8m2'
```

**期望结果**:
- ✅ BlockID验证正确
- ✅ 规范化功能正常

---

## ✅ 性能检查（可选）

### UUID生成性能 ⭐
**测试代码**:
```javascript
const { generateUUID } = require('./src/utils/helpers.ts');

// 生成1000个UUID并计时
console.time('UUID Generation');
const uuids = new Set();
for (let i = 0; i < 1000; i++) {
  uuids.add(generateUUID());
}
console.timeEnd('UUID Generation');

console.log('生成数量:', uuids.size);
console.log('重复数量:', 1000 - uuids.size);
```

**期望结果**:
- ✅ 生成时间 < 100ms
- ✅ 无重复UUID
- ✅ 所有UUID格式正确

---

## ✅ 集成测试

### 完整流程测试 ⭐⭐⭐
**测试场景**: 创建 → 编辑 → 学习 → 同步

1. **创建**:
   - ✅ 手动创建卡片
   - ✅ 批量解析创建卡片
   - ✅ UUID格式正确

2. **编辑**:
   - ✅ 编辑卡片内容
   - ✅ UUID保持不变
   - ✅ 保存成功

3. **学习**:
   - ✅ 卡片可以正常学习
   - ✅ FSRS数据正常更新
   - ✅ UUID正确关联

4. **同步** (如果启用Anki同步):
   - ✅ 新卡片同步到Anki
   - ✅ UUID映射正确建立
   - ✅ 不产生重复卡片

---

## ❌ 常见问题排查

### 问题1: UUID格式不是tk-开头
**可能原因**:
- helpers.ts未正确导入
- 缓存未清理

**解决方法**:
```bash
# 清理缓存
rm -rf .obsidian/workspace
npm run build
# 重启Obsidian
```

---

### 问题2: Anki导入UUID重复
**可能原因**:
- ImportMappingManager未正确工作

**检查方法**:
- 查看Console日志
- 检查`existingMapping`逻辑
- 验证UUID存储

---

### 问题3: 旧UUID无法识别
**可能原因**:
- 正则表达式有误
- 验证函数未更新

**检查方法**:
- 测试`isValidUUID()`函数
- 检查`buildUUIDPattern()`中的正则

---

## 📊 验证报告模板

完成上述验证后，填写以下报告：

```markdown
## 验证报告

**验证日期**: [填写日期]  
**验证人员**: [填写姓名]

### 编译检查
- [ ] 构建成功，无TypeScript错误

### 功能验证
- [ ] 手动创建：UUID格式正确
- [ ] 批量解析：UUID格式正确
- [ ] Anki导入：新卡片使用新UUID，旧映射保持
- [ ] AI生成：UUID格式正确

### 兼容性验证
- [ ] 新UUID格式验证通过
- [ ] 旧UUID v4格式验证通过
- [ ] 临时ID格式验证通过
- [ ] BlockID验证和规范化正常

### 性能检查
- [ ] UUID生成性能满足要求
- [ ] 无重复UUID

### 集成测试
- [ ] 创建 → 编辑 → 学习 → 同步 完整流程通过

### 问题记录
[描述发现的任何问题]

### 总体评估
- [ ] ✅ 通过验证，可以发布
- [ ] ⚠️ 有小问题，需修复后发布
- [ ] ❌ 有严重问题，不可发布
```

---

## 🎯 快速验证命令（5分钟版）

如果时间有限，至少完成以下核心验证：

```bash
# 1. 构建检查
npm run build

# 2. 手动测试
# - 创建一张卡片
# - 检查Console中的UUID
# - 确认格式为 tk-{12位}

# 3. 批量解析测试
# - 创建测试文件
# - 执行批量解析
# - 检查生成的卡片UUID

# 完成！
```

---

**验证清单版本**: v1.0  
**最后更新**: 2025-10-20  
**适用版本**: Tuanki v0.8+


