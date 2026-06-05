# 市场服务器部署指南

## 目标服务器

- **IP**: 46.62.246.153
- **用户**: root
- **部署目录**: /opt/nnbot-marketplace

## 方式一：使用 Git Bash 自动部署

```bash
cd marketplace-server
bash deploy.sh
```

## 方式二：手动部署（推荐 Windows 用户）

### Step 1: 上传文件

使用 WinSCP 或 scp 上传 `marketplace-server` 目录到服务器：

```powershell
# 使用 scp（需要 Git Bash 或 Windows OpenSSH）
scp -r marketplace-server/ root@46.62.246.153:/opt/nnbot-marketplace
```

### Step 2: SSH 到服务器

```bash
ssh root@46.62.246.153
```

### Step 3: 安装依赖

```bash
# 更新系统
apt update && apt upgrade -y

# 安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 安装 PostgreSQL
apt install -y postgresql postgresql-contrib

# 启动 PostgreSQL
systemctl start postgresql
systemctl enable postgresql
```

### Step 4: 配置数据库

```bash
# 切换到 postgres 用户
sudo -u postgres psql

# 在 psql 中执行：
CREATE USER marketplace WITH PASSWORD 'marketplace_secure_2024';
CREATE DATABASE marketplace OWNER marketplace;
GRANT ALL PRIVILEGES ON DATABASE marketplace TO marketplace;
\q
```

### Step 5: 配置环境变量

```bash
cd /opt/nnbot-marketplace

# 生成 JWT Secret
JWT_SECRET=$(openssl rand -hex 32)

# 创建 .env 文件
cat > .env << EOF
SERVER_HOST=0.0.0.0
SERVER_PORT=3001
CORS_ORIGIN=http://46.62.246.153:8080,http://localhost:8080
CORS_CREDENTIALS=true
DB_HOST=localhost
DB_PORT=5432
DB_NAME=marketplace
DB_USER=marketplace
DB_PASSWORD=marketplace_secure_2024
DB_SSL=false
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://46.62.246.153:3001/api/auth/github/callback
GITHUB_PLUGIN_REPO_OWNER=your_github_username
GITHUB_PLUGIN_REPO_NAME=nnbot-plugins
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
EOF
```

### Step 6: 安装依赖并编译

```bash
cd /opt/nnbot-marketplace
npm install
npm run build
npm run migrate
```

### Step 7: 创建系统服务

```bash
cat > /etc/systemd/system/nnbot-marketplace.service << 'EOF'
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
EOF

systemctl daemon-reload
systemctl enable nnbot-marketplace
systemctl start nnbot-marketplace
```

### Step 8: 验证服务

```bash
# 查看服务状态
systemctl status nnbot-marketplace

# 查看日志
journalctl -u nnbot-marketplace -f

# 测试 API
curl http://localhost:3001/api/search
```

## GitHub OAuth 配置

1. 访问 https://github.com/settings/developers
2. 点击 **New OAuth App**
3. 填写信息：
   - **Application name**: NNBot Marketplace
   - **Homepage URL**: `http://46.62.246.153:3001`
   - **Authorization callback URL**: `http://46.62.246.153:3001/api/auth/github/callback`
4. 创建后复制 **Client ID** 和 **Client Secret**
5. 编辑服务器上的 `.env` 文件

## 配置 NNBot 客户端

在 `src/webui/public/index.html` 中添加：

```html
<script>
  window.MARKETPLACE_API_URL = 'http://46.62.246.153:3001';
</script>
```

## 常用命令

```bash
# 查看服务状态
systemctl status nnbot-marketplace

# 重启服务
systemctl restart nnbot-marketplace

# 查看实时日志
journalctl -u nnbot-marketplace -f

# 停止服务
systemctl stop nnbot-marketplace

# 编辑配置
nano /opt/nnbot-marketplace/.env
```

## 防火墙配置

确保服务器开放以下端口：

```bash
# Ubuntu/Debian
ufw allow 3001/tcp  # 市场服务器
ufw allow 8080/tcp  # NNBot WebUI

# CentOS/RHEL
firewall-cmd --permanent --add-port=3001/tcp
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --reload
```
