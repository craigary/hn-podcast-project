# SEO 增强 - 快速参考指南

## 📋 已实现的功能

### 1. SEO 组件 ([SEO.astro](apps/web/src/components/SEO.astro))

**自动生成的标签**：

- ✅ Open Graph (Facebook)
- ✅ Twitter Card
- ✅ 标准 SEO 元标签
- ✅ Canonical URL
- ✅ RSS Feed 链接
- ✅ Favicon
- ✅ 多语言支持

### 2. 页面配置

| 页面     | 标题          | 描述               | 图片         | 类型    |
| -------- | ------------- | ------------------ | ------------ | ------- |
| 首页     | HN 瞎聊       | 动态（含最新一期） | 最新封面     | website |
| 单集页面 | EP{n}: {标题} | Episode 描述       | Episode 封面 | article |
| 关于     | 关于          | 自定义             | 默认         | website |
| 如何收听 | 如何收听      | 自定义             | 默认         | website |
| AI 技术  | AI 技术说明   | 自定义             | 默认         | website |
| 更新日志 | 更新日志      | 自定义             | 默认         | website |

## 🎯 使用方法

### 在页面中使用

```astro
---
import Layout from '../layouts/Layout.astro'

const description = "你的页面描述"
const image = "https://example.com/image.jpg"
---

<Layout
  title="页面标题"
  description={description}
  image={image}
  type="website"
>
  <!-- 页面内容 -->
</Layout>
```

### 文章类型页面

```astro
<Layout
  title="文章标题"
  description="文章描述"
  image="文章封面"
  type="article"
  publishedTime="2026-02-18T00:00:00.000Z"
  author="作者名称"
>
  <!-- 文章内容 -->
</Layout>
```

## 🔍 验证工具

### 在线验证

1. **Twitter Card Validator**
   - https://cards-dev.twitter.com/validator
   - 验证 Twitter 卡片显示

2. **Facebook Sharing Debugger**
   - https://developers.facebook.com/tools/debug/
   - 验证 Open Graph 信息

3. **Google Rich Results Test**
   - https://search.google.com/test/rich-results
   - 验证结构化数据

### 本地验证

```bash
# 构建项目
bun run build

# 检查首页 SEO
grep -E "(og:|twitter:)" dist/index.html

# 检查单集页面 SEO
grep -E "(og:|twitter:)" dist/1/index.html
```

## 📊 生成的标签示例

### Open Graph

```html
<meta property="og:type" content="article" />
<meta property="og:title" content="EP1: 标题 — HN 瞎聊" />
<meta property="og:description" content="描述..." />
<meta property="og:image" content="https://..." />
<meta property="og:url" content="https://..." />
<meta property="og:site_name" content="HN 瞎聊" />
<meta property="og:locale" content="zh_CN" />
<meta property="article:published_time" content="2026-02-07T00:00:00.000Z" />
<meta property="article:author" content="HN 瞎聊" />
```

### Twitter Card

```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="EP1: 标题 — HN 瞎聊" />
<meta name="twitter:description" content="描述..." />
<meta name="twitter:image" content="https://..." />
<meta name="twitter:site" content="@craigaryhart" />
```

## 🎨 创建 OG 图片

### 推荐尺寸

- **Open Graph**: 1200×630 像素
- **Twitter Card**: 1200×630 像素（相同）

### 设计建议

1. 包含播客 Logo
2. 显示播客名称
3. 添加简短标语
4. 使用品牌颜色
5. 保持简洁清晰

### 工具推荐

- [Figma](https://figma.com) - 专业设计工具
- [Canva](https://canva.com) - 简单易用
- [OG Image Generator](https://og-image.vercel.app/) - 在线生成

### 放置位置

```
apps/web/public/og-image.png
```

## 🚀 下一步优化

### 1. 添加结构化数据 (JSON-LD)

在 `SEO.astro` 中添加：

```astro
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "PodcastSeries",
  "name": "HN 瞎聊",
  "description": "每日精选 Hacker News 热门话题",
  "url": "https://craigary.net",
  "author": {
    "@type": "Organization",
    "name": "HN 瞎聊"
  },
  "image": "https://craigary.net/og-image.png"
}
</script>
```

### 2. 配置 Google Search Console

1. 访问 https://search.google.com/search-console
2. 添加你的网站
3. 验证所有权
4. 提交网站地图（`/sitemap.xml`）
5. 监控索引状态

### 3. 添加 Google Analytics

在 `Layout.astro` 的 `<head>` 中添加：

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || []
  function gtag() {
    dataLayer.push(arguments)
  }
  gtag('js', new Date())
  gtag('config', 'G-XXXXXXXXXX')
</script>
```

### 4. 生成 Sitemap

创建 `apps/web/src/pages/sitemap.xml.ts`:

```typescript
import { getCollection } from 'astro:content'
import { podcastConfig } from '@hn/config'

export async function GET() {
  const episodes = await getCollection('episodes')
  const siteUrl = podcastConfig.site.url

  const urls = [
    { loc: siteUrl, priority: 1.0 },
    { loc: `${siteUrl}/about`, priority: 0.8 },
    { loc: `${siteUrl}/how-to-listen`, priority: 0.8 },
    ...episodes.map(ep => ({
      loc: `${siteUrl}/${ep.id}`,
      lastmod: ep.data.date,
      priority: 0.9
    }))
  ]

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    url => `  <url>
    <loc>${url.loc}</loc>
    ${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ''}
    <priority>${url.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`

  return new Response(sitemap, {
    headers: { 'Content-Type': 'application/xml' }
  })
}
```

## 📈 监控 SEO 表现

### Google Search Console 指标

- 展示次数
- 点击次数
- 平均排名
- 点击率（CTR）

### 关键指标

- 索引页面数量
- 搜索查询
- 外部链接
- 移动端可用性

## ✅ 检查清单

- [x] SEO 组件创建
- [x] Layout 集成
- [x] 首页 SEO 配置
- [x] 单集页面 SEO 配置
- [x] 静态页面 SEO 配置
- [x] Open Graph 标签
- [x] Twitter Card 标签
- [x] Canonical URL
- [x] RSS Feed 链接
- [x] 构建测试通过
- [ ] 创建 OG 图片
- [ ] 添加结构化数据
- [ ] 配置 Google Search Console
- [ ] 添加 Google Analytics
- [ ] 生成 Sitemap

## 🎉 完成状态

**核心功能**：✅ 100% 完成

- SEO 组件
- 所有页面配置
- Open Graph
- Twitter Card
- 构建验证

**可选优化**：⏳ 待完成

- OG 图片
- 结构化数据
- Analytics
- Sitemap

---

**文档更新时间**：2026-02-18
**版本**：1.0.0
