# ChatGPT Web

[中文](./README.md) | [English](./README.en.md)


## Introduction

> [!IMPORTANT]
> **This project is forked from [Chanzhaoyu/chatgpt-web](https://github.com/Chanzhaoyu/chatgpt-web)**
>
> As the original project author does not agree to introduce a dependency on the database, this Hard Fork was created for independent development [discussion for details](https://github.com/Chanzhaoyu/chatgpt-web/pull/589#issuecomment-1469207694)
>
> Thank you again, the great [Chanzhaoyu](https://github.com/Chanzhaoyu), for your contributions to the open-source project 🙏

Some unique features have been added:

[✓] Register & Login & Reset Password & 2FA

[✓] Sync chat history 

[✓] Front-end page setting apikey

[✓] Custom Sensitive Words

[✓] Set unique prompts for each chat room

[✓] Users manager

[✓] Random Key

[✓] Conversation round limit & setting different limits by user & giftcards

[✓] Implement SSO login through the auth proxy feature (need to integrate a third-party authentication reverse proxy, it can support login protocols such as LDAP/OIDC/SAML)

[✓] Web Search functionality (Real-time web search based on Tavily API)

[✓] VLLM API model support & Optional disable deep thinking mode

[✓] Context Window Control

> [!CAUTION]
> This project is only published on GitHub, based on the MIT license, free and for open source learning usage. And there will be no any form of account selling, paid service, discussion group, discussion group and other behaviors. Beware of being deceived.

## Screenshots
> Disclaimer: This project is only released on GitHub, under the MIT License, free and for open-source learning purposes. There will be no account selling, paid services, discussion groups, or forums. Beware of fraud.

![cover3](./docs/login.jpg)
![cover](./docs/c1.png)
![cover2](./docs/c2.png)
![cover3](./docs/basesettings.jpg)
![cover3](./docs/prompt_en.jpg)
![cover3](./docs/user-manager.jpg)
![cover3](./docs/key-manager-en.jpg)
![userlimit](./docs/add_redeem_and_limit.png)
![setmanuallimit](./docs/manual_set_limit.png)
![giftcarddb](./docs/giftcard_db_design.png)

- [ChatGPT Web](#chatgpt-web)
	- [Introduction](#introduction)
	- [Roadmap](#roadmap)
	- [Prerequisites](#prerequisites)
		- [Node](#node)
		- [PNPM](#pnpm)
		- [Fill in the Keys](#fill-in-the-keys)
	- [Install Dependencies](#install-dependencies)
		- [Backend](#backend)
		- [Frontend](#frontend)
	- [Run in Test Environment](#run-in-test-environment)
		- [Backend Service](#backend-service)
		- [Frontend Webpage](#frontend-webpage)
	- [Packaging](#packaging)
		- [Using Docker](#using-docker)
			- [Docker Parameter Example](#docker-parameter-example)
			- [Docker Build \& Run](#docker-build--run)
			- [Docker Compose](#docker-compose)
		- [Deployment with Railway](#deployment-with-railway)
			- [Railway Environment Variables](#railway-environment-variables)
		- [Manual packaging](#manual-packaging)
			- [Backend service](#backend-service-1)
			- [Frontend webpage](#frontend-webpage-1)
	- [Auth Proxy Mode](#auth-proxy-mode)
	- [Web Search Functionality](#web-search-functionality)
		- [Features](#features)
		- [Configuration](#configuration)
		- [Usage](#usage)
		- [Technical Implementation](#technical-implementation)
		- [Notes](#notes)
	- [Frequently Asked Questions](#frequently-asked-questions)
	- [Contributing](#contributing)
	- [Sponsorship](#sponsorship)
	- [License](#license)

## Introduction

Uses the official `OpenAI API` to access `ChatGPT`:

`ChatGPTAPI` uses `gpt-4.1` through the official `OpenAI` completion `API` (requires an API key).

[Details](https://github.com/Chanzhaoyu/chatgpt-web/issues/138)

Setup:
1. Go to the `service/.env.example` file and copy the contents to the `service/.env` file.
2. Fill in the `OPENAI_API_KEY` field with your OpenAI API Key [(Get apiKey)](https://platform.openai.com/overview).

Environment Variables:

For all parameter variables, check [here](#docker-parameter-example) or see:

```
/service/.env
```

## Roadmap
[✓] Dual models

[✓] Multiple session storage and context logic

[✓] Formatting and beautifying code-like message types

[✓] Login or Register

[✓] Set API key and other information on the front-end page.

[✓] Data import and export

[✓] Save message to local image

[✓] Multilingual interface

[✓] Interface themes

[✓] VLLM API model support

[✓] Deep thinking mode switch

[✗] More...

## Prerequisites

### Node

`node` requires version `^16 || ^18 || ^20 || ^22`, and multiple local `node` versions can be managed using [nvm](https://github.com/nvm-sh/nvm).

```shell
node -v
```

### PNPM
If you have not installed `pnpm` before:
```shell
npm install pnpm -g
```

### Fill in the API Key

Get your `OpenAI API Key` and fill in the local environment variables [jump](#introduction)

```
# service/.env file

# OpenAI API Key - https://platform.openai.com/overview
OPENAI_API_KEY=
```

## Install Dependencies

> To make it easier for `backend developers` to understand, we did not use the front-end `workspace` mode, but stored it in different folders. If you only need to do secondary development of the front-end page, delete the `service` folder.

### Backend

Enter the `/service` folder and run the following command

```shell
pnpm install
```

### Frontend
Run the following command in the root directory
```shell
pnpm bootstrap
```

## Run in Test Environment
### Backend Service

Enter the `/service` folder and run the following command

```shell
pnpm start
```

### Frontend Webpage
Run the following command in the root directory
```shell
pnpm dev
```

## Packaging

### Using Docker

#### Docker Parameter Example

- `OPENAI_API_KEY` required
- `OPENAI_API_BASE_URL` optional, available when `OPENAI_API_KEY` is set
- `OPENAI_API_MODEL` optional, specify the model to use
- `AUTH_SECRET_KEY` Access Password，optional
- `TIMEOUT_MS` timeout, in milliseconds, optional
- `SOCKS_PROXY_HOST` optional, effective with SOCKS_PROXY_PORT
- `SOCKS_PROXY_PORT` optional, effective with SOCKS_PROXY_HOST
- `SOCKS_PROXY_USERNAME` optional, effective with SOCKS_PROXY_HOST and SOCKS_PROXY_PORT
- `SOCKS_PROXY_PASSWORD` optional, effective with SOCKS_PROXY_HOST and SOCKS_PROXY_PORT
- `HTTPS_PROXY` optional, support http，https, socks5

![docker](./docs/docker.png)

#### Docker Build & Run

```bash
GIT_COMMIT_HASH=`git rev-parse HEAD`
RELEASE_VERSION=`git branch --show-current`
docker build --build-arg GIT_COMMIT_HASH=${GIT_COMMIT_HASH} --build-arg RELEASE_VERSION=${RELEASE_VERSION} -t chatgpt-web .

# foreground operation
# If run mongodb in host machine, please use MONGODB_URL=mongodb://host.docker.internal:27017/chatgpt
docker run --name chatgpt-web --rm -it -p 127.0.0.1:3002:3002 --env OPENAI_API_KEY=your_api_key --env MONGODB_URL=your_mongodb_url chatgpt-web

# background operation
docker run --name chatgpt-web -d -p 127.0.0.1:3002:3002 --env OPENAI_API_KEY=your_api_key --env MONGODB_URL=your_mongodb_url chatgpt-web

# running address
http://localhost:3002/
```

#### Docker Compose

[Hub Address](https://hub.docker.com/r/chatgptweb/chatgpt-web)

```yml
version: '3'

services:
  app:
    image: chatgptweb/chatgpt-web # always use latest, pull the tag image again when updating
    container_name: chatgptweb
    restart: unless-stopped
    ports:
      - 3002:3002
    depends_on:
      - database
    environment:
      TZ: Asia/Shanghai
      # Title for site
      SITE_TITLE: ChatGpt Web
      # access salt，optional Allow login if not empty.
      AUTH_SECRET_KEY: xxx
      # mongodb's connection string
      MONGODB_URL: 'mongodb://chatgpt:xxxx@database:27017'
      # After register enabled, Salt for password encryption
      PASSWORD_MD5_SALT: xxx
      # After register enabled, super administrator
      ROOT_USER: me@example.com
      # Allow anyone register, Must be turned on, otherwise administrators cannot register, can be turned off later.
      REGISTER_ENABLED: true
      # More configurations, register an administrator after running and set it in the administrator page.
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
The `OPENAI_API_BASE_URL` is optional and only used when setting the `OPENAI_API_KEY`.

### Deployment with Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template/yytmgc)

> Refer to this issue  https://github.com/Kerwin1202/chatgpt-web/issues/266

> Note: Changing environment variables in Railway will cause re-deployment.

### Manual packaging

#### Backend service

> If you don't need the `node` interface of this project, you can skip the following steps.

Copy the `service` folder to a server that has a `node` service environment.

```shell
# Install
pnpm install

# Build
pnpm build

# Run
pnpm prod
```

PS: You can also run `pnpm start` directly on the server without packaging.

#### Frontend webpage

1. Refer to the root directory `.env.example` file content to create `.env` file, modify `VITE_GLOB_API_URL` in `.env` at the root directory to your actual backend interface address.
2. Run the following command in the root directory and then copy the files in the `dist` folder to the root directory of your website service.

[Reference information](https://cn.vitejs.dev/guide/static-deploy.html#building-the-app)

```shell
pnpm build
```

## Context Window Control

> [!TIP]
> Context Window Control allows users to flexibly manage context information in AI conversations, optimizing model performance and conversation effectiveness.

### Features

- **Context Management**: Control the amount of chat history the model can reference
- **Per-conversation Control**: Each conversation can independently enable or disable context window
- **Real-time Switching**: Context mode can be switched at any time during conversation
- **Memory Management**: Flexibly control AI's memory scope and continuity
- **Configurable Quantity**: Administrators can set the maximum number of context messages

### How It Works

The context window determines the amount of chat history from the current session that the model can reference during generation:

- **Reasonable context window size** helps the model generate coherent and relevant text
- **Avoid confusion or irrelevant output** caused by referencing too much context
- **Turning off the context window** will cause the session to lose memory, making each question completely independent

### Usage

#### 1. Enable/Disable Context Window

1. **Enter Conversation Interface**: This feature can be used in any conversation session
2. **Find Control Switch**: Locate the "Context Window" toggle button in the conversation interface
3. **Switch Mode**:
   - **Enable**: Model will reference previous chat history, maintaining conversation coherence
   - **Disable**: Model will not reference history, treating each question independently

#### 2. Usage Scenarios

**Recommended to enable context window when:**
- Need continuous dialogue and context correlation
- In-depth discussion of complex topics
- Multi-turn Q&A and step-by-step problem solving
- Need AI to remember previously mentioned information

**Recommended to disable context window when:**
- Independent simple questions
- Avoid historical information interfering with new questions
- Handling multiple unrelated topics
- Need a "fresh start" scenario

#### 3. Administrator Configuration

Administrators can configure in system settings:
- **Maximum Context Count**: Set the number of context messages included in the conversation
- **Default State**: Set the default context window state for new conversations

### Technical Implementation

- **Context Truncation**: Automatically truncate specified number of historical messages
- **State Persistence**: Each conversation independently saves context window switch state
- **Real-time Effect**: Takes effect immediately for the next message after switching
- **Memory Optimization**: Reasonably control context length, avoiding model limits

### Notes

- **Conversation Coherence**: Disabling context window will affect conversation continuity
- **Token Consumption**: More context will increase token usage
- **Response Quality**: Appropriate context helps improve answer quality
- **Model Limitations**: Need to consider context length limits of different models

## VLLM API Deep Thinking Mode Control

> [!TIP]
> Deep thinking mode control is only available when the backend is configured to use VLLM API, allowing users to choose whether to enable the model's deep thinking functionality.

### Features

- **VLLM API Exclusive Feature**: Only available when the backend uses VLLM API
- **Per-conversation Control**: Each conversation can independently enable or disable deep thinking mode
- **Real-time Switching**: Deep thinking mode can be switched at any time during conversation
- **Performance Optimization**: Disabling deep thinking can improve response speed and reduce computational costs

### How It Works

After enabling deep thinking, the model will use more computational resources and take longer time to simulate more complex thinking chains for logical reasoning:

- **Suitable for complex tasks or high-requirement scenarios**, such as mathematical derivations and project planning
- **Daily simple queries do not need to be enabled** deep thinking mode
- **Disabling deep thinking** can achieve faster response speed

### Prerequisites

**The following conditions must be met to use this feature:**

1. **Backend Configuration**: Backend must be configured to use VLLM API interface
2. **Model Support**: The model used must support deep thinking functionality
3. **API Compatibility**: VLLM API version needs to support thinking mode control parameters

### Usage

#### 1. Enable/Disable Deep Thinking Mode

1. **Enter Conversation Interface**: In a conversation session that supports VLLM API
2. **Find Control Switch**: Locate the "Deep Thinking" toggle button in the conversation interface
3. **Switch Mode**: 
   - Enable: Model will perform deep thinking, providing more detailed and in-depth responses
   - Disable: Model will respond directly, faster but potentially more concise

#### 2. Usage Scenarios

**Recommended to enable deep thinking when:**
- Complex problems require in-depth analysis
- Logical reasoning and multi-step thinking are needed
- High-quality responses are required
- Time is not sensitive

**Recommended to disable deep thinking when:**
- Simple questions need quick answers
- Fast response is required
- Need to reduce computational costs
- Batch processing simple tasks

#### 3. Technical Implementation

- **API Parameter**: Controlled through VLLM API's `disable_thinking` parameter
- **State Persistence**: Each conversation session independently saves the deep thinking switch state
- **Real-time Effect**: Takes effect immediately for the next message after switching

### Notes

- **VLLM API Only**: This feature is only available when the backend uses VLLM API, other APIs (such as OpenAI API) do not support this feature
- **Model Dependency**: Not all models support deep thinking mode, please confirm that your model supports this feature
- **Response Differences**: Disabling deep thinking may affect the detail and quality of responses
- **Cost Considerations**: Enabling deep thinking typically increases computational costs and response time

## Frequently Asked Questions

Q: Why does Git always report an error when committing?

A: Because there is submission information verification, please follow the [Commit Guidelines](./CONTRIBUTING.en.md).

Q: Where to change the request interface if only the frontend page is used?

A: The `VITE_GLOB_API_URL` field in the `.env` file at the root directory.

Q: All red when saving the file?

A: For `vscode`, please install the recommended plug-in of the project or manually install the `Eslint` plug-in.

Q: Why doesn't the frontend have a typewriter effect?

A: One possible reason is that after Nginx reverse proxying, buffering is turned on, and Nginx will try to buffer a certain amount of data from the backend before sending it to the browser. Please try adding `proxy_buffering off;` after the reverse proxy parameter and then reloading Nginx. Other web server configurations are similar.

Q: The content returned is incomplete?

A: There is a length limit for the content returned by the API each time. You can modify the `VITE_GLOB_OPEN_LONG_REPLY` field in the `.env` file under the root directory, set it to `true`, and rebuild the front-end to enable the long reply feature, which can return the full content. It should be noted that using this feature may bring more API usage fees.

## Auth Proxy Mode

> [!WARNING]
> This feature is only provided for Operations Engineer with relevant experience to deploy during the integration of the enterprise's internal account management system. Improper configuration may lead to security risks.

Set env `AUTH_PROXY_ENABLED=true` can enable auth proxy mode.

After activating this feature, it is necessary to ensure that chatgpt-web can only be accessed through a reverse proxy.

Authentication is carried out by the reverse proxy, which then forwards the request with the header to identify the user identity.
Default header name is `X-Email`, can custom config use set env `AUTH_PROXY_HEADER_NAME`.

Recommended for current IdP to use LDAP protocol, using [authelia](https://www.authelia.com)

Recommended for current IdP to use OIDC protocol, using [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy)

## Web Search Functionality

> [!TIP]
> Web Search functionality is based on [Tavily API](https://tavily.com/) implementation, allowing ChatGPT to access the latest web information to answer questions.

### Features

- **Real-time Web Search**: Get the latest web information based on Tavily API
- **Intelligent Query Extraction**: Automatically extract the most relevant search keywords from user questions
- **Search Result Integration**: Seamlessly integrate search results into AI conversations
- **Per-session Control**: Each conversation can independently enable or disable search functionality
- **Search History**: Save search queries and results to database
- **Configurable System Messages**: Support custom search-related system prompt messages

### Configuration

#### 1. Get Tavily API Key

1. Visit [Tavily Official Website](https://tavily.com/) to register an account
2. Obtain API Key

#### 2. Administrator Configuration

1. Login to the system as an administrator
2. Go to system settings page
3. Find "Web Search Configuration" option
4. Fill in the following configurations:
   - **Enable Status**: Turn on/off global search functionality
   - **API Key**: Enter Tavily API Key
   - **Max Search Results**: Set the maximum number of search results returned per search (1-20, default 10)
   - **Search Query System Message**: Prompt template for extracting search keywords
   - **Search Result System Message**: Prompt template for processing search results

#### 3. System Message Templates

**Search Query Extraction Template** (for extracting search keywords from user questions):
```
You are a search query extraction assistant. Extract the most relevant search query from user's question and wrap it with <search_query></search_query> tags.
Current time: {current_time}
```

**Search Result Processing Template** (for processing conversations with search results):
```
You are a helpful assistant with access to real-time web search results. Use the provided search information to give accurate and up-to-date responses.
Current time: {current_time}
```

### Usage

#### User Operations

1. **Enable Search Functionality**:
   - In the conversation interface, find the search toggle button
   - Click to enable web search functionality for the current session

2. **Ask Questions for Real-time Information**:
   - After enabling search, directly ask ChatGPT questions that require real-time information
   - The system will automatically search for relevant information and integrate it into the response

3. **View Search History**:
   - Search queries and results are saved in the database
   - You can view specific search records through the database

#### Workflow

1. **User Question**: User asks a question in a search-enabled session
2. **Query Extraction**: System uses AI to extract search keywords from the question
3. **Web Search**: Call Tavily API for real-time search
4. **Result Integration**: Provide search results as context to AI
5. **Generate Response**: AI generates more accurate responses based on search results

### Technical Implementation

- **Search Engine**: Tavily API
- **Query Extraction**: Use OpenAI API to intelligently extract keywords
- **Result Format**: JSON format to store complete search results
- **Data Storage**: MongoDB stores search queries and results
- **Timeout Setting**: Search request timeout is 300 seconds
- **Result Count Control**: Support configuration of maximum search results returned per search (1-20)

### Notes

- Web Search functionality requires additional Tavily API costs
- Search functionality will increase response time
- It is recommended to enable selectively based on actual needs
- Administrators can control the global search functionality status
- Each session can independently control whether to use search functionality
- The maximum search results setting affects the detail level of search and API costs


## Contributing

Please read the [Contributing Guidelines](./CONTRIBUTING.en.md) before contributing.

Thanks to all the contributors!

<a href="https://github.com/chatgpt-web-dev/chatgpt-web/graphs/contributors">
  <img alt="Contributors Image" src="https://contrib.rocks/image?repo=chatgpt-web-dev/chatgpt-web" width="550" />
</a>

## Star History

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=chatgpt-web-dev/chatgpt-web&type=Date&theme=dark" />
  <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=chatgpt-web-dev/chatgpt-web&type=Date" />
  <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=chatgpt-web-dev/chatgpt-web&type=Date" width="550" />
</picture>

## Sponsorship

If you find this project helpful, please give me a star.

---

Thanks to [DigitalOcean](https://www.digitalocean.com/) for sponsoring providing open-source credits used to run our infrastructure servers.

<p>
  <a href="https://www.digitalocean.com/">
    <img alt="digitalocean" src="https://opensource.nyc3.cdn.digitaloceanspaces.com/attribution/assets/SVG/DO_Logo_horizontal_blue.svg" width="201px">
  </a>
</p>

## License
[MIT © github.com/chatgpt-web-dev Contributors](./LICENSE)
