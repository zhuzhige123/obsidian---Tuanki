/**
 * 综合测试用例集
 * 包含各种复杂情况的Markdown测试用例，用于验证解析算法的健壮性
 */

export interface TestCase {
  id: string;
  name: string;
  description: string;
  category: 'basic' | 'complex' | 'edge' | 'performance' | 'regression';
  input: string;
  expectedFields: Record<string, string>;
  expectedConfidence: number;
  tags: string[];
  notes?: string;
}

export interface TestSuite {
  name: string;
  description: string;
  cases: TestCase[];
}

/**
 * 基础测试用例
 * 测试标准的Markdown格式
 */
export const basicTestCases: TestCase[] = [
  {
    id: 'basic-001',
    name: '标准二级标题问答',
    description: '最基本的二级标题问答格式',
    category: 'basic',
    input: `## 什么是JavaScript？

JavaScript是一种高级的、解释型的编程语言。它是一种基于原型、函数先行的语言，是一种多范式的语言，它支持面向对象编程，命令式编程，以及函数式编程。

JavaScript最初被设计为在浏览器中运行，为网页添加交互性。`,
    expectedFields: {
      question: '什么是JavaScript？',
      answer: 'JavaScript是一种高级的、解释型的编程语言。它是一种基于原型、函数先行的语言，是一种多范式的语言，它支持面向对象编程，命令式编程，以及函数式编程。\n\nJavaScript最初被设计为在浏览器中运行，为网页添加交互性。',
      notes: `## 什么是JavaScript？

JavaScript是一种高级的、解释型的编程语言。它是一种基于原型、函数先行的语言，是一种多范式的语言，它支持面向对象编程，命令式编程，以及函数式编程。

JavaScript最初被设计为在浏览器中运行，为网页添加交互性。`
    },
    expectedConfidence: 0.95,
    tags: ['basic', 'heading', 'standard']
  },

  {
    id: 'basic-002',
    name: '三级标题问答',
    description: '使用三级标题的问答格式',
    category: 'basic',
    input: `### 如何声明JavaScript变量？

在JavaScript中，可以使用以下关键字声明变量：

- \`var\`: 函数作用域或全局作用域
- \`let\`: 块级作用域
- \`const\`: 块级作用域，常量

示例：
\`\`\`javascript
var name = "张三";
let age = 25;
const PI = 3.14159;
\`\`\``,
    expectedFields: {
      question: '如何声明JavaScript变量？',
      answer: `在JavaScript中，可以使用以下关键字声明变量：

- \`var\`: 函数作用域或全局作用域
- \`let\`: 块级作用域
- \`const\`: 块级作用域，常量

示例：
\`\`\`javascript
var name = "张三";
let age = 25;
const PI = 3.14159;
\`\`\``,
      notes: `### 如何声明JavaScript变量？

在JavaScript中，可以使用以下关键字声明变量：

- \`var\`: 函数作用域或全局作用域
- \`let\`: 块级作用域
- \`const\`: 块级作用域，常量

示例：
\`\`\`javascript
var name = "张三";
let age = 25;
const PI = 3.14159;
\`\`\``
    },
    expectedConfidence: 0.9,
    tags: ['basic', 'heading', 'code', 'list']
  },

  {
    id: 'basic-003',
    name: '粗体标题问答',
    description: '使用粗体格式的标题',
    category: 'basic',
    input: `**什么是闭包？**

闭包是指有权访问另一个函数作用域中变量的函数。创建闭包的常见方式，就是在一个函数内部创建另一个函数。

闭包的特点：
1. 函数嵌套函数
2. 内部函数可以引用外部函数的参数和变量
3. 参数和变量不会被垃圾回收机制回收`,
    expectedFields: {
      question: '什么是闭包？',
      answer: `闭包是指有权访问另一个函数作用域中变量的函数。创建闭包的常见方式，就是在一个函数内部创建另一个函数。

闭包的特点：
1. 函数嵌套函数
2. 内部函数可以引用外部函数的参数和变量
3. 参数和变量不会被垃圾回收机制回收`,
      notes: `**什么是闭包？**

闭包是指有权访问另一个函数作用域中变量的函数。创建闭包的常见方式，就是在一个函数内部创建另一个函数。

闭包的特点：
1. 函数嵌套函数
2. 内部函数可以引用外部函数的参数和变量
3. 参数和变量不会被垃圾回收机制回收`
    },
    expectedConfidence: 0.85,
    tags: ['basic', 'bold', 'numbered-list']
  }
];

/**
 * 复杂测试用例
 * 测试包含多种Markdown元素的复杂格式
 */
export const complexTestCases: TestCase[] = [
  {
    id: 'complex-001',
    name: '多级标题混合',
    description: '包含多个不同级别标题的复杂结构',
    category: 'complex',
    input: `## 什么是React？

React是一个用于构建用户界面的JavaScript库。

### 主要特点

#### 1. 组件化
React采用组件化的开发模式，每个组件都是独立的、可复用的代码块。

#### 2. 虚拟DOM
React使用虚拟DOM来提高性能，减少直接操作真实DOM的次数。

### 使用示例

\`\`\`jsx
function Welcome(props) {
  return <h1>Hello, {props.name}</h1>;
}
\`\`\`

> **注意**: React组件名必须以大写字母开头。`,
    expectedFields: {
      question: '什么是React？',
      answer: `React是一个用于构建用户界面的JavaScript库。

### 主要特点

#### 1. 组件化
React采用组件化的开发模式，每个组件都是独立的、可复用的代码块。

#### 2. 虚拟DOM
React使用虚拟DOM来提高性能，减少直接操作真实DOM的次数。

### 使用示例

\`\`\`jsx
function Welcome(props) {
  return <h1>Hello, {props.name}</h1>;
}
\`\`\`

> **注意**: React组件名必须以大写字母开头。`,
      notes: `## 什么是React？

React是一个用于构建用户界面的JavaScript库。

### 主要特点

#### 1. 组件化
React采用组件化的开发模式，每个组件都是独立的、可复用的代码块。

#### 2. 虚拟DOM
React使用虚拟DOM来提高性能，减少直接操作真实DOM的次数。

### 使用示例

\`\`\`jsx
function Welcome(props) {
  return <h1>Hello, {props.name}</h1>;
}
\`\`\`

> **注意**: React组件名必须以大写字母开头。`
    },
    expectedConfidence: 0.8,
    tags: ['complex', 'multi-heading', 'code', 'blockquote']
  },

  {
    id: 'complex-002',
    name: '表格和链接混合',
    description: '包含表格、链接和图片的复杂内容',
    category: 'complex',
    input: `## HTTP状态码有哪些？

HTTP状态码用于表示HTTP请求的结果。常见的状态码如下：

| 状态码 | 含义 | 描述 |
|--------|------|------|
| 200 | OK | 请求成功 |
| 404 | Not Found | 资源未找到 |
| 500 | Internal Server Error | 服务器内部错误 |

更多信息请参考：[MDN HTTP状态码文档](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Status)

![HTTP状态码图示](https://example.com/http-status-codes.png)

**重要提示**: 正确理解状态码对于Web开发至关重要。`,
    expectedFields: {
      question: 'HTTP状态码有哪些？',
      answer: `HTTP状态码用于表示HTTP请求的结果。常见的状态码如下：

| 状态码 | 含义 | 描述 |
|--------|------|------|
| 200 | OK | 请求成功 |
| 404 | Not Found | 资源未找到 |
| 500 | Internal Server Error | 服务器内部错误 |

更多信息请参考：[MDN HTTP状态码文档](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Status)

![HTTP状态码图示](https://example.com/http-status-codes.png)

**重要提示**: 正确理解状态码对于Web开发至关重要。`,
      notes: `## HTTP状态码有哪些？

HTTP状态码用于表示HTTP请求的结果。常见的状态码如下：

| 状态码 | 含义 | 描述 |
|--------|------|------|
| 200 | OK | 请求成功 |
| 404 | Not Found | 资源未找到 |
| 500 | Internal Server Error | 服务器内部错误 |

更多信息请参考：[MDN HTTP状态码文档](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Status)

![HTTP状态码图示](https://example.com/http-status-codes.png)

**重要提示**: 正确理解状态码对于Web开发至关重要。`
    },
    expectedConfidence: 0.75,
    tags: ['complex', 'table', 'link', 'image', 'bold']
  }
];

/**
 * 边缘测试用例
 * 测试各种边缘情况和异常格式
 */
export const edgeTestCases: TestCase[] = [
  {
    id: 'edge-001',
    name: '中英文标点混用',
    description: '测试中英文标点符号混合使用的情况',
    category: 'edge',
    input: `## 什么是API？

API（Application Programming Interface，应用程序编程接口）是一组预定义的函数、协议和工具，用于构建软件应用程序。

主要作用：
1、提供标准化的接口
2、简化开发过程
3、提高代码复用性

注意：API设计需要考虑安全性、性能和易用性。`,
    expectedFields: {
      question: '什么是API？',
      answer: `API（Application Programming Interface，应用程序编程接口）是一组预定义的函数、协议和工具，用于构建软件应用程序。

主要作用：
1、提供标准化的接口
2、简化开发过程
3、提高代码复用性

注意：API设计需要考虑安全性、性能和易用性。`,
      notes: `## 什么是API？

API（Application Programming Interface，应用程序编程接口）是一组预定义的函数、协议和工具，用于构建软件应用程序。

主要作用：
1、提供标准化的接口
2、简化开发过程
3、提高代码复用性

注意：API设计需要考虑安全性、性能和易用性。`
    },
    expectedConfidence: 0.7,
    tags: ['edge', 'chinese-punctuation', 'mixed-numbering']
  },

  {
    id: 'edge-002',
    name: '空行和空格异常',
    description: '测试包含多余空行和空格的格式',
    category: 'edge',
    input: `##   什么是CSS？   


CSS（Cascading Style Sheets）是一种样式表语言。   


   它用于描述HTML文档的呈现方式。   

主要功能：   
-   控制布局   
-   设置颜色和字体   
-   添加动画效果   


CSS3引入了许多新特性。   `,
    expectedFields: {
      question: '什么是CSS？',
      answer: `CSS（Cascading Style Sheets）是一种样式表语言。   


   它用于描述HTML文档的呈现方式。   

主要功能：   
-   控制布局   
-   设置颜色和字体   
-   添加动画效果   


CSS3引入了许多新特性。`,
      notes: `##   什么是CSS？   


CSS（Cascading Style Sheets）是一种样式表语言。   


   它用于描述HTML文档的呈现方式。   

主要功能：   
-   控制布局   
-   设置颜色和字体   
-   添加动画效果   


CSS3引入了许多新特性。   `
    },
    expectedConfidence: 0.6,
    tags: ['edge', 'whitespace', 'formatting-issues']
  },

  {
    id: 'edge-003',
    name: '特殊字符和符号',
    description: '测试包含特殊字符和符号的内容',
    category: 'edge',
    input: `## 什么是正则表达式？

正则表达式（Regular Expression，简称RegEx）是一种文本模式，包括普通字符（例如，a 到 z 之间的字母）和特殊字符（称为"元字符"）。

常用元字符：
- \`.\` 匹配任意字符（除换行符外）
- \`*\` 匹配前面的字符零次或多次
- \`+\` 匹配前面的字符一次或多次
- \`?\` 匹配前面的字符零次或一次
- \`^\` 匹配字符串开始
- \`$\` 匹配字符串结束
- \`[]\` 字符类
- \`()\` 分组
- \`|\` 或操作符

示例：\`/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/\` 用于匹配邮箱地址。

⚠️ **注意**: 正则表达式的性能可能会因复杂度而异。`,
    expectedFields: {
      question: '什么是正则表达式？',
      answer: `正则表达式（Regular Expression，简称RegEx）是一种文本模式，包括普通字符（例如，a 到 z 之间的字母）和特殊字符（称为"元字符"）。

常用元字符：
- \`.\` 匹配任意字符（除换行符外）
- \`*\` 匹配前面的字符零次或多次
- \`+\` 匹配前面的字符一次或多次
- \`?\` 匹配前面的字符零次或一次
- \`^\` 匹配字符串开始
- \`$\` 匹配字符串结束
- \`[]\` 字符类
- \`()\` 分组
- \`|\` 或操作符

示例：\`/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/\` 用于匹配邮箱地址。

⚠️ **注意**: 正则表达式的性能可能会因复杂度而异。`,
      notes: `## 什么是正则表达式？

正则表达式（Regular Expression，简称RegEx）是一种文本模式，包括普通字符（例如，a 到 z 之间的字母）和特殊字符（称为"元字符"）。

常用元字符：
- \`.\` 匹配任意字符（除换行符外）
- \`*\` 匹配前面的字符零次或多次
- \`+\` 匹配前面的字符一次或多次
- \`?\` 匹配前面的字符零次或一次
- \`^\` 匹配字符串开始
- \`$\` 匹配字符串结束
- \`[]\` 字符类
- \`()\` 分组
- \`|\` 或操作符

示例：\`/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/\` 用于匹配邮箱地址。

⚠️ **注意**: 正则表达式的性能可能会因复杂度而异。`
    },
    expectedConfidence: 0.65,
    tags: ['edge', 'special-characters', 'regex', 'emoji']
  }
];

/**
 * 性能测试用例
 * 测试大量内容和复杂结构的处理性能
 */
export const performanceTestCases: TestCase[] = [
  {
    id: 'perf-001',
    name: '大量文本内容',
    description: '测试处理大量文本内容的性能',
    category: 'performance',
    input: `## 什么是机器学习？

机器学习（Machine Learning, ML）是人工智能（AI）的一个分支，它使用算法和统计模型来使计算机系统能够在没有明确编程的情况下，通过经验自动改进性能。机器学习算法通过训练数据来构建数学模型，以便对新的、未见过的数据做出预测或决策。

机器学习的主要类型包括：

1. **监督学习（Supervised Learning）**：使用标记的训练数据来学习输入和输出之间的映射关系。常见的监督学习任务包括分类和回归。分类任务的目标是预测离散的类别标签，而回归任务的目标是预测连续的数值。监督学习算法包括线性回归、逻辑回归、决策树、随机森林、支持向量机、神经网络等。

2. **无监督学习（Unsupervised Learning）**：在没有标记数据的情况下发现数据中的隐藏模式或结构。常见的无监督学习任务包括聚类、降维和关联规则学习。聚类算法如K-means、层次聚类等，用于将相似的数据点分组。降维算法如主成分分析（PCA）、t-SNE等，用于减少数据的维度同时保持重要信息。

3. **强化学习（Reinforcement Learning）**：通过与环境的交互来学习最优的行为策略。智能体在环境中执行动作，根据获得的奖励或惩罚来调整其策略，以最大化长期累积奖励。强化学习在游戏、机器人控制、自动驾驶等领域有广泛应用。

机器学习的应用领域非常广泛，包括但不限于：图像识别、自然语言处理、推荐系统、金融风险评估、医疗诊断、自动驾驶、语音识别、机器翻译、搜索引擎优化、欺诈检测、预测性维护、个性化营销等。

随着大数据和计算能力的发展，深度学习作为机器学习的一个子领域也得到了快速发展。深度学习使用多层神经网络来学习数据的复杂表示，在图像识别、语音识别、自然语言处理等任务上取得了突破性进展。`,
    expectedFields: {
      question: '什么是机器学习？',
      answer: `机器学习（Machine Learning, ML）是人工智能（AI）的一个分支，它使用算法和统计模型来使计算机系统能够在没有明确编程的情况下，通过经验自动改进性能。机器学习算法通过训练数据来构建数学模型，以便对新的、未见过的数据做出预测或决策。

机器学习的主要类型包括：

1. **监督学习（Supervised Learning）**：使用标记的训练数据来学习输入和输出之间的映射关系。常见的监督学习任务包括分类和回归。分类任务的目标是预测离散的类别标签，而回归任务的目标是预测连续的数值。监督学习算法包括线性回归、逻辑回归、决策树、随机森林、支持向量机、神经网络等。

2. **无监督学习（Unsupervised Learning）**：在没有标记数据的情况下发现数据中的隐藏模式或结构。常见的无监督学习任务包括聚类、降维和关联规则学习。聚类算法如K-means、层次聚类等，用于将相似的数据点分组。降维算法如主成分分析（PCA）、t-SNE等，用于减少数据的维度同时保持重要信息。

3. **强化学习（Reinforcement Learning）**：通过与环境的交互来学习最优的行为策略。智能体在环境中执行动作，根据获得的奖励或惩罚来调整其策略，以最大化长期累积奖励。强化学习在游戏、机器人控制、自动驾驶等领域有广泛应用。

机器学习的应用领域非常广泛，包括但不限于：图像识别、自然语言处理、推荐系统、金融风险评估、医疗诊断、自动驾驶、语音识别、机器翻译、搜索引擎优化、欺诈检测、预测性维护、个性化营销等。

随着大数据和计算能力的发展，深度学习作为机器学习的一个子领域也得到了快速发展。深度学习使用多层神经网络来学习数据的复杂表示，在图像识别、语音识别、自然语言处理等任务上取得了突破性进展。`,
      notes: `## 什么是机器学习？

机器学习（Machine Learning, ML）是人工智能（AI）的一个分支，它使用算法和统计模型来使计算机系统能够在没有明确编程的情况下，通过经验自动改进性能。机器学习算法通过训练数据来构建数学模型，以便对新的、未见过的数据做出预测或决策。

机器学习的主要类型包括：

1. **监督学习（Supervised Learning）**：使用标记的训练数据来学习输入和输出之间的映射关系。常见的监督学习任务包括分类和回归。分类任务的目标是预测离散的类别标签，而回归任务的目标是预测连续的数值。监督学习算法包括线性回归、逻辑回归、决策树、随机森林、支持向量机、神经网络等。

2. **无监督学习（Unsupervised Learning）**：在没有标记数据的情况下发现数据中的隐藏模式或结构。常见的无监督学习任务包括聚类、降维和关联规则学习。聚类算法如K-means、层次聚类等，用于将相似的数据点分组。降维算法如主成分分析（PCA）、t-SNE等，用于减少数据的维度同时保持重要信息。

3. **强化学习（Reinforcement Learning）**：通过与环境的交互来学习最优的行为策略。智能体在环境中执行动作，根据获得的奖励或惩罚来调整其策略，以最大化长期累积奖励。强化学习在游戏、机器人控制、自动驾驶等领域有广泛应用。

机器学习的应用领域非常广泛，包括但不限于：图像识别、自然语言处理、推荐系统、金融风险评估、医疗诊断、自动驾驶、语音识别、机器翻译、搜索引擎优化、欺诈检测、预测性维护、个性化营销等。

随着大数据和计算能力的发展，深度学习作为机器学习的一个子领域也得到了快速发展。深度学习使用多层神经网络来学习数据的复杂表示，在图像识别、语音识别、自然语言处理等任务上取得了突破性进展。`
    },
    expectedConfidence: 0.9,
    tags: ['performance', 'large-content', 'detailed']
  }
];

/**
 * 更多边缘测试用例
 */
export const additionalEdgeTestCases: TestCase[] = [
  {
    id: 'edge-004',
    name: '无标题纯文本',
    description: '测试没有标题的纯文本内容',
    category: 'edge',
    input: `这是一段没有标题的纯文本内容。它包含了一些关于编程的基本概念。

编程是一种创造性的活动，需要逻辑思维和问题解决能力。

学习编程的建议：
- 从基础语法开始
- 多做练习项目
- 阅读优秀的代码
- 参与开源项目`,
    expectedFields: {
      question: '这是一段没有标题的纯文本内容。它包含了一些关于编程的基本概念。',
      answer: `编程是一种创造性的活动，需要逻辑思维和问题解决能力。

学习编程的建议：
- 从基础语法开始
- 多做练习项目
- 阅读优秀的代码
- 参与开源项目`,
      notes: `这是一段没有标题的纯文本内容。它包含了一些关于编程的基本概念。

编程是一种创造性的活动，需要逻辑思维和问题解决能力。

学习编程的建议：
- 从基础语法开始
- 多做练习项目
- 阅读优秀的代码
- 参与开源项目`
    },
    expectedConfidence: 0.4,
    tags: ['edge', 'no-heading', 'plain-text']
  },

  {
    id: 'edge-005',
    name: '数学公式和代码混合',
    description: '测试包含数学公式和代码的复杂内容',
    category: 'edge',
    input: `## 什么是算法复杂度？

算法复杂度是衡量算法效率的重要指标，通常用大O记号表示。

### 时间复杂度

常见的时间复杂度：
- $O(1)$: 常数时间
- $O(\\log n)$: 对数时间
- $O(n)$: 线性时间
- $O(n \\log n)$: 线性对数时间
- $O(n^2)$: 平方时间

### 示例分析

冒泡排序的时间复杂度分析：

\`\`\`python
def bubble_sort(arr):
    n = len(arr)
    for i in range(n):        # 外层循环 O(n)
        for j in range(0, n-i-1):  # 内层循环 O(n)
            if arr[j] > arr[j+1]:
                arr[j], arr[j+1] = arr[j+1], arr[j]
    return arr
\`\`\`

总时间复杂度：$O(n) \\times O(n) = O(n^2)$

**重要公式**: $T(n) = c_1 \\cdot n^2 + c_2 \\cdot n + c_3$，其中 $c_1, c_2, c_3$ 是常数。`,
    expectedFields: {
      question: '什么是算法复杂度？',
      answer: `算法复杂度是衡量算法效率的重要指标，通常用大O记号表示。

### 时间复杂度

常见的时间复杂度：
- $O(1)$: 常数时间
- $O(\\log n)$: 对数时间
- $O(n)$: 线性时间
- $O(n \\log n)$: 线性对数时间
- $O(n^2)$: 平方时间

### 示例分析

冒泡排序的时间复杂度分析：

\`\`\`python
def bubble_sort(arr):
    n = len(arr)
    for i in range(n):        # 外层循环 O(n)
        for j in range(0, n-i-1):  # 内层循环 O(n)
            if arr[j] > arr[j+1]:
                arr[j], arr[j+1] = arr[j+1], arr[j]
    return arr
\`\`\`

总时间复杂度：$O(n) \\times O(n) = O(n^2)$

**重要公式**: $T(n) = c_1 \\cdot n^2 + c_2 \\cdot n + c_3$，其中 $c_1, c_2, c_3$ 是常数。`,
      notes: `## 什么是算法复杂度？

算法复杂度是衡量算法效率的重要指标，通常用大O记号表示。

### 时间复杂度

常见的时间复杂度：
- $O(1)$: 常数时间
- $O(\\log n)$: 对数时间
- $O(n)$: 线性时间
- $O(n \\log n)$: 线性对数时间
- $O(n^2)$: 平方时间

### 示例分析

冒泡排序的时间复杂度分析：

\`\`\`python
def bubble_sort(arr):
    n = len(arr)
    for i in range(n):        # 外层循环 O(n)
        for j in range(0, n-i-1):  # 内层循环 O(n)
            if arr[j] > arr[j+1]:
                arr[j], arr[j+1] = arr[j+1], arr[j]
    return arr
\`\`\`

总时间复杂度：$O(n) \\times O(n) = O(n^2)$

**重要公式**: $T(n) = c_1 \\cdot n^2 + c_2 \\cdot n + c_3$，其中 $c_1, c_2, c_3$ 是常数。`
    },
    expectedConfidence: 0.7,
    tags: ['edge', 'math-formula', 'code', 'latex']
  }
];

/**
 * 回归测试用例
 * 测试之前修复的问题是否重新出现
 */
export const regressionTestCases: TestCase[] = [
  {
    id: 'regression-001',
    name: '内容截断问题回归测试',
    description: '确保之前修复的内容截断问题不会重新出现',
    category: 'regression',
    input: `## 解释JavaScript中的原型链

JavaScript中的原型链是一种对象继承机制。每个对象都有一个内部属性[[Prototype]]，指向另一个对象。

### 原型链的工作原理

当访问对象的属性时，JavaScript引擎会：
1. 首先在对象自身查找属性
2. 如果没有找到，就在对象的原型中查找
3. 如果还没有找到，就继续在原型的原型中查找
4. 这个过程会一直持续到找到属性或到达原型链的末端（null）

### 示例代码

\`\`\`javascript
function Person(name) {
  this.name = name;
}

Person.prototype.sayHello = function() {
  console.log('Hello, I am ' + this.name);
};

const john = new Person('John');
john.sayHello(); // 输出: Hello, I am John
\`\`\`

### 重要概念

- **prototype属性**: 函数对象特有的属性，指向原型对象
- **__proto__属性**: 所有对象都有的属性，指向对象的原型
- **constructor属性**: 原型对象的属性，指向构造函数

这种机制使得JavaScript能够实现继承和代码复用，是理解JavaScript面向对象编程的关键。`,
    expectedFields: {
      question: '解释JavaScript中的原型链',
      answer: `JavaScript中的原型链是一种对象继承机制。每个对象都有一个内部属性[[Prototype]]，指向另一个对象。

### 原型链的工作原理

当访问对象的属性时，JavaScript引擎会：
1. 首先在对象自身查找属性
2. 如果没有找到，就在对象的原型中查找
3. 如果还没有找到，就继续在原型的原型中查找
4. 这个过程会一直持续到找到属性或到达原型链的末端（null）

### 示例代码

\`\`\`javascript
function Person(name) {
  this.name = name;
}

Person.prototype.sayHello = function() {
  console.log('Hello, I am ' + this.name);
};

const john = new Person('John');
john.sayHello(); // 输出: Hello, I am John
\`\`\`

### 重要概念

- **prototype属性**: 函数对象特有的属性，指向原型对象
- **__proto__属性**: 所有对象都有的属性，指向对象的原型
- **constructor属性**: 原型对象的属性，指向构造函数

这种机制使得JavaScript能够实现继承和代码复用，是理解JavaScript面向对象编程的关键。`,
      notes: `## 解释JavaScript中的原型链

JavaScript中的原型链是一种对象继承机制。每个对象都有一个内部属性[[Prototype]]，指向另一个对象。

### 原型链的工作原理

当访问对象的属性时，JavaScript引擎会：
1. 首先在对象自身查找属性
2. 如果没有找到，就在对象的原型中查找
3. 如果还没有找到，就继续在原型的原型中查找
4. 这个过程会一直持续到找到属性或到达原型链的末端（null）

### 示例代码

\`\`\`javascript
function Person(name) {
  this.name = name;
}

Person.prototype.sayHello = function() {
  console.log('Hello, I am ' + this.name);
};

const john = new Person('John');
john.sayHello(); // 输出: Hello, I am John
\`\`\`

### 重要概念

- **prototype属性**: 函数对象特有的属性，指向原型对象
- **__proto__属性**: 所有对象都有的属性，指向对象的原型
- **constructor属性**: 原型对象的属性，指向构造函数

这种机制使得JavaScript能够实现继承和代码复用，是理解JavaScript面向对象编程的关键。`
    },
    expectedConfidence: 0.85,
    tags: ['regression', 'truncation-fix', 'multi-section'],
    notes: '这个测试用例专门用于验证内容截断问题的修复是否有效'
  }
];

/**
 * 完整的测试套件
 */
export const comprehensiveTestSuite: TestSuite = {
  name: '综合测试套件',
  description: '包含各种复杂情况的完整测试用例集',
  cases: [
    ...basicTestCases,
    ...complexTestCases,
    ...edgeTestCases,
    ...additionalEdgeTestCases,
    ...performanceTestCases,
    ...regressionTestCases
  ]
};

/**
 * 按分类获取测试用例
 */
export function getTestCasesByCategory(category: TestCase['category']): TestCase[] {
  return comprehensiveTestSuite.cases.filter(testCase => testCase.category === category);
}

/**
 * 按标签获取测试用例
 */
export function getTestCasesByTag(tag: string): TestCase[] {
  return comprehensiveTestSuite.cases.filter(testCase => testCase.tags.includes(tag));
}

/**
 * 获取所有测试用例ID
 */
export function getAllTestCaseIds(): string[] {
  return comprehensiveTestSuite.cases.map(testCase => testCase.id);
}

/**
 * 根据ID获取测试用例
 */
export function getTestCaseById(id: string): TestCase | undefined {
  return comprehensiveTestSuite.cases.find(testCase => testCase.id === id);
}
