import type { Article } from "@/types";

export const ARTICLES_DATA: Article[] = [
  {
    id: 1,
    title: 'React 19 中的 Actions 异步状态与 Form 处理详解',
    summary: '深入探讨 React 19 引入的 Actions API。传统的表单在处理异步数据提交时，面临繁琐的 isPending 状态维护。通过全新的 action 属性，React 能无缝自动管理并简化底层渲染周期。',
    content: `
      <p class="mb-4 text-base leading-relaxed">在 React 19 中，我们引入了 <strong>Actions</strong> 的全新概念。只要一个函数会执行异步操作，并且你将其传递给触发并发事件的元素（如 &lt;form&gt; 的 action 属性），React 就会自动为你管理它的完整生命周期。</p>
      
      <h3 class="text-lg font-semibold mt-6 mb-3 text-neutral-800 dark:text-neutral-200">传统异步表单维护的痛苦点</h3>
      <p class="mb-4 text-base leading-relaxed">在过去，我们需要手动维护 <code>isPending</code>、<code>error</code> 等多种冗杂的状态：</p>
      
      <div class="bg-neutral-900 text-neutral-100 p-4 rounded-xl font-mono text-sm mb-6 shadow-sm overflow-x-auto">
        <span class="text-orange-400">function</span> <span class="text-yellow-300">UpdateName</span>() {<br/>
        &nbsp;&nbsp;<span class="text-orange-400">const</span> [name, setName] = useState(<span class="text-green-300">""</span>);<br/>
        &nbsp;&nbsp;<span class="text-orange-400">const</span> [isPending, setIsPending] = useState(<span class="text-orange-400">false</span>);<br/>
        &nbsp;&nbsp;<span class="text-orange-400">const</span> [error, setError] = useState(<span class="text-orange-400">null</span>);<br/><br/>
        &nbsp;&nbsp;<span class="text-orange-400">const</span> handleSubmit = <span class="text-orange-400">async</span> () => {<br/>
        &nbsp;&nbsp;&nbsp;&nbsp;setIsPending(<span class="text-orange-400">true</span>);<br/>
        &nbsp;&nbsp;&nbsp;&nbsp;<span class="text-orange-400">try</span> {<br/>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="text-orange-400">await</span> updateNameAPI(name);<br/>
        &nbsp;&nbsp;&nbsp;&nbsp;} <span class="text-orange-400">catch</span>(err) {<br/>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;setError(err);<br/>
        &nbsp;&nbsp;&nbsp;&nbsp;} <span class="text-orange-400">finally</span> {<br/>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;setIsPending(<span class="text-orange-400">false</span>);<br/>
        &nbsp;&nbsp;&nbsp;&nbsp;}<br/>
        &nbsp;&nbsp;};<br/>
        }
      </div>

      <h3 class="text-lg font-semibold mt-6 mb-3 text-neutral-800 dark:text-neutral-200">优雅的 React 19 Action 优雅集成</h3>
      <p class="mb-4 text-base leading-relaxed">在全新架构中，使用 <code>useTransition</code> 或者是 Form Action，React 可以在后台异步完成数据请求时依然保持页面高响应。状态合并和组件解耦让整个前端团队工作更具流线性。</p>
    `,
    type: 'text',
    pluginId: 'verge',
    pluginName: 'The Verge',
    author: 'React Team',
    time: '24小时前',
    reads: '35k 阅览',
    image: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&w=800&q=80',
    tags: ['React 19', 'Actions API', '前端前沿'],
    isBookmarked: false
  },
  {
    id: 2,
    title: 'Forza Horizon 6 is the first racing game to stand a chance in 2026',
    summary: '随着拟真光线追踪与动态实时天气引擎加入，Forza Horizon 6 在画质与开放世界物理层级上完成了不可思议的飞跃。本篇带你领略无边界赛车体验。',
    content: `
      <p class="mb-4 text-base leading-relaxed">极限竞速系列最新力作即将登陆！此次开发组着重重构了车辆悬挂与轮胎温度交互物理。无论是深水水坑、沙泥尘埃还是高速公路，每一帧都极尽奢华。</p>
      <p class="mb-4 text-base leading-relaxed">我们采访了 Turn 10 创意总监。他表示：“我们不再仅仅考虑渲染速度，全新的自适应折射在每平方英寸上提供了接近肉眼观察所得的超强光照反射，这在2026年是跨时代的成果。”</p>
    `,
    type: 'text',
    pluginId: 'polygon',
    pluginName: 'Polygon',
    author: 'Tech & Gaming',
    time: '1天前',
    reads: '12k 阅览',
    image: 'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=800&q=80',
    tags: ['Forza 6', 'Xbox', '光线追踪'],
    isBookmarked: false
  },
  {
    id: 3,
    title: '【4K 测评】Apple Vision Pro 2 终极长期体验报告：等待终获回报？',
    summary: '深度解析 Vision Pro 第二代。在佩戴体验、电池功耗、超逼真虚拟协作空间等核心痛点中，这一代给出了几乎完美的答卷，带你第一视角体验空间计算的成熟期。',
    content: ``,
    type: 'video',
    pluginId: 'youtube',
    pluginName: 'YouTube Tech',
    author: 'MKBHD Tech Reviews',
    time: '2小时前',
    reads: '125k 播放',
    image: 'https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?auto=format&fit=crop&w=800&q=80',
    videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4', // Demo video file
    tags: ['Apple Vision', '空间计算', '硬件测评'],
    isBookmarked: false
  },
  {
    id: 4,
    title: '硅谷独家对谈：Sam Altman 预测 2026 年通用人工智能的下一级变局',
    summary: '在最新的专访播客中，OpenAI 创始人分享了对于自主式 AI Agents、多模态感官连接以及全自动化软件编写在各垂直领域大规模落地的路线展望。',
    content: ``,
    type: 'audio',
    pluginId: 'spotify',
    pluginName: 'Spotify Podcast',
    author: 'Tech Founders Daily',
    time: '3小时前',
    reads: '44k 收听',
    image: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=800&q=80',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // Demo audio
    audioDuration: '54:21',
    tags: ['AGI', 'Sam Altman', '深度访谈'],
    isBookmarked: false
  },
  {
    id: 5,
    title: '赛博朋克极简美学：全球未来建筑设计巡礼',
    summary: '在霓虹闪烁的夜空、垂直延伸的空中花园与混凝土雕塑美学交错中，探索全球建筑大奖最前沿的设计成果。',
    content: ``,
    type: 'image',
    pluginId: 'unsplash',
    pluginName: 'Unsplash Daily',
    author: 'ArchVisual Gallery',
    time: '5小时前',
    reads: '8k 推荐',
    image: 'https://images.unsplash.com/photo-1504051771394-dd2e66b2e08f?auto=format&fit=crop&w=1200&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1504051771394-dd2e66b2e08f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1449034446853-66c86144b0ad?auto=format&fit=crop&w=800&q=80'
    ],
    tags: ['视觉探索', '建筑设计', '艺术美感'],
    isBookmarked: false
  },
  {
    id: 6,
    title: '理解高速数据引擎底层：从 B-Tree 演进至现代 LSM-Tree',
    summary: '为什么在极速写入的写入密集型场景（如 ClickHouse，RocksDB）中，大名鼎鼎的 B-Tree 会逊色于 LSM-Tree？深入理解合并排序与写前日志机制。',
    content: `
      <p class="mb-4 text-base leading-relaxed">在现代分布式存储技术栈中，如何权衡“写性能”与“读性能”始终是系统架构师们最乐此不疲的话题。B-Tree 作为经典的关系型数据库基石，却在超高频点写入性能前遇到了难以逾越的瓶颈。</p>
      
      <h3 class="text-lg font-semibold mt-6 mb-3 text-neutral-800 dark:text-neutral-200">LSM-Tree 的妙手回春</h3>
      <p class="mb-4 text-base leading-relaxed">Log-Structured Merge-tree 通过将所有的随机写操作全部转化为按顺序快速追加写的日志记录（Write-Ahead Log, WAL）来压榨磁盘的极限性能。内存中的 MemTable 随后会在静默中异步刷入多层级磁盘结构中（SSTable），在后台执行自动 Compaction 优化读取速度。</p>
    `,
    type: 'text',
    pluginId: 'verge',
    pluginName: 'The Verge',
    author: 'Software Architecture',
    time: '2天前',
    reads: '9.5k 阅览',
    image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80',
    tags: ['数据库底层', 'LSM-Tree', '存储引擎'],
    isBookmarked: false
  }
];
