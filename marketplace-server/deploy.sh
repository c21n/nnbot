#!/bin/bash
# NNBot Marketplace Server 部署脚本
# 用法: bash deploy.sh

set -e

SERVER_IP="46.62.246.153"
SERVER_USER="root"
REMOTE_DIR="/opt/nnbot-marketplace"

echo "=========================================="
echo "  NNBot Marketplace Server 部署脚本"
echo "=========================================="
echo ""
echo "目标服务器: ${SERVER_USER}@${SERVER_IP}"
echo ""

# 1. 检查本地文件
echo "📦 检查本地文件..."
if [ ! -f "package.json" ]; then
    echo "❌ 请在 marketplace-server 目录运行此脚本"
    exit 1
fi

# 2. 创建远程目录
echo "📁 创建远程目录..."
ssh ${SERVER_USER}@${SERVER_IP} "mkdir -p ${REMOTE_DIR}"

# 3. 上传文件
echo "📤 上传文件..."
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='dist' \
    ./ ${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/

# 4. 在服务器上执行部署
echo "🔧 配置服务器..."
ssh ${SERVER_USER}@${SERVER_IP} << 'DEPLOY_SCRIPT'
#!/bin/bash
set -e

REMOTE_DIR="/opt/nnbot-marketplace"
cd ${REMOTE_DIR}

echo ""
echo "=========================================="
echo "  检查服务器环境"
echo "=========================================="

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "📥 安装 Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "✅ Node.js: $(node --version)"

# 检查 PostgreSQL
if ! command -v psql &> /dev/null; then
    echo "📥 安装 PostgreSQL..."
    apt-get update
    apt-get install -y postgresql postgresql-contrib
    systemctl start postgresql
    systemctl enable postgresql
fi
echo "✅ PostgreSQL: $(psql --version)"

# 配置 PostgreSQL
echo ""
echo "=========================================="
echo "  配置数据库"
echo "=========================================="

# 创建数据库和用户
sudo -u postgres psql << EOF
-- 创建用户（如果不存在）
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'marketplace') THEN
        CREATE USER marketplace WITH PASSWORD 'marketplace_secure_2024';
    END IF;
END
\$\$;

-- 创建数据库（如果不存在）
SELECT 'CREATE DATABASE marketplace OWNER marketplace'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'marketplace')\gexec

-- 授权
GRANT ALL PRIVILEGES ON DATABASE marketplace TO marketplace;
EOF

echo "✅ 数据库创建成功"

# 配置环境变量
echo ""
echo "=========================================="
echo "  配置环境变量"
echo "=========================================="

if [ ! -f ".env" ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    cat > .env << ENVEOF
# Server Configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=3001

# CORS Configuration
CORS_ORIGIN=http://46.62.246.153:8080,http://localhost:8080
CORS_CREDENTIALS=true

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=marketplace
DB_USER=marketplace
DB_PASSWORD=marketplace_secure_2024
DB_SSL=false

# GitHub OAuth Configuration - 需要修改
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://46.62.246.153:3001/api/auth/github/callback

# GitHub Plugin Repository - 需要修改
GITHUB_PLUGIN_REPO_OWNER=your_github_username
GITHUB_PLUGIN_REPO_NAME=nnbot-plugins

# JWT Configuration
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
ENVEOF
    echo "✅ 环境变量配置完成"
    echo "⚠️  请编辑 .env 文件配置 GitHub OAuth"
else
    echo "✅ 环境变量已存在"
fi

# 安装依赖
echo ""
echo "=========================================="
echo "  安装依赖"
echo "=========================================="
npm install

# 编译 TypeScript
echo ""
echo "=========================================="
echo "  编译代码"
echo "=========================================="
npm run build

# 运行数据库迁移
echo ""
echo "=========================================="
echo "  运行数据库迁移"
echo "=========================================="
npm run migrate || echo "⚠️  迁移失败，请手动检查"

# 创建 systemd 服务
echo ""
echo "=========================================="
echo "  创建系统服务"
echo "=========================================="

cat > /etc/systemd/system/nnbot-marketplace.service << 'SERVICEEOF'
[Unit]
Description=NNBot Marketplace Server
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/nnbot-marketplace
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICEEOF

# 重新加载 systemd 并启动服务
systemctl daemon-reload
systemctl enable nnbot-marketplace
systemctl restart nnbot-marketplace

echo ""
echo "=========================================="
echo "  ✅ 部署完成!"
echo "=========================================="
echo ""
echo "服务状态:"
systemctl status nnbot-marketplace --no-pager | head -15
echo ""
DEPLOY_SCRIPT

echo ""
echo "=========================================="
echo "  ✅ 部署成功!"
echo "=========================================="
echo ""
echo "📋 后续步骤:"
echo ""
echo "1. SSH 到服务器编辑配置:"
echo "   ssh ${SERVER_USER}@${SERVER_IP}"
echo "   nano ${REMOTE_DIR}/.env"
echo ""
echo "2. 配置 GitHub OAuth:"
echo "   - 访问: https://github.com/settings/developers"
echo "   - 点击 'New OAuth App'"
echo "   - Homepage URL: http://${SERVER_IP}:3001"
echo "   - Callback URL: http://${SERVER_IP}:3001/api/auth/github/callback"
echo "   - 复制 Client ID 和 Secret 到 .env"
echo ""
echo "3. 重启服务:"
echo "   systemctl restart nnbot-marketplace"
echo ""
echo "4. 查看日志:"
echo "   journalctl -u nnbot-marketplace -f"
echo ""
echo "5. 配置 NNBot 客户端:"
echo "   在 index.html 中设置:"
echo "   window.MARKETPLACE_API_URL = 'http://${SERVER_IP}:3001';"
echo ""
