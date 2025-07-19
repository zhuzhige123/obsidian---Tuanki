# 🎯 Tuanki - AI-Powered Anki Integration for Obsidian

<div align="center">

![Tuanki Logo](https://via.placeholder.com/200x200/4F46E5/FFFFFF?text=TUANKI)

**Transform your Obsidian notes into intelligent Anki cards with AI-powered generation and FSRS 5 spaced repetition**

[![GitHub release](https://img.shields.io/github/v/release/YOUR_USERNAME/tuanki-obsidian-plugin)](https://github.com/YOUR_USERNAME/tuanki-obsidian-plugin/releases)
[![Downloads](https://img.shields.io/github/downloads/YOUR_USERNAME/tuanki-obsidian-plugin/total)](https://github.com/YOUR_USERNAME/tuanki-obsidian-plugin/releases)
[![License](https://img.shields.io/github/license/YOUR_USERNAME/tuanki-obsidian-plugin)](LICENSE)
[![Stars](https://img.shields.io/github/stars/YOUR_USERNAME/tuanki-obsidian-plugin)](https://github.com/YOUR_USERNAME/tuanki-obsidian-plugin/stargazers)

[📥 Download](#installation) • [📖 Documentation](#documentation) • [🚀 Features](#features) • [🤝 Contributing](#contributing)

</div>

## ✨ Features

### 🤖 AI-Powered Card Generation
- **Intelligent Content Analysis**: Automatically extracts key concepts from your notes
- **Smart Question Generation**: Creates meaningful questions based on content context
- **Multiple Card Types**: Supports basic, cloze, and image occlusion cards
- **Batch Processing**: Generate multiple cards from long-form content

### 📚 Advanced Spaced Repetition
- **FSRS 5 Algorithm**: Latest research-backed scheduling for optimal retention
- **Adaptive Learning**: Adjusts difficulty based on your performance
- **Memory Prediction**: Estimates retention probability for each card
- **Personalized Scheduling**: Learns your memory patterns over time

### 🎨 Modern User Interface
- **Responsive Design**: Works seamlessly on desktop and mobile
- **Dark/Light Theme**: Matches your Obsidian theme preferences
- **Intuitive Controls**: Clean, modern interface built with Svelte 5
- **Accessibility**: Full keyboard navigation and screen reader support

### 📊 Comprehensive Analytics
- **Learning Statistics**: Track your progress with detailed metrics
- **Retention Analysis**: Visualize memory strength over time
- **Performance Insights**: Identify areas for improvement
- **Study Streaks**: Maintain motivation with progress tracking

## 🚀 Quick Start

### Installation

#### Method 1: Obsidian Community Plugins (Recommended)
1. Open Obsidian Settings
2. Navigate to Community Plugins
3. Search for "Tuanki"
4. Click Install and Enable

#### Method 2: Manual Installation
1. Download the latest release from [GitHub Releases](https://github.com/YOUR_USERNAME/tuanki-obsidian-plugin/releases)
2. Extract the zip file to `.obsidian/plugins/tuanki/` in your vault
3. Enable the plugin in Obsidian Settings > Community Plugins

### First Steps
1. **Configure Anki Connection**: Set up sync with your Anki desktop app
2. **Create Your First Cards**: Select text and use the "Generate Cards" command
3. **Start Studying**: Open the study interface and begin your learning journey
4. **Review Analytics**: Check your progress in the statistics dashboard

## 📖 Documentation

### Basic Usage

#### Generating Cards from Notes
```markdown
# Your Note Content
This is important information about **machine learning**.

Machine learning is a subset of artificial intelligence that focuses on algorithms.
```

1. Select the text you want to convert
2. Use `Ctrl+Shift+A` (or `Cmd+Shift+A` on Mac)
3. Choose card type and review generated questions
4. Confirm to add to your Anki deck

#### Study Interface
- **Review Cards**: Interactive study sessions with immediate feedback
- **Difficulty Rating**: Rate cards as Again, Hard, Good, or Easy
- **Progress Tracking**: See remaining cards and estimated study time
- **Keyboard Shortcuts**: Space for reveal, 1-4 for difficulty rating

### Advanced Features

#### Custom Card Templates
```javascript
// Example custom template
{
  "name": "Definition Card",
  "front": "What is {{term}}?",
  "back": "{{definition}}\n\n{{context}}",
  "tags": ["definition", "{{subject}}"]
}
```

#### FSRS 5 Configuration
- **Learning Steps**: Customize initial learning intervals
- **Retention Target**: Set desired retention rate (default: 90%)
- **Maximum Interval**: Limit maximum review intervals
- **Difficulty Adjustment**: Fine-tune algorithm parameters

## ⚙️ Configuration

### Plugin Settings
- **Anki Integration**: Configure deck names and sync settings
- **AI Generation**: Adjust AI model parameters and prompts
- **Study Interface**: Customize appearance and behavior
- **Keyboard Shortcuts**: Set up custom hotkeys

### Anki Setup
1. Install AnkiConnect add-on in Anki desktop
2. Configure CORS settings for web access
3. Set up target deck for generated cards
4. Enable automatic synchronization

## 🔧 Development

### Building from Source
```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/tuanki-obsidian-plugin.git
cd tuanki-obsidian-plugin

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Project Structure
```
src/
├── components/          # Svelte UI components
├── services/           # Core business logic
├── stores/             # State management
├── utils/              # Helper functions
└── main.ts            # Plugin entry point
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Ways to Contribute
- 🐛 Report bugs and issues
- 💡 Suggest new features
- 📝 Improve documentation
- 🔧 Submit code improvements
- 🌍 Help with translations

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **FSRS Algorithm**: Thanks to the FSRS research team for the excellent spaced repetition algorithm
- **Obsidian Community**: For feedback, testing, and feature suggestions
- **Anki Project**: For inspiration and the foundation of spaced repetition learning
- **Open Source Libraries**: All the amazing tools that make this plugin possible

## 📞 Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/YOUR_USERNAME/tuanki-obsidian-plugin/issues)
- **Discussions**: [Join community discussions](https://github.com/YOUR_USERNAME/tuanki-obsidian-plugin/discussions)
- **Documentation**: [Full documentation](https://tuanki.dev/docs)
- **Email**: support@tuanki.dev

---

<div align="center">

**Made with ❤️ for the Obsidian community**

[⭐ Star this project](https://github.com/YOUR_USERNAME/tuanki-obsidian-plugin) if you find it useful!

</div>
