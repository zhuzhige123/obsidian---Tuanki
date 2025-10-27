# 官方模板测试用例

## 测试目的
验证官方默认 MD 模板与插件解析器的一致性，确保用户按官方示例书写能正常解析。

## 测试范围
---tuanki/start---

## 机器学习过拟合
什么是机器学习中的过拟合现象？

---div---
模型在训练集上表现很好，但在测试集上表现差

->related
card_123, card_456

->analysis
过拟合通常由于模型复杂度过高或训练数据不足导致。
解决方法包括正则化、交叉验证等。

->thoughts
这个概念在实际项目中很重要

---

## 机器学习过拟合
以下哪项不是解决过拟合的方法？

A. 增加模型复杂度
B. 正则化
C. 交叉验证
D. 增加训练数据

---div---

正确答案：A

->explanation
增加模型复杂度反而会加剧过拟合，其他方法都是有效的缓解手段。

->tags
#机器学习 #过拟合

---

## Python列表操作
Python中向列表末尾添加元素的方法是 ==append==

---div---

->explanation
append()方法用于在列表末尾添加新元素

->tags
#Python #列表

---

## English Multiple Choice
Which of the following is NOT a method to solve overfitting?

A. Increase model complexity
B. Regularization
C. Cross-validation
D. Increase training data

---div---

Correct Answer: A

->explanation
Increasing model complexity actually worsens overfitting, while other methods are effective mitigation strategies.

->tags
#MachineLearning #Overfitting

---tuanki/end---

## 预期结果

### 1. 批量解析测试
- ✅ 应该识别 4 张卡片（在 ---tuanki/start--- 到 ---tuanki/end--- 范围内）
- ✅ 卡片分隔符使用 --- 正常工作
- ❌ 如果移除 ---tuanki/start--- 或 ---tuanki/end---，应该不进行批量解析

### 2. 问答题测试
- ✅ 第一张卡片：识别为 qa 类型
- ✅ Front 字段：捕获 "## 机器学习过拟合\n什么是机器学习中的过拟合现象？"
- ✅ Back 字段：捕获 "模型在训练集上表现很好，但在测试集上表现差"

### 3. 选择题测试（中文）
- ✅ 第二张卡片：识别为 mcq 类型
- ✅ question 字段：捕获 "机器学习过拟合"
- ✅ options 字段：捕获 A./B./C./D. 选项块
- ✅ correct_answer 字段：捕获 "A"

### 4. 挖空题测试
- ✅ 第三张卡片：识别为 cloze 类型
- ✅ 优先识别 ==append== 语法（Obsidian 高亮）
- ✅ 兼容 {{c1::append}} 语法（Anki 格式）

### 5. 选择题测试（英文）
- ✅ 第四张卡片：识别为 mcq 类型
- ✅ 支持 "Correct Answer:" 英文标识
- ✅ 中英双语关键字兼容

### 6. 字段别名映射测试
- ✅ fields.question 映射正确
- ✅ fields.options 映射正确
- ✅ fields.correct_answer 映射正确
- ✅ fields.explanation 映射正确

## 测试步骤
1. 将此文件内容复制到插件设置页面的"模板测试面板"
2. 选择"批量解析"模式
3. 使用官方模板进行解析
4. 验证解析结果与预期一致
5. 测试预览功能是否正常显示

## 已修复的问题
- ✅ 模板字段 API 使用 field.pattern 而非 field.regex
- ✅ 默认 cardDelimiter 改为 '---'
- ✅ 挖空题检测支持双语法（== 和 {{c::}}）
- ✅ 选择题支持 A./B./C./D. 格式检测
- ✅ 字段别名映射确保兼容性
- ✅ TemplateTestingPanel 预览兼容 ParseTemplate
- ✅ 批量解析必须显式范围，无回退
- ✅ 规则文件更新移除"三位一体模板系统"表述
