# 📝 TextPad Workers

A minimalist web notepad running on Cloudflare Workers/Pages.

![Demo](https://img.shields.io/badge/Demo-Live-success)
![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ Features

- 🚀 **Auto-save** - No save button needed
- 🌙 **Dark mode** - Toggle with one click
- 📱 **Mobile friendly** - Works on all devices
- 🔗 **Shareable** - Every note has a unique URL
- ⌨️ **CLI support** - Access via `curl` or `wget`
- 💾 **Download** - Export as .txt file
- 📧 **Email** - Send via email
- 🗑️ **Delete** - Permanent deletion

## 🚀 Quick Deploy

### Step 1: Fork this repository

Click the **"Fork"** button on GitHub.

### Step 2: Connect to Cloudflare

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click **Workers & Pages** → **Create application**
3. Select **Pages** → **Connect to Git**
4. Choose your forked repository
5. Configure:
   - Framework preset: `None`
   - Build command: `echo "No build needed"`
   - Build output directory: `/`
6. Click **Save and Deploy**

### Step 3: Create KV Namespace

1. In Cloudflare Dashboard, go to **Workers & Pages** → **KV**
2. Click **Create a namespace**
3. Name: `NOTES`
4. Copy the **Namespace ID**

### Step 4: Bind KV to your project

1. Go to your Pages project → **Settings** → **Functions**
2. Find **KV namespace bindings**
3. Click **Add binding**:
   - Variable name: `NOTES`
   - KV namespace: Select `NOTES`
4. Save

### Step 5: Update wrangler.toml

Edit `wrangler.toml` in your GitHub repo:
```toml
[[kv_namespaces]]
binding = "NOTES"
id = "paste-your-namespace-id-here"

textpad-workers/
├── src/
│   └── index.js          # 主代码（Workers/Pages 入口）
├── wrangler.toml         # Cloudflare 配置
├── README.md             # 说明文档
├── LICENSE               # MIT 许可证
└── .gitignore            # Git 忽略文件

在 Cloudflare 上部署你这个「TextPad Workers」记事本，主要限制来自：
1. Workers 本身的 CPU 时间、内存、请求体大小等运行限制；  
2. Workers KV 的存储容量、读写频率与配额；  
3. 免费计划的请求量、脚本大小等。
下面「平台限制」「KV 存储」「安全/运维」「使用建议」
---
## 一、Cloudflare Workers 平台本身的关键限制
### 1. 请求与 CPU
**免费计划（Workers Free）**：
- 请求数：  
  - 每天 **100,000 次请求**（Workers + Pages Functions 合计）。
- CPU 时间：
  - 每个 HTTP 请求 **10 ms CPU 时间**（注意是 CPU 时间，不是墙钟时间）。
- 内存：
  - 每个 isolate（Worker 实例）最大 **128 MB**。
**付费计划（Workers Paid / Standard）**：
- 请求数：  
  - 每月 **1000 万请求** 额度，超出按 $0.30/百万请求计费。
- CPU 时间：
  - 每次请求默认 **30 秒 CPU，上限可配到 5 分钟**。
  - 计费上是每月包含 3000 万 CPU ms，超出按 $0.02/百万 CPU ms 计费。
- 内存：同样 **128 MB / isolate**。
对你这个项目的影响：
- 你的 Worker 逻辑非常简单（读/写 KV、拼 HTML），正常情况下 CPU 远小于 10 ms，**免费计划在 CPU 上完全没问题**。
- 真正要注意的是：  
  - 免费计划每天 10 万请求上限；  
  - KV 读写次数和存储空间（见下一节）。
### 2. Worker 脚本大小与子请求等
- Worker 脚本大小（打包后）：
  - 免费计划：最大 **3 MB**。
  - 付费计划：最大 **10 MB**。
- 子请求数（`fetch()` 到其他服务）：
  - 免费计划：每个请求最多 **50 个外部子请求**。
  - 付费计划：每个请求最多 **10,000 个子请求**。
你的项目几乎不会触发这些上限。
---
## 二、Workers KV 的限制（你真正要小心的地方）
你的项目用 `env.NOTES` KV 存笔记内容，这一块的约束是最需要关注的。
### 1. 存储 & key/value 大小
KV 的平台限制：
- **Key 大小**：最大 **512 bytes**。
- **Value 大小**：最大 **25 MiB**。
- **单个命名空间存储**：
  - 免费计划：每个命名空间最多 **1 GB** 总存储。
  - 付费计划：**无上限**（默认，实际可申请再提高）。
- **Key 数量**：命名空间内 key 数量本身无限制。
对你项目的影响：
- 每篇笔记就是一个 `note:xxx` 的 key，内容是 value。  
- 单篇笔记最大 25 MB，对纯文本来说绰绰有余。  
- 免费计划下，**所有笔记合计最多约 1 GB**，超过后需要付费或清理旧笔记。
### 2. 读写频率与配额（非常重要）
KV 的读写配额：
- **读取**：
  - 免费计划：每天 **100,000 次 KV 读**（全局，不按命名空间）。
  - 付费计划：**无限读**。
- **写入**：
  - 免费计划：每天 **1,000 次写入不同 key**；**同一 key 最多 1 次写入/秒**。
  - 付费计划：写入不同 key 无限；同一 key 仍然 **1 次/秒**。
对你项目的影响：
- 每次打开笔记 → 一次 `NOTES.get()`；  
- 每次自动保存 → 一次 `NOTES.put()`；  
- 免费计划下：
  - 读取：每天 10 万次读，相当于平均每分钟 ~70 次，只要不是被疯狂刷新，一般够用。
  - 写入：**每天只有 1000 次写入不同 key**，同一笔记如果频繁保存，还会受「1 key 1 写/秒」限制。
- 建议：
  - 在前端做「防抖/节流」，不要用户每打一个字符就写一次 KV（你现在 1 秒自动保存一次，这很 OK）。
  - 高频写入场景要考虑：用 D1 / R2 / 自建后端，或升级付费计划。
---
## 三、请求/响应体与缓存相关限制
### 1. Request / Response 大小
- URL 长度：最大 **16 KB**。
- 请求头 + 响应头：各最大 **128 KB**。
- 请求体大小：
  - 与 Cloudflare 套餐有关，而不是 Workers Plan：
    - Free / Pro：最大 **100 MB** 请求体。
    - Business：200 MB。
    - Enterprise：500 MB。
- 响应体大小：
  - Workers 本身 **不限制** 响应体大小。
  - 但 CDN 缓存层有：
    - Free / Pro / Business：单个缓存对象最大 **512 MB**。
    - Enterprise：最大 **5 GB**。
对你项目的影响：
- 你现在是纯文本内容，远小于这些限制，基本不用改。
- 如果以后改成支持上传大文件，就要注意请求体上限和缓存体上限。
---
## 四、与 Cloudflare Pages / Functions 的关系
如果你把这个项目部署在 **Cloudflare Pages + Functions**：
- Pages Functions 会作为 Workers 运行，**消耗的是 Workers 的配额**（请求数、CPU 时间、KV 读写等）。
- Pages 的静态资源请求（HTML/JS/CSS）一般不计入 Workers 请求配额。
- Functions 同样受 Worker 脚本大小限制（免费 3 MB，付费 10 MB）。
---
## 五、安全与运维注意事项
### 1. ID 与访问控制
- 你的 ID 规则：`^[a-zA-Z0-9_-]{1,64}$`，可预测性较高。
- 目前任何人只要猜到 ID 就能访问/修改/删除笔记。
- 如果以后要公开部署，建议：
  - 加一层访问控制：
    - 在 `fetch` 入口判断 `url.pathname` 是否在允许的前缀列表里；
    - 或增加简单密码/Token 校验（存在环境变量里）。
  - 对删除操作做更严格的校验（比如需要密码或管理员权限）。
### 2. KV 最终一致性与写入冲突
- KV 是**最终一致性**，不同边缘节点之间同步有延迟（最长可达 60 秒）。
- 同一 key 并发写入时，**最后写入会覆盖前一次**。
- 你的场景是一个笔记对应一个 key，且只有一个用户在编辑，问题不大；但如果未来有多终端同时编辑，就要考虑：
  - 版本号 / 冲突解决；
  - 或改用 D1 / R2 / 自建数据库。
### 3. 监控与错误处理
- 建议在 Worker 中统一捕获错误，返回合适的 HTTP 状态码，而不是直接抛出异常。
- 在 Cloudflare Dashboard 里打开：
  - Workers → Logs / Metrics；
  - 监控错误（如 `exceededCpu`、`exceededMemory`、KV 429 限流等）。
---
## 六、针对你这个项目的具体建议
结合你的代码，给几个实际落地建议：
1. **KV 写入频率控制**  
   - 前端你已经做了 1 秒自动保存一次，这符合「同一 key 最多 1 写/秒」的限制。
   - 可以再加一点防抖：用户停止输入 N 秒后才真正写入，减少无效写入。
2. **免费计划下的容量规划**  
   - 单篇笔记 25 MB 上限，实际你可以在前端限制为比如 1 MB。
   - 所有笔记总容量控制在 1 GB 以内，超出前主动清理或升级计划。
3. **ID 可预测性问题**  
   - 如果只做个人工具，问题不大；
   - 如需公开部署，建议：
     - 使用更长、更随机的 ID；
     - 或加简单访问控制（URL token、密码等）。
4. **部署方式**  
   - 如果只是纯 Worker，直接用 `wrangler deploy` 部署 Worker 即可。
   - 如果以后想加前端框架，可以迁移到 Pages + Functions，但要注意 Functions 仍然消耗 Workers 配额。
---
### 小结
- **运行限制**：免费计划每天 10 万请求 + 10 ms CPU / 请求，对你的简单记事本绰绰有余。  
- **KV 限制**：单 value 25 MB，免费计划总共 1 GB 存储，每天 10 万读、1000 写不同 key、同一 key 1 写/秒，这是你真正要控制的地方。  
- **安全与容量**：ID 可预测、最终一致性、写入频率和总容量是后续如果要公开运营时需要重点考虑的点。
 Worker 里加上：简单的访问控制、写入防抖、容量提示等，让它更适合在生产环境使用。

