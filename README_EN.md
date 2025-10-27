# 🎯 Tuanki - Smart Flashcard Plugin for Obsidian

<div align="center">

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-0.15.0+-purple.svg)](https://obsidian.md)
[![GitHub Stars](https://img.shields.io/github/stars/zhuzhige123/obsidian---Tuanki?style=social)](https://github.com/zhuzhige123/obsidian---Tuanki)

**Modern Spaced Repetition Learning Plugin for Obsidian**

Based on FSRS6 Algorithm | Elegant Svelte 5 UI | Open Source Code + Commercial License

[Quick Start](#-quick-start) · [Features](#-core-features) · [Business Model](#-business-model) · [Installation](#-installation) · [Purchase License](#-purchase-license)

[中文文档](./README.md) | **English**

</div>

---

## 💎 Business Model

Tuanki adopts an **Open Source Code + Commercial License** business model.

### Why Open Source but Requires a License?

1. **Transparency & Trust** - All code is open source, accepting community audits for security and quality assurance
2. **Compliance** - Meets Obsidian official plugin marketplace requirements
3. **Sustainable Development** - License revenue supports continuous development, maintenance, and technical support
4. **Community Contribution** - Welcome open source contributions; active contributors can receive free licenses

This model is similar to Sublime Text and JetBrains products - code is visible but requires a license to activate premium features.

### Free Features (No License Required)

Core features are completely free for all users:

- ✅ **Card Creation & Editing** - Support for multiple card types
- ✅ **FSRS6 Algorithm** - Scientific spaced repetition scheduling
- ✅ **Basic Statistics** - Learning progress and retention rate tracking
- ✅ **Data Import/Export** - JSON and CSV format support
- ✅ **Anki Sync** - Import data from Anki
- ✅ **APKG Import** - Quick migration of learning content
- ✅ **Basic Table View** - Efficient card management

### Premium Features (License Required)

Unlock all premium features with a license:

- 💎 **AI Smart Card Generation** - Batch generate high-quality cards using AI
- 💎 **Batch Operations** - Efficient bulk editing and management tools
- 💎 **Advanced Analytics** - Detailed learning data analysis, heatmaps, trend charts
- 💎 **Grid View** - Beautiful card grid display
- 💎 **Kanban View** - Kanban-style learning management
- 💎 **Tuanki Annotation System** - Create cards quickly from document annotations
- 💎 **All Future Premium Features** - Lifetime free updates

### License Technical Details

- **Encryption**: RSA-2048 digital signature
- **Verification**: Completely offline verification, privacy-protected
- **Open Transparency**: Verification logic is fully open source and auditable
- **Public Key Disclosure**: Public key in code is secure (RSA encryption principle)
- **Privacy Protection**: No user data uploaded

---

## ✨ Highlights

### 🧠 Smart Learning Algorithm
- **FSRS6 Algorithm**: Intelligent scheduling system trained on extensive learning data
- **Adaptive Learning**: Dynamically adjust review intervals based on personal performance
- **Scientific Memory Modeling**: Accurately predict forgetting time to optimize learning efficiency

### 🎨 Modern Interface
- **Clean & Elegant Design**: Refined visual style with attention to every detail
- **Responsive Layout**: Perfectly adapts to various screen sizes
- **Smooth Animations**: High-performance interactions based on Svelte 5
- **Theme Integration**: Seamlessly integrates with Obsidian's theme system

### 🔒 Privacy First
- **Local Storage**: All data stored in local Vault
- **Offline Usage**: No network connection required
- **Open Transparency**: Code is completely open source, accepting community audits

---

## 🚀 Core Features

### 📝 Card Creation & Editing
- **Multiple Card Types**: Basic cards, multiple choice, cloze deletion, image occlusion, etc.
- **Markdown Support**: Full Markdown syntax support
- **Smart Parsing**: Automatically recognize card types and content
- **Batch Creation**: Efficient batch card creation tools

### 📊 Learning & Review
- **Smart Scheduling**: FSRS6 algorithm precisely predicts review times
- **Multiple Views**: Card table, grid view, kanban view
- **Learning Statistics**: Detailed learning data analysis and visualization
- **Custom Templates**: Flexible card template system

### 🔄 Data Management
- **Anki Sync**: Complete Anki data import/export
- **APKG Import**: Support importing Anki card decks
- **JSON/CSV Export**: Convenient data backup and migration

### 🤖 AI Assistance (API Key Required)
- **AI Smart Card Generation**: Batch generate high-quality cards using AI
- **Multiple Service Providers**: OpenAI, Claude, local models, etc.
- **Smart Formatting**: Automatically optimize card content and format

### 🚀 Future Planned Features

The following features are under development and will be released in future versions:

#### 📚 Incremental Reading
- **Smart Article Splitting**: Automatically split long articles into learning-friendly segments
- **Reading Progress Tracking**: Record reading position, support pause and resume
- **Highlight Extraction**: Automatically generate review cards from annotations
- **Priority Scheduling**: Arrange reading plans based on importance and forgetting curve

#### 💪 Practice Mode
- **Focused Training**: Concentrated practice on specific knowledge points
- **Wrong Question Bank**: Automatically collect incorrect cards for focused review
- **Timed Challenges**: Simulate exam environment to improve answering speed
- **Performance Analysis**: Detailed accuracy statistics and weakness analysis
- **Mock Exams**: Randomly select cards for simulated testing

#### 🌟 Other Planned Features
- **Mobile Optimization**: Complete mobile support
- **Collaborative Learning**: Share decks and learning progress
- **Voice Review**: Support voice reading and recording answers
- **Enhanced Image Occlusion**: More powerful image annotation and occlusion features

💡 License purchasers will **receive all future feature updates for free**, no additional payment required!

---

## 📦 Installation

### Method 1: Obsidian Community Plugin (Recommended)

1. Open Obsidian Settings
2. Go to "Community Plugins" → "Browse"
3. Search for "Tuanki"
4. Click "Install" → "Enable"

### Method 2: Manual Installation

1. Download the latest Release
2. Extract to Vault's `.obsidian/plugins/tuanki/` directory
3. Restart Obsidian
4. Enable plugin in settings

### Method 3: Build from Source

```bash
# Clone repository
git clone https://github.com/zhuzhige123/obsidian---Tuanki.git
cd obsidian---Tuanki

# Install dependencies
npm install

# Development mode
npm run dev

# Build production version
npm run build
```

---

## 📖 Quick Start

### 1. Create Cards

Tuanki supports multiple card types using standard Markdown syntax:

#### 📌 Basic Q&A Cards

Use `---div---` to separate questions and answers:

```markdown
## What is spaced repetition learning?

Spaced repetition learning is a learning technique that improves long-term memory retention by increasing review intervals.

---div---

### Core Principles

Spaced repetition is based on the **forgetting curve** theory:
- Review at the point of near-forgetting
- Extend intervals after each successful recall
- Gradually transfer knowledge to long-term memory

💡 **Tip**: This is one of the most effective learning methods
```

**Format Notes**:
- Use `---div---` to separate front (question) and back (answer)
- Back content is optional, questions can stand alone
- Supports full Markdown syntax (headings, lists, code blocks, etc.)

#### 📌 Cloze Deletion Cards

Use `==highlight syntax==` to mark content for cloze deletion:

```markdown
In JavaScript, the ==map()== method creates a new array, and ==filter()== method filters arrays.

Example code:
\`\`\`javascript
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(x => x * 2);  // [2, 4, 6, 8, 10]
const evens = numbers.filter(x => x % 2 === 0);  // [2, 4]
\`\`\`
```

**Compatible with Anki syntax**:

```markdown
React's core concepts are {{c1::components}} and {{c2::state management}}.
```

**Format Notes**:
- Use `==content==` for cloze deletion (recommended, Obsidian highlight syntax)
- Also supports `{{c1::content}}` Anki format
- Can have multiple cloze deletions

#### 📌 Multiple Choice Questions

Use standard format to create multiple choice questions:

```markdown
Q: What is the core principle of spaced repetition learning?

A) Review at fixed times daily
B) Review at the point of near-forgetting {✓}
C) Random review
D) Only review difficult items
```

**Supports multiple-answer questions**:

```markdown
Q: Which of the following are spaced repetition software?

A) Anki {✓}
B) Notion
C) SuperMemo {✓}
D) Obsidian
E) Tuanki {✓}
```

**Multiple choice with explanation**:

```markdown
Q: What is the main improvement of FSRS algorithm over SM-2?

A) Simpler formula
B) Personalized parameter optimization {✓}
C) Shorter review intervals
D) Fixed difficulty coefficient

---div---

💡 **Explanation**: FSRS algorithm introduces personalized parameter optimization, adjusting algorithm parameters based on actual user learning data for more accurate review time predictions.
```

**Format Notes**:
- Use `Q:` to indicate the question
- Use `A) B) C) D)` to label options (with parentheses)
- Use `{✓}` to mark correct answers
- Use `---div---` to separate explanation (optional)
- Supports multiple correct answers (multiple-choice)

### 2. Start Learning

1. Click the Tuanki icon in the sidebar
2. Select the deck to study
3. Click "Start Learning"
4. Choose difficulty based on memory:
   - ⚡ **Again** - Completely forgot
   - 🤔 **Hard** - Barely remembered
   - 👍 **Good** - Correctly answered
   - ✨ **Easy** - Easily remembered

### 4. View Statistics

View on the statistics page:
- 📊 Learning progress and memory curves
- 🔥 Daily learning heatmap
- 📈 Card difficulty distribution
- ⏰ Review time predictions

---

## 💰 Purchase License

### Pricing

- 🎁 **Early Bird**: ¥46 (~$6.5 USD) (Limited time offer, first come first served)
- 💰 **Regular Price**: ¥64 (~$9 USD) (Lifetime license, one-time purchase)
- 🚀 **Final Price**: ¥78 (~$11 USD) (After all planned features are completed)

### How to Purchase

[Click to Purchase License](mailto:tutaoyuan8@outlook.com?subject=Purchase%20Tuanki%20License)

Or send email to: tutaoyuan8@outlook.com

### License Benefits

- ✅ Unlock all premium features
- ✅ Lifetime free updates
- ✅ Priority technical support
- ✅ Participate in beta testing of new features
- ✅ Support continuous project development

---

## 🤝 Contribution

We welcome all forms of contributions!

### Contributor Benefits

Active contributors can receive **free licenses**!

- **Code Contributions**: Bug fixes, new feature development
- **Documentation Contributions**: Translate docs, write tutorials
- **Community Contributions**: Answer questions, test feedback

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details

### How to Contribute

1. Fork this repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 🛠️ Tech Stack

- **Frontend Framework**: Svelte 5 + TypeScript
- **Style System**: UnoCSS + CSS Variables
- **Algorithm Core**: FSRS6 spaced repetition algorithm
- **Build Tool**: Vite + Hot Module Replacement
- **Testing Framework**: Vitest

---

## 📝 FAQ

### Q: Why charge if the code is open source?

**A**: Tuanki adopts an "open source code + commercial license" model. Open source code ensures transparency and compliance with Obsidian standards, while license revenue supports continuous development and maintenance. This is a mature business model in the software industry (like Sublime Text, JetBrains).

### Q: Can I modify the code to bypass license verification?

**A**: Technically yes, we won't prevent it. However:
- Cracked versions cannot receive official technical support
- Cracked versions cannot receive automatic updates
- Purchasing a license supports project development
- Legitimate users enjoy seamless upgrade experience

### Q: Where is data stored?

**A**: All data is stored in your Obsidian Vault, completely local to protect your privacy.

### Q: How to backup data?

**A**: Data is stored in Vault's `.obsidian/plugins/tuanki/data.json`, you can backup this file anytime.

### Q: Mobile support?

**A**: Currently optimized for desktop, mobile support is under development.

For more questions, see [LICENSE_FAQ.md](./LICENSE_FAQ.md)

---

## 📞 Contact

- **Developer Email**: tutaoyuan8@outlook.com
- **GitHub Issues**: [Bug Reports](https://github.com/zhuzhige123/obsidian---Tuanki/issues)
- **GitHub Discussions**: [Feature Discussions](https://github.com/zhuzhige123/obsidian---Tuanki/discussions)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 🙏 Acknowledgments

- [Obsidian](https://obsidian.md) - Excellent knowledge management platform
- [FSRS](https://github.com/open-spaced-repetition/fsrs-rs) - Scientific spaced repetition algorithm
- [Svelte](https://svelte.dev) - Modern frontend framework
- All contributors and supporters ❤️

---

<div align="center">

**If this project helps you, please give us a ⭐ Star!**

Made with ❤️ by Tuanki Team

</div>

