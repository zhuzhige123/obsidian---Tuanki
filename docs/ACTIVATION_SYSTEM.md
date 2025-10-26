# 🔐 激活码系统技术文档

本文档详细说明 Tuanki 插件的激活码系统架构、安全模型和技术实现。

---

## 📋 目录

- [概述](#概述)
- [架构设计](#架构设计)
- [安全模型](#安全模型)
- [技术实现](#技术实现)
- [工作流程](#工作流程)
- [开源策略](#开源策略)
- [常见问题](#常见问题)

---

## 概述

Tuanki 采用基于 **RSA-2048 数字签名**的激活码系统，实现：
- ✅ **完全离线验证**：无需网络连接
- ✅ **隐私保护**：不上传任何用户数据
- ✅ **防伪造**：使用公钥加密技术
- ✅ **设备绑定**：防止激活码滥用
- ✅ **开源透明**：验证逻辑完全公开

---

## 架构设计

### 系统组件

```
┌─────────────────────────────────────────────────────────┐
│                    Tuanki 激活码系统                     │
└─────────────────────────────────────────────────────────┘

客户端（开源）                     服务端/本地（私密）
┌──────────────────────┐           ┌──────────────────────┐
│                      │           │                      │
│  licenseManager.ts   │           │  私钥存储            │
│  ├─ 公钥（硬编码）   │           │  D:\tuanki-private\  │
│  ├─ 签名验证         │           │  private-key.pem     │
│  ├─ 设备指纹生成     │           │                      │
│  └─ 有效期检查       │           │  激活码生成脚本      │
│                      │           │  generate-codes.cjs  │
│  PremiumFeatureGuard │           │                      │
│  └─ 功能权限控制     │           └──────────────────────┘
│                      │                      ↓
└──────────────────────┘           生成激活码
         ↑                                   ↓
         │                          ┌────────────────┐
         │                          │  发卡平台      │
         └──────── 用户输入 ────────│  激活码销售    │
                                    └────────────────┘
```

### 数据流

```
1. 激活码生成（私密）
   私钥 + 用户信息 → 签名 → 激活码（BASE64_DATA.BASE64_SIGNATURE）

2. 激活码验证（公开）
   激活码 → 解析数据 → 公钥验证签名 → 检查有效期 → 生成设备指纹 → 激活成功

3. 功能访问控制
   用户操作 → PremiumFeatureGuard → 检查激活状态 → 允许/拒绝
```

---

## 安全模型

### 密码学基础

#### RSA-2048 签名系统

**公钥加密原理**：
```
私钥（保密）  →  签名数据  →  激活码
                               ↓
公钥（公开）  →  验证签名  →  确认真伪
```

**安全保证**：
- ✅ 只有拥有私钥的人才能生成有效激活码
- ✅ 公钥公开不影响安全性（这就是"公钥"的意义）
- ✅ 无法从公钥推导出私钥（数学难题）
- ✅ 无法伪造签名（需要解决离散对数问题）

#### 激活码格式

```
激活码 = BASE64(JSON数据) + "." + BASE64(RSA签名)

JSON数据包含：
{
  "userId": "user_1234567890_abc",
  "productId": "tuanki-obsidian-plugin",
  "licenseType": "lifetime",
  "expiresAt": "2035-10-12T00:00:00.000Z",
  "maxDevices": 3,
  "features": ["full_access"],
  "issuedAt": "2025-10-26T00:00:00.000Z"
}
```

### 设备指纹系统

#### 收集的信息

**设备特征（多维度）**：
```typescript
- 浏览器信息: userAgent, language, platform
- 屏幕信息: 分辨率, 色深, 像素比
- 硬件信息: CPU核心数, 触摸点数, 内存
- 系统信息: 时区, 主机名, 架构
- Canvas 指纹: 绘图特征
- WebGL 指纹: 渲染器信息
- Obsidian 特征: appId
```

**隐私保护**：
- ✅ 不包含 Vault 路径（可能包含敏感信息）
- ✅ 不包含文件列表
- ✅ 不上传到服务器
- ✅ 仅本地存储和验证

#### 设备绑定机制

```
1. 首次激活：
   - 生成当前设备指纹
   - 与激活码绑定
   - 保存到本地

2. 后续验证：
   - 重新生成设备指纹
   - 与保存的指纹比对
   - 允许60%相似度（容错系统更新）

3. 多设备支持：
   - 每个激活码支持N台设备（默认3台）
   - 设备列表存储在激活码数据中
   - 超出限制时拒绝激活
```

### 防护措施

#### 防暴力破解

```typescript
class ActivationAttemptLimiter {
  // 限制：每小时最多5次激活尝试
  private readonly MAX_ATTEMPTS = 5;
  private readonly TIME_WINDOW = 60 * 60 * 1000; // 1小时
  
  // 本地存储尝试记录
  // 超过限制后需要等待
}
```

#### 防篡改

```typescript
// 激活码数据完整性检查
- RSA签名验证（防伪造）
- 时间戳验证（防过期）
- 产品ID验证（防跨产品）
- 字段完整性验证
```

---

## 技术实现

### 核心文件

#### 客户端（开源）

**1. `src/utils/licenseManager.ts`**
```typescript
// 公钥（可以公开）
private readonly PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----...-----END PUBLIC KEY-----`;

// 主要功能
- validateActivationCode(code): 验证激活码
- activateLicense(code): 激活许可证
- validateCurrentLicense(info): 验证当前许可证
- generateDeviceFingerprint(): 生成设备指纹
```

**2. `src/services/premium/PremiumFeatureGuard.ts`**
```typescript
// 功能权限控制
- canUseFeature(featureId): 检查功能访问权限
- isPremiumActive: 响应式状态（Svelte Store）
```

#### 服务端/本地（私密）

**3. `scripts/generate-activation-codes-secure.cjs`**
```javascript
// 从外部加载私钥（不包含在代码中）
const privateKey = loadPrivateKey();

// 主要功能
- generateActivationCode(options): 生成单个激活码
- batchGenerate(count, options): 批量生成
- validatePrivateKey(): 验证私钥有效性
```

### 验证流程

```typescript
// 步骤1：解析激活码
const [dataBase64, signatureBase64] = activationCode.split('.');
const data = atob(dataBase64);
const activationData = JSON.parse(data);

// 步骤2：验证签名（使用 Web Crypto API）
const publicKey = await crypto.subtle.importKey(
  'spki',
  pemToArrayBuffer(PUBLIC_KEY),
  { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
  false,
  ['verify']
);

const isValid = await crypto.subtle.verify(
  'RSASSA-PKCS1-v1_5',
  publicKey,
  signatureBuffer,
  dataBuffer
);

// 步骤3：验证数据
- 检查产品ID
- 检查过期时间
- 检查设备数量限制

// 步骤4：生成和绑定设备指纹
const deviceFingerprint = await generateDeviceFingerprint();
// 保存到本地
```

---

## 工作流程

### 生成激活码

```bash
# 1. 维护者本地操作
node scripts/generate-activation-codes-secure.cjs 20 --key-file="D:\tuanki-private\private-key.pem"

# 2. 生成文件
- generated-codes-TIMESTAMP.json（备份）
- codes-plain-TIMESTAMP.txt（发卡平台格式）
- codes-numbered-TIMESTAMP.txt（带编号）

# 3. 上传到发卡平台
复制 codes-plain-*.txt 内容到发卡平台

# 4. 安全清理
删除或移动生成的激活码文件到安全位置
```

### 用户激活流程

```
1. 用户购买激活码（发卡平台）
2. 打开 Obsidian → Tuanki 设置 → 关于
3. 输入激活码 → 点击"激活许可证"
4. 系统验证激活码 → 生成设备指纹 → 激活成功
5. 高级功能立即解锁
```

### 功能访问控制

```typescript
// 在组件中使用
import { PremiumFeatureGuard } from 'services/premium/PremiumFeatureGuard';

const guard = PremiumFeatureGuard.getInstance();

if (guard.canUseFeature('ai-assistant')) {
  // 显示AI助手功能
} else {
  // 显示"升级到高级版"提示
}
```

---

## 开源策略

### 为什么验证逻辑可以开源？

**公钥加密的核心原理**：
- ✅ 公钥本来就应该公开（名字的含义）
- ✅ 验证算法是行业标准（RSA-SHA256）
- ✅ 开源不影响安全性（只要私钥保密）
- ✅ 透明度建立信任

**类比**：
```
就像银行卡的芯片验证：
- 验证算法是公开的（开源）
- 但只有银行有密钥（私钥）
- 你无法伪造银行卡（即使知道算法）
```

### 技术绕过的现实

**我们接受**：
- 技术用户可以修改代码绕过验证
- 这在任何客户端验证系统中都是现实
- 完全防止破解是不可能的

**我们的策略**：
- 用产品质量吸引付费
- 用官方支持增加价值
- 用持续更新保持优势
- 用便利性超越破解

### 开源的好处

```
1. 透明度 → 建立用户信任
2. 社区审计 → 发现安全问题
3. 贡献者参与 → 加速开发
4. 品牌建设 → 占领市场
5. 通过审核 → Obsidian官方市场
```

---

## 常见问题

### Q1: 公钥公开不会不安全吗？

**A**: 不会。这就是公钥加密的核心原理。
- 公钥只能**验证**签名，不能**生成**签名
- 从公钥推导私钥是数学难题（需要分解大质数）
- 全世界的 HTTPS、SSH 都是这个原理

### Q2: 为什么不用服务器验证？

**A**: 为了用户隐私和可靠性。
- ✅ 完全离线，不上传任何数据
- ✅ 无需网络，任何环境都能用
- ✅ 无需维护服务器
- ✅ 降低运营成本

### Q3: 如果私钥泄露怎么办？

**A**: 执行密钥轮换流程。
```
1. 生成新的密钥对
2. 更新客户端公钥（支持多版本）
3. 发布紧急更新
4. 为现有用户重新生成激活码
5. 旧密钥失效
```

### Q4: 设备指纹会侵犯隐私吗？

**A**: 不会，我们设计了隐私保护。
- ✅ 不包含 Vault 路径
- ✅ 不包含个人文件
- ✅ 不上传到服务器
- ✅ 仅本地存储
- ✅ 用户可以查看收集的信息

### Q5: 可以破解吗？

**A**: 技术上可以修改代码绕过，但我们接受这个现实。
- 我们的护城河是产品质量，不是技术限制
- 破解版得不到官方支持和更新
- 付费用户享受更好的体验

### Q6: 为什么要开源？

**A**: 多方面考虑。
- Obsidian 官方市场要求
- 建立用户信任
- 社区贡献和审计
- 快速占领市场
- 与"容忍破解换市场"战略一致

---

## 🔗 相关文档

- [私钥设置指南](./PRIVATE_KEY_SETUP.md)
- [开源准备清单](./OPEN_SOURCE_CHECKLIST.md)
- [Git 历史清理](./GIT_CLEANUP.md)
- [贡献指南](../CONTRIBUTING.md)

---

## 📞 技术支持

如有技术问题或安全建议：
- 📧 Email: tutaoyuan8@outlook.com
- 🐛 Issues: GitHub Issues
- 🔒 安全问题：请通过加密邮件联系

---

**最后更新**: 2025年10月26日
**文档版本**: v2.0
**系统版本**: RSA-2048 数字签名系统

