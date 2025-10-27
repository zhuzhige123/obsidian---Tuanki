#!/bin/bash

# 设置颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 清屏
clear

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    🚀 Tuanki 开发服务器                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 错误: 未找到 Node.js，请先安装 Node.js${NC}"
    echo -e "${BLUE}📥 下载地址: https://nodejs.org/${NC}"
    exit 1
fi

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ 错误: 未找到 npm${NC}"
    exit 1
fi

# 显示环境信息
echo -e "${BLUE}📋 环境信息:${NC}"
echo -e "   Node.js: $(node --version)"
echo -e "   npm: $(npm --version)"
echo -e "   项目目录: $(pwd)"
echo ""

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 首次运行，正在安装依赖...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ 依赖安装失败${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ 依赖安装完成${NC}"
    echo ""
fi

# 检查环境配置
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  未找到 .env 文件，将使用默认配置${NC}"
    echo -e "${BLUE}💡 提示: 复制 .env.example 为 .env 并配置您的 Obsidian 路径${NC}"
    echo ""
fi

# 显示启动选项
echo -e "${PURPLE}🎯 请选择启动模式:${NC}"
echo "   1. 标准开发模式 (推荐)"
echo "   2. 增强开发模式 (带性能监控)"
echo "   3. 详细日志模式"
echo "   4. 静默模式"
echo "   5. 直接 Vite 模式"
echo ""

read -p "请输入选择 (1-5): " choice

case $choice in
    1)
        echo -e "${GREEN}🚀 启动标准开发模式...${NC}"
        npm run dev:enhanced
        ;;
    2)
        echo -e "${GREEN}🚀 启动增强开发模式...${NC}"
        npm run dev:perf
        ;;
    3)
        echo -e "${GREEN}🚀 启动详细日志模式...${NC}"
        npm run dev:verbose
        ;;
    4)
        echo -e "${GREEN}🚀 启动静默模式...${NC}"
        npm run dev:quiet
        ;;
    5)
        echo -e "${GREEN}🚀 启动直接 Vite 模式...${NC}"
        npm run dev
        ;;
    *)
        echo -e "${YELLOW}❌ 无效选择，使用默认模式${NC}"
        npm run dev:enhanced
        ;;
esac

echo ""
echo -e "${YELLOW}🛑 开发服务器已停止${NC}"
