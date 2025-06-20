# ChatGPT Web

[中文](./README.md) | [English](./README.en.md)


## 说明

> [!IMPORTANT]
> **此项目 Fork 自 [Chanzhaoyu/chatgpt-web](https://github.com/Chanzhaoyu/chatgpt-web)**
>
> 由于原项目作者不愿意引入对数据库的依赖 故制作该永久分叉独立开发 [详见讨论](https://github.com/Chanzhaoyu/chatgpt-web/pull/589#issuecomment-1469207694)
>
> 再次感谢 [Chanzhaoyu](https://github.com/Chanzhaoyu) 大佬对开源的贡献 🙏

新增了部分特色功能:

[✓] 注册 & 登录 & 重置密码 & 2FA

[✓] 同步历史会话

[✓] 前端页面设置apikey

[✓] 自定义敏感词

[✓] 每个会话设置独有 Prompt

[✓] 用户管理

[✓] 多 Key 随机

[✓] 对话数量限制 & 设置不同用户对话数量 & 兑换数量

[✓] 通过 auth proxy 功能实现sso登录 (配合第三方身份验证反向代理 可实现支持 LDAP/OIDC/SAML 等协议登录)

[✓] Web Search 网络搜索功能 (基于 Tavily API 实现实时网络搜索)

[✓] VLLM API 模型支持 & 可选关闭深度思考模式

[✓] 上下文窗口控制


> [!CAUTION]
> 声明：此项目只发布于 Github，基于 MIT 协议，免费且作为开源学习使用。并且不会有任何形式的卖号、付费服务、讨论群、讨论组等行为。谨防受骗。

## 截图

![cover3](./docs/login.jpg)
![cover](./docs/c1.png)
![cover2](./docs/c2.png)
![cover3](./docs/basesettings.jpg)
![cover3](./docs/prompt.jpg)
![cover3](./docs/user-manager.jpg)
![cover3](./docs/key-manager.jpg)
![userlimit](./docs/add_redeem_and_limit.png)
![setmanuallimit](./docs/manual_set_limit.png)
![giftcarddb](./docs/giftcard_db_design.png)

- [ChatGPT Web](#chatgpt-web)
	- [介绍](#介绍)
	- [待实现路线](#待实现路线)
	- [前置要求](#前置要求)
		- [Node](#node)
		- [PNPM](#pnpm)
		- [填写密钥](#填写密钥)
	- [安装依赖](#安装依赖)
		- [后端](#后端)
		- [前端](#前端)
	- [测试环境运行](#测试环境运行)
		- [后端服务](#后端服务)
		- [前端网页](#前端网页)
	- [环境变量](#环境变量)
	- [打包](#打包)
		- [使用 Docker](#使用-docker)
			- [Docker 参数示例](#docker-参数示例)
			- [Docker build \& Run](#docker-build--run)
			- [Docker compose](#docker-compose)
			- [防止爬虫抓取](#防止爬虫抓取)
		- [使用 Railway 部署](#使用-railway-部署)
			- [Railway 环境变量](#railway-环境变量)
		- [手动打包](#手动打包)
			- [后端服务](#后端服务-1)
			- [前端网页](#前端网页-1)
	- [Auth Proxy Mode](#auth-proxy-mode)
	- [Web Search 网络搜索功能](#web-search-网络搜索功能)
		- [功能特性](#功能特性)
		- [配置方式](#配置方式)
		- [使用方式](#使用方式)
		- [技术实现](#技术实现)
		- [注意事项](#注意事项)
	- [常见问题](#常见问题)
	- [参与贡献](#参与贡献)
	- [赞助](#赞助)
	- [License](#license)
## 介绍

使用官方 `OpenAI API` 访问 `ChatGPT`：

`ChatGPTAPI` 使用 `gpt-4.1` 通过 `OpenAI` 官方 `API` 调用 `ChatGPT`（需要 API 密钥）。

警告：
1. 使用 `API` 时，如果网络不通，那是国内被墙了，你需要自建代理，绝对不要使用别人的公开代理，那是危险的。
2. 把项目发布到公共网络时，你应该设置 `AUTH_SECRET_KEY` 变量添加你的密码访问权限，你也应该修改 `index.html` 中的 `title`，防止被关键词搜索到。

设置方式：
1. 进入 `service/.env.example` 文件，复制内容到 `service/.env` 文件
2. 填写 `OPENAI_API_KEY` 字段 [(获取 apiKey)](https://platform.openai.com/overview)

环境变量：

全部参数变量请查看或[这里](#环境变量)

```
/service/.env.example
```

## 待实现路线
[✓] 双模型

[✓] 多会话储存和上下文逻辑

[✓] 对代码等消息类型的格式化美化处理

[✓] 支持用户登录注册

[✓] 前端页面设置 apikey 等信息

[✓] 数据导入、导出

[✓] 保存消息到本地图片

[✓] 界面多语言

[✓] 界面主题

[✓] VLLM API 模型支持

[✓] 深度思考模式开关

[✗] More...

## 前置要求

### Node

`node` 需要 `^16 || ^18 || ^20 || ^22` 版本，使用 [nvm](https://github.com/nvm-sh/nvm) 可管理本地多个 `node` 版本

```shell
node -v
```

### PNPM
如果你没有安装过 `pnpm`
```shell
npm install pnpm -g
```

### 填写API密钥
获取 `OpenAI API Key` 并填写本地环境变量 [跳转](#介绍)

```
# service/.env 文件

# OpenAI API Key - https://platform.openai.com/overview
OPENAI_API_KEY=
```

## 安装依赖

> 为了简便 `后端开发人员` 的了解负担，所以并没有采用前端 `workspace` 模式，而是分文件夹存放。如果只需要前端页面做二次开发，删除 `service` 文件夹即可。

### 后端

进入文件夹 `/service` 运行以下命令

```shell
pnpm install
```

### 前端
根目录下运行以下命令
```shell
pnpm bootstrap
```

## 测试环境运行
### 后端服务

进入文件夹 `/service` 运行以下命令

```shell
pnpm start
```

### 前端网页
根目录下运行以下命令
```shell
pnpm dev
```

## 环境变量

`API` 可用：

- `OPENAI_API_KEY` 必填
- `OPENAI_API_BASE_URL` 设置接口地址，可选，默认：`https://api.openai.com`
- `OPENAI_API_DISABLE_DEBUG` 设置接口关闭 debug 日志，可选，默认：empty 不关闭

通用：

- `AUTH_SECRET_KEY` 访问权限密钥，可选
- `MAX_REQUEST_PER_HOUR` 每小时最大请求次数，可选，默认无限
- `TIMEOUT_MS` 超时，单位毫秒，可选
- `SOCKS_PROXY_HOST` 和 `SOCKS_PROXY_PORT` 一起时生效，可选
- `SOCKS_PROXY_PORT` 和 `SOCKS_PROXY_HOST` 一起时生效，可选
- `HTTPS_PROXY` 支持 `http`，`https`, `socks5`，可选

## 打包

### 使用 Docker

#### Docker 参数示例

- `OPENAI_API_KEY` 必填
- `OPENAI_API_BASE_URL` 可选，设置接口地址，默认：`https://api.openai.com`
- `OPENAI_API_MODEL` 可选，指定使用的模型
- `AUTH_SECRET_KEY` 访问密码，可选
- `TIMEOUT_MS` 超时，单位毫秒，可选
- `SOCKS_PROXY_HOST` 可选，与 SOCKS_PROXY_PORT 一起使用
- `SOCKS_PROXY_PORT` 可选，与 SOCKS_PROXY_HOST 一起使用
- `SOCKS_PROXY_USERNAME` 可选，与 SOCKS_PROXY_HOST 和 SOCKS_PROXY_PORT 一起使用
- `SOCKS_PROXY_PASSWORD` 可选，与 SOCKS_PROXY_HOST 和 SOCKS_PROXY_PORT 一起使用
- `HTTPS_PROXY` 可选，支持 http，https, socks5

![docker](./docs/docker.png)

#### Docker build & Run

```bash
GIT_COMMIT_HASH=`git rev-parse HEAD`
RELEASE_VERSION=`git branch --show-current`
docker build --build-arg GIT_COMMIT_HASH=${GIT_COMMIT_HASH} --build-arg RELEASE_VERSION=${RELEASE_VERSION} -t chatgpt-web .

# 前台运行
# 如果在宿主机运行 mongodb 则使用 MONGODB_URL=mongodb://host.docker.internal:27017/chatgpt
docker run --name chatgpt-web --rm -it -p 3002:3002 --env OPENAI_API_KEY=your_api_key --env MONGODB_URL=your_mongodb_url chatgpt-web

# 后台运行
docker run --name chatgpt-web -d -p 127.0.0.1:3002:3002 --env OPENAI_API_KEY=your_api_key --env MONGODB_URL=your_mongodb_url chatgpt-web

# 运行地址
http://localhost:3002/
```

#### Docker compose

[Hub 地址](https://hub.docker.com/r/chatgptweb/chatgpt-web)

```yml
version: '3'

services:
  app:
    image: chatgptweb/chatgpt-web # 总是使用latest,更新时重新pull该tag镜像即可
    container_name: chatgptweb
    restart: unless-stopped
    ports:
      - 3002:3002
    depends_on:
      - database
    environment:
      TZ: Asia/Shanghai
      # 每小时最大请求次数，可选，默认无限
      MAX_REQUEST_PER_HOUR: 0
      # 访问jwt加密参数，可选 不为空则允许登录 同时需要设置 MONGODB_URL
      AUTH_SECRET_KEY: xxx
      # 网站名称
      SITE_TITLE: ChatGpt Web
      # mongodb 的连接字符串
      MONGODB_URL: 'mongodb://chatgpt:xxxx@database:27017'
      # 开启注册之后 密码加密的盐
      PASSWORD_MD5_SALT: xxx
      # 开启注册之后 超级管理邮箱
      ROOT_USER: me@example.com
      # 网站是否开启注册 必须开启, 否则管理员都没法注册, 可后续关闭
      REGISTER_ENABLED: true
      # 更多配置, 在运行后, 注册管理员, 在管理员页面中设置
    links:
      - database

  database:
    image: mongo
    container_name: chatgptweb-database
    restart: unless-stopped
    ports:
      - '27017:27017'
    expose:
      - '27017'
    volumes:
      - mongodb:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: chatgpt
      MONGO_INITDB_ROOT_PASSWORD: xxxx
      MONGO_INITDB_DATABASE: chatgpt

volumes:
  mongodb: {}
```
- `OPENAI_API_BASE_URL`  可选，设置 `OPENAI_API_KEY` 时可用

#### 防止爬虫抓取

**nginx**

将下面配置填入nginx配置文件中，可以参考 `docker-compose/nginx/nginx.conf` 文件中添加反爬虫的方法

```
    # 防止爬虫抓取
    if ($http_user_agent ~* "360Spider|JikeSpider|Spider|spider|bot|Bot|2345Explorer|curl|wget|webZIP|qihoobot|Baiduspider|Googlebot|Googlebot-Mobile|Googlebot-Image|Mediapartners-Google|Adsbot-Google|Feedfetcher-Google|Yahoo! Slurp|Yahoo! Slurp China|YoudaoBot|Sosospider|Sogou spider|Sogou web spider|MSNBot|ia_archiver|Tomato Bot|NSPlayer|bingbot"){
      return 403;
    }
```

###  使用 Railway 部署

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template/yytmgc)

> 参考这个 issue 详细教程  https://github.com/Kerwin1202/chatgpt-web/issues/266

> 注意: `Railway` 修改环境变量会重新 `Deploy`

### 手动打包
#### 后端服务
> 如果你不需要本项目的 `node` 接口，可以省略如下操作

复制 `service` 文件夹到你有 `node` 服务环境的服务器上。

```shell
# 安装
pnpm install

# 打包
pnpm build

# 运行
pnpm prod
```

PS: 不进行打包，直接在服务器上运行 `pnpm start` 也可

#### 前端网页

1、修改根目录下 `.env` 文件中的 `VITE_GLOB_API_URL` 为你的实际后端接口地址

2、根目录下运行以下命令，然后将 `dist` 文件夹内的文件复制到你网站服务的根目录下

[参考信息](https://cn.vitejs.dev/guide/static-deploy.html#building-the-app)

```shell
pnpm build
```

## Auth Proxy Mode

> [!WARNING]
> 该功能仅适用于有相关经验的运维人员在集成企业内部账号管理系统时部署 配置不当可能会导致安全风险

设置环境变量 `AUTH_PROXY_ENABLED=true` 即可开启 auth proxy 模式

在开启该功能后 需确保 chatgpt-web 只能通过反向代理访问

由反向代理进行进行身份验证 并再转发请求时携带请求头标识用户身份
默认请求头为 `X-Email` 并可以通过设置环境变量 `AUTH_PROXY_HEADER_NAME` 自定义配置

推荐当前 Idp 使用 LDAP 协议的 可以选择使用 [authelia](https://www.authelia.com)

当前 Idp 使用 OIDC 协议的 可以选择使用 [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy)

## Web Search 网络搜索功能

> [!TIP]
> Web Search 功能基于 [Tavily API](https://tavily.com/) 实现，可以让 ChatGPT 获取最新的网络信息来回答问题。

### 功能特性

- **实时网络搜索**: 基于 Tavily API 获取最新的网络信息
- **智能查询提取**: 自动从用户问题中提取最相关的搜索关键词
- **搜索结果整合**: 将搜索结果无缝整合到 AI 对话中
- **按会话控制**: 每个对话可以独立开启或关闭搜索功能
- **搜索历史记录**: 保存搜索查询和结果到数据库
- **可配置系统消息**: 支持自定义搜索相关的系统提示消息

### 配置方式

#### 1. 获取 Tavily API Key

1. 访问 [Tavily 官网](https://tavily.com/) 注册账号
2. 获取 API Key

#### 2. 管理员配置

1. 以管理员身份登录系统
2. 进入系统设置页面
3. 找到 "Web Search 配置" 选项
4. 填写以下配置：
   - **启用状态**: 开启/关闭全局搜索功能
   - **API Key**: 填入 Tavily API Key
   - **最大搜索结果数**: 设置每次搜索返回的最大结果数量（1-20，默认10）
   - **搜索查询系统消息**: 用于提取搜索关键词的提示模板
   - **搜索结果系统消息**: 用于处理搜索结果的提示模板

#### 3. 系统消息模板

**搜索查询提取模板** (用于从用户问题中提取搜索关键词):
```
You are a search query extraction assistant. Extract the most relevant search query from user's question and wrap it with <search_query></search_query> tags.
Current time: {current_time}
```

**搜索结果处理模板** (用于处理包含搜索结果的对话):
```
You are a helpful assistant with access to real-time web search results. Use the provided search information to give accurate and up-to-date responses.
Current time: {current_time}
```

### 使用方式

#### 用户端操作

1. **开启搜索功能**:
   - 在对话界面中，找到搜索开关按钮
   - 点击开启当前会话的网络搜索功能

2. **提问获取实时信息**:
   - 开启搜索后，直接向 ChatGPT 提问需要实时信息的问题
   - 系统会自动搜索相关信息并整合到回答中

3. **查看搜索历史**:
   - 搜索查询和结果会保存在数据库中
   - 可以通过数据库查看具体的搜索记录

#### 工作流程

1. **用户提问**: 用户在开启搜索的会话中提问
2. **查询提取**: 系统使用 AI 从问题中提取搜索关键词
3. **网络搜索**: 调用 Tavily API 进行实时搜索
4. **结果整合**: 将搜索结果作为上下文提供给 AI
5. **生成回答**: AI 基于搜索结果生成更准确的回答

### 技术实现

- **搜索引擎**: Tavily API
- **查询提取**: 使用 OpenAI API 智能提取关键词
- **结果格式**: JSON 格式存储完整搜索结果
- **数据存储**: MongoDB 存储搜索查询和结果
- **超时设置**: 搜索请求超时时间为 300 秒
- **结果数量控制**: 支持配置每次搜索返回的最大结果数量（1-20）

### 注意事项

- Web Search 功能需要额外的 Tavily API 费用
- 搜索功能会增加响应时间
- 建议根据实际需求选择性开启
- 管理员可以控制全局搜索功能的开启状态
- 每个会话可以独立控制是否使用搜索功能
- 最大搜索结果数设置会影响搜索的详细程度和 API 费用


## 上下文窗口控制

> [!TIP]
> 上下文窗口控制功能可以让用户灵活管理 AI 对话中的上下文信息，优化模型性能和对话效果。

### 功能特性

- **上下文管理**: 控制模型可以参考的聊天记录数量
- **按对话控制**: 每个对话可以独立开启或关闭上下文窗口
- **实时切换**: 在对话过程中可以随时切换上下文模式
- **记忆管理**: 灵活控制 AI 的记忆范围和连续性
- **可配置数量**: 管理员可设置上下文消息的最大数量

### 工作原理

上下文窗口决定了在生成过程中，模型可以参考的当前会话下聊天记录的量：

- **合理的上下文窗口大小**有助于模型生成连贯且相关的文本
- **避免因为参考过多的上下文**而导致混乱或不相关的输出
- **关闭上下文窗口**会导致会话失去记忆，每次提问之间将完全独立

### 使用方式

#### 1. 启用/关闭上下文窗口

1. **进入对话界面**: 在任何对话会话中都可以使用此功能
2. **找到控制开关**: 在对话界面中找到"上下文窗口"开关按钮
3. **切换模式**:
   - **开启**: 模型会参考之前的聊天记录，保持对话连贯性
   - **关闭**: 模型不会参考历史记录，每个问题独立处理

#### 2. 使用场景

**建议开启上下文窗口的情况：**
- 需要连续对话和上下文关联
- 复杂主题的深入讨论
- 多轮问答和逐步解决问题
- 需要 AI 记住之前提到的信息

**建议关闭上下文窗口的情况：**
- 独立的简单问题
- 避免历史信息干扰新问题
- 处理不相关的多个主题
- 需要"重新开始"的场景

#### 3. 管理员配置

管理员可以在系统设置中配置：
- **最大上下文数量**: 设置会话中包含的上下文消息数量
- **默认状态**: 设置新对话的默认上下文窗口状态

### 技术实现

- **上下文截取**: 自动截取指定数量的历史消息
- **状态持久化**: 每个对话独立保存上下文窗口开关状态
- **实时生效**: 切换后立即对下一条消息生效
- **内存优化**: 合理控制上下文长度，避免超出模型限制

### 注意事项

- **对话连贯性**: 关闭上下文窗口会影响对话的连续性
- **Token 消耗**: 更多的上下文会增加 Token 使用量
- **响应质量**: 适当的上下文有助于提高回答质量
- **模型限制**: 需要考虑不同模型的上下文长度限制

## VLLM API 深度思考模式控制

> [!TIP]
> 深度思考模式控制功能仅在后端配置为 VLLM API 时可用，可以让用户选择是否启用模型的深度思考功能。

### 功能特性

- **VLLM API 专属功能**: 仅在后端使用 VLLM API 时可用
- **按对话控制**: 每个对话可以独立开启或关闭深度思考模式
- **实时切换**: 在对话过程中可以随时切换深度思考模式
- **性能优化**: 关闭深度思考可以提高响应速度，降低计算成本

### 工作原理

开启深度思考后，模型会用更多的计算资源以及消耗更长时间，模拟更复杂的思维链路进行逻辑推理：

- **适合复杂任务或高要求场景**，比如数学题推导、项目规划
- **日常简单查询无需开启**深度思考模式
- **关闭深度思考**可以获得更快的响应速度

### 使用前提

**必须满足以下条件才能使用此功能：**

1. **后端配置**: 后端必须配置为使用 VLLM API 接口
2. **模型支持**: 使用的模型必须支持深度思考功能
3. **API 兼容**: VLLM API 版本需要支持思考模式控制参数

### 使用方式

#### 1. 启用/关闭深度思考模式

1. **进入对话界面**: 在支持 VLLM API 的对话会话中
2. **找到控制开关**: 在对话界面中找到"深度思考"开关按钮
3. **切换模式**: 
   - 开启：模型将进行深度思考，提供更详细和深入的回答
   - 关闭：模型将直接回答，响应更快但可能较为简洁

#### 2. 使用场景

**建议开启深度思考的情况：**
- 复杂问题需要深入分析
- 需要逻辑推理和多步骤思考
- 对回答质量要求较高的场景
- 时间不敏感的情况

**建议关闭深度思考的情况：**
- 简单问题快速回答
- 需要快速响应的场景
- 降低计算成本的需求
- 批量处理简单任务

#### 3. 技术实现

- **API 参数**: 通过 VLLM API 的 `disable_thinking` 参数控制
- **状态保存**: 每个对话会话独立保存深度思考开关状态
- **实时生效**: 切换后立即对下一条消息生效

### 注意事项

- **仅限 VLLM API**: 此功能仅在后端使用 VLLM API 时可用，其他 API（如 OpenAI API）不支持此功能
- **模型依赖**: 不是所有模型都支持深度思考模式，请确认您使用的模型支持此功能
- **响应差异**: 关闭深度思考可能会影响回答的详细程度和质量
- **成本考虑**: 开启深度思考通常会增加计算成本和响应时间

## 常见问题
Q: 为什么 `Git` 提交总是报错？

A: 因为有提交信息验证，请遵循 [Commit 指南](./CONTRIBUTING.md)

Q: 如果只使用前端页面，在哪里改请求接口？

A: 根目录下 `.env` 文件中的 `VITE_GLOB_API_URL` 字段。

Q: 文件保存时全部爆红?

A: `vscode` 请安装项目推荐插件，或手动安装 `Eslint` 插件。

Q: 前端没有打字机效果？

A: 一种可能原因是经过 Nginx 反向代理，开启了 buffer，则 Nginx 会尝试从后端缓冲一定大小的数据再发送给浏览器。请尝试在反代参数后添加 `proxy_buffering off;`，然后重载 Nginx。其他 web server 配置同理。

## 参与贡献

贡献之前请先阅读 [贡献指南](./CONTRIBUTING.md)

感谢所有做过贡献的人!

<a href="https://github.com/chatgpt-web-dev/chatgpt-web/graphs/contributors">
  <img alt="Contributors Image" src="https://contrib.rocks/image?repo=chatgpt-web-dev/chatgpt-web" width="550" />
</a>

## Star 历史

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=chatgpt-web-dev/chatgpt-web&type=Date&theme=dark" />
  <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=chatgpt-web-dev/chatgpt-web&type=Date" />
  <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=chatgpt-web-dev/chatgpt-web&type=Date" width="550" />
</picture>

## 赞助
如果你觉得这个项目对你有帮助，请给我点个Star。并且情况允许的话，可以给我一点点支持，总之非常感谢支持～

<div style="display: flex; gap: 20px;">
	<div style="text-align: center">
		<img style="width: 200px" src="./docs/wechat.png" alt="微信" />
		<p>WeChat Pay</p>
	</div>
	<div style="text-align: center">
		<img style="width: 200px" src="./docs/alipay.png" alt="支付宝" />
		<p>Alipay</p>
	</div>
</div>

---

感谢 [DigitalOcean](https://www.digitalocean.com/) 赞助提供开源积分用于运行基础设施服务器

<p>
  <a href="https://www.digitalocean.com/">
    <img src="https://opensource.nyc3.cdn.digitaloceanspaces.com/attribution/assets/SVG/DO_Logo_horizontal_blue.svg" width="201px" alt="digitalocean">
  </a>
</p>

## License
[MIT © github.com/chatgpt-web-dev Contributors](./LICENSE)
