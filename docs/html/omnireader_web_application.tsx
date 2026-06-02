import React, { useState, useMemo } from 'react';

// Self-contained high-quality SVG Icons helper to prevent external dependency failures
const Icon = ({ name, className = "w-5 h-5", active = false }) => {
  const icons = {
    sparkles: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
      </svg>
    ),
    collapse: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M9 3v18" />
        <path d="m16 15-3-3 3-3" />
      </svg>
    ),
    expand: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M9 3v18" />
        <path d="m13 9 3 3-3 3" />
      </svg>
    ),
    search: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
    today: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
        <line x1="16" x2="16" y1="2" y2="6" />
        <line x1="8" x2="8" y1="2" y2="6" />
        <line x1="3" x2="21" y1="10" y2="10" />
        <path d="m9 16 2 2 4-4" />
      </svg>
    ),
    bookmark: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
      </svg>
    ),
    trending: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
    puzzle: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="M12 6v12" />
        <path d="M6 12h12" />
      </svg>
    ),
    swap: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="m16 3 4 4-4 4" />
        <path d="M20 7H4" />
        <path d="m8 21-4-4 4-4" />
        <path d="M4 17h16" />
      </svg>
    ),
    sun: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
    ),
    moon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    ),
    focus: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M15 3h6v6" />
        <path d="M9 21H3v-6" />
        <path d="M21 3l-7 7" />
        <path d="M3 21l7-7" />
      </svg>
    ),
    text: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h12" />
      </svg>
    ),
    video: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="m22 8-6 4 6 4V8Z" />
        <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
      </svg>
    ),
    audio: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      </svg>
    ),
    image: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    ),
    share: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" x2="12" y1="2" y2="15" />
      </svg>
    ),
    ai: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
    close: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    ),
    check: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
    play: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M8 5v14l11-7z" />
      </svg>
    ),
    pause: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
      </svg>
    )
  };

  return icons[name] || null;
};

const INITIAL_PLUGINS = [
  { id: 'all', name: '全部平台', icon: 'sparkles', active: true, desc: '集成展示所有订阅内容', color: 'bg-indigo-500' },
  { id: 'verge', name: 'The Verge', icon: 'text', active: true, desc: '科技前沿与深度评测报告', logoText: 'V', color: 'bg-cyan-500' },
  { id: 'polygon', name: 'Polygon', icon: 'text', active: true, desc: '硬核游戏文化与行业动态评述', logoText: 'P', color: 'bg-rose-500' },
  { id: 'youtube', name: 'YouTube Tech', icon: 'video', active: true, desc: '视频类新闻、博主产品深度测评', logoText: 'Y', color: 'bg-red-500' },
  { id: 'spotify', name: 'Spotify Podcast', icon: 'audio', active: true, desc: '极客、科技领袖播客音频访谈', logoText: 'S', color: 'bg-emerald-500' },
  { id: 'unsplash', name: 'Unsplash Daily', icon: 'image', active: true, desc: '精选全球高质量视觉建筑与艺术设计', logoText: 'U', color: 'bg-neutral-800' }
];

const PLUGINS_STORE = [
  { id: 'wired', name: 'WIRED 连线', icon: 'text', desc: '关注科技、人文、科学对社会和文化的深远改变。', logoText: 'W', color: 'bg-black' },
  { id: 'bilibili', name: 'Bilibili 科技', icon: 'video', desc: '国内极客原创、软硬件拆机深度测评视频。', logoText: 'B', color: 'bg-sky-400' },
  { id: 'audible', name: 'Audible Books', icon: 'audio', desc: '精选畅销科技新书有声书伴读。', logoText: 'A', color: 'bg-amber-600' }
];

const ARTICLES_DATA = [
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

export default function App() {
  const [theme, setTheme] = useState('light'); // light or dark
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [layoutSwap, setLayoutSwap] = useState(false); // false: Left-to-Right | true: Right-to-Left (swap list and reader)
  const [activePlugin, setActivePlugin] = useState('all');
  const [activeCategory, setActiveCategory] = useState('all'); // all, text, video, audio, image
  const [searchQuery, setSearchQuery] = useState('');
  
  // Articles state with bookmarks
  const [articles, setArticles] = useState(ARTICLES_DATA);
  const [selectedItem, setSelectedItem] = useState(ARTICLES_DATA[0]);
  const [activeTab, setActiveTab] = useState('today'); // today, bookmarks, trending
  
  // Plugin Management
  const [myPlugins, setMyPlugins] = useState(INITIAL_PLUGINS);
  const [showPluginStore, setShowPluginStore] = useState(false);
  
  // Focus and Dimmer Mode
  const [focusMode, setFocusMode] = useState(false);
  const [dimmerMode, setDimmerMode] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);

  // Audio Player State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(35);

  // Image Slider Index
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const filteredArticles = useMemo(() => {
    return articles.filter(item => {
      // Filter by plugin ID
      if (activePlugin !== 'all' && item.pluginId !== activePlugin) {
        return false;
      }
      
      // Filter by custom left-side tabs
      if (activeTab === 'bookmarks' && !item.isBookmarked) {
        return false;
      }
      if (activeTab === 'trending' && item.reads && parseInt(item.reads) < 15) {
        // Simple trending heuristic for items with higher readership
        if (!item.reads.includes('k')) return false;
      }

      // Filter by category icons
      if (activeCategory !== 'all' && item.type !== activeCategory) {
        return false;
      }

      // Filter by Search Query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(query) ||
          item.summary.toLowerCase().includes(query) ||
          item.tags.some(t => t.toLowerCase().includes(query))
        );
      }

      return true;
    });
  }, [articles, activePlugin, activeTab, activeCategory, searchQuery]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleItemSelect = (item) => {
    setSelectedItem(item);
    setAiSummary(null); // Clear previous AI summarizes
    setIsPlayingAudio(false);
    setActiveImageIndex(0);
  };

  const handleBookmarkToggle = (id) => {
    setArticles(prev => {
      const updated = prev.map(item => {
        if (item.id === id) {
          const newItem = { ...item, isBookmarked: !item.isBookmarked };
          // Keep selected item synchronized
          if (selectedItem && selectedItem.id === id) {
            setSelectedItem(newItem);
          }
          return newItem;
        }
        return item;
      });
      return updated;
    });
  };

  const handleInstallPlugin = (newPlugin) => {
    if (!myPlugins.some(p => p.id === newPlugin.id)) {
      setMyPlugins([...myPlugins, { ...newPlugin, active: true }]);
    }
    setShowPluginStore(false);
  };

  const handleUninstallPlugin = (id) => {
    setMyPlugins(prev => prev.filter(p => p.id !== id));
    if (activePlugin === id) {
      setActivePlugin('all');
    }
  };

  const handleAISimplify = () => {
    setIsSummarizing(true);
    setTimeout(() => {
      setAiSummary(`💡 【OmniAI 智能速读纪要】：
1. 本文聚焦于在现代框架架构下，如何剔除传统状态机（isPending）冗余，通过自动化代理彻底简化生命周期。
2. 在异步请求与界面交互中，React 19 通过将 Form Action 直接关联底层 Transition，大大提高复杂页面的响应效率。
3. 提供了更细粒度且无任何副作用的原生状态回调支持，使极简主义前端代码重构效率提升近 40%。`);
      setIsSummarizing(false);
    }, 1200);
  };

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${theme === 'dark' ? 'bg-[#121314] text-[#e3e3e3]' : 'bg-[#f8f9fa] text-[#1f1f1f]'}`}>
      
      {}
      <header className={`sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b transition-colors duration-300 ${theme === 'dark' ? 'bg-[#1c1d1f] border-neutral-800' : 'bg-white border-neutral-100'} shadow-sm`}>
        
        {/* Left Section: Logo & Collapser */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className={`p-2 rounded-full transition-colors duration-200 ${theme === 'dark' ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-neutral-100 text-neutral-500'}`}
            title={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            <Icon name={isSidebarCollapsed ? "expand" : "collapse"} className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-1.5 rounded-xl">
              <Icon name="sparkles" className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">
              OmniReader <span className="text-[10px] uppercase font-semibold text-neutral-400 px-1 border border-neutral-300 dark:border-neutral-700 rounded-md">PRO</span>
            </span>
          </div>
        </div>

        {/* Center Section: App Quick Status */}
        <div className="hidden md:flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>已实时同步 6 个信息源</span>
          <span className="mx-2 text-neutral-300">|</span>
          <button 
            onClick={() => setShowPluginStore(true)}
            className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            <Icon name="puzzle" className="w-3.5 h-3.5" />
            插件市场
          </button>
        </div>

        {/* Right Section: Visual Layout Control Actions */}
        <div className="flex items-center gap-2">
          {/* Swap Layout Button */}
          <button 
            onClick={() => setLayoutSwap(!layoutSwap)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              layoutSwap 
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-400' 
                : 'bg-transparent border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'
            }`}
            title="左右切换阅读列表与文章面板位置"
          >
            <Icon name="swap" className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">对调左右布局</span>
          </button>

          {/* Theme Switcher */}
          <button 
            onClick={toggleTheme}
            className={`p-2 rounded-full transition-colors duration-200 ${theme === 'dark' ? 'hover:bg-neutral-800 text-yellow-400' : 'hover:bg-neutral-100 text-neutral-600'}`}
            title={theme === 'dark' ? "切换为白昼模式" : "切换为暗夜模式"}
          >
            <Icon name={theme === 'dark' ? "sun" : "moon"} className="w-4 h-4" />
          </button>

          {/* Plugin Install Quick Button */}
          <button 
            onClick={() => setShowPluginStore(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all hover:shadow-md"
          >
            <Icon name="puzzle" className="w-3.5 h-3.5 text-white" />
            <span className="hidden sm:inline">安装/管理插件</span>
          </button>

          <div className="w-7 h-7 rounded-full bg-indigo-200 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shadow-inner">
            U
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex w-full h-[calc(100vh-57px)] overflow-hidden relative">
        
        {}
        <aside className={`h-full flex flex-col justify-between border-r transition-all duration-300 ${
          theme === 'dark' ? 'bg-[#1c1d1f] border-neutral-800' : 'bg-white border-neutral-100'
        } ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
          
          <div className="flex-1 py-4 overflow-y-auto no-scrollbar">
            
            {/* Top Navigation Items (Today, Bookmarks, Trending) */}
            <div className="px-3 space-y-1">
              <div className={`text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2 px-3 ${isSidebarCollapsed ? 'hidden' : 'block'}`}>
                视图大盘
              </div>

              <button 
                onClick={() => { setActiveTab('today'); setActivePlugin('all'); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                  activeTab === 'today' && activePlugin === 'all'
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium'
                    : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                }`}
                title="Today 全部资讯"
              >
                <div className="relative">
                  <Icon name="today" className="w-5 h-5 text-indigo-500" />
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                  </span>
                </div>
                {!isSidebarCollapsed && (
                  <div className="flex-1 flex items-center justify-between">
                    <span>Today 全部</span>
                    <span className="text-[10px] bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 px-1.5 py-0.5 rounded-md font-semibold">
                      {articles.length}
                    </span>
                  </div>
                )}
              </button>

              <button 
                onClick={() => { setActiveTab('bookmarks'); setActivePlugin('all'); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                  activeTab === 'bookmarks'
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium'
                    : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                }`}
                title="Bookmarks 二创/草稿"
              >
                <Icon name="bookmark" className="w-5 h-5 text-rose-500" />
                {!isSidebarCollapsed && (
                  <div className="flex-1 flex items-center justify-between">
                    <span>Bookmarks 收藏</span>
                    <span className="text-[10px] bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 px-1.5 py-0.5 rounded-md font-semibold">
                      {articles.filter(a => a.isBookmarked).length}
                    </span>
                  </div>
                )}
              </button>

              <button 
                onClick={() => { setActiveTab('trending'); setActivePlugin('all'); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                  activeTab === 'trending'
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium'
                    : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                }`}
                title="Trending 爆款高赞"
              >
                <Icon name="trending" className="w-5 h-5 text-amber-500" />
                {!isSidebarCollapsed && (
                  <div className="flex-1 flex items-center justify-between">
                    <span>Trending 爆款</span>
                    <span className="text-xs text-neutral-400">HOT</span>
                  </div>
                )}
              </button>
            </div>

            {/* Plugin Section */}
            <div className="px-3 mt-6 space-y-1">
              <div className={`flex items-center justify-between text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2 px-3 ${
                isSidebarCollapsed ? 'hidden' : 'block'
              }`}>
                <span>已启用的获取插件</span>
                <button 
                  onClick={() => setShowPluginStore(true)}
                  className="hover:text-indigo-600 transition-colors"
                  title="安装新插件"
                >
                  <Icon name="puzzle" className="w-3 h-3" />
                </button>
              </div>

              {myPlugins.map((plugin) => (
                <button 
                  key={plugin.id}
                  onClick={() => {
                    setActivePlugin(plugin.id);
                    setActiveTab('all');
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                    activePlugin === plugin.id
                      ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium'
                      : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                  }`}
                  title={plugin.name}
                >
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white ${plugin.color}`}>
                    {plugin.logoText || '★'}
                  </div>
                  {!isSidebarCollapsed && (
                    <div className="flex-1 flex items-center justify-between">
                      <span className="truncate">{plugin.name}</span>
                      {plugin.id !== 'all' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>

          </div>

          {/* Bottom App Footer */}
          <div className="p-3 border-t dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/20">
            <button 
              onClick={() => setShowPluginStore(true)}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-semibold transition-all"
            >
              <Icon name="puzzle" className="w-4 h-4" />
              {!isSidebarCollapsed && <span>添加/自定新插件</span>}
            </button>
            
            {!isSidebarCollapsed && (
              <div className="text-center mt-3 text-[10px] text-neutral-400 dark:text-neutral-500">
                TECHWRITE ENGINE 2.5
              </div>
            )}
          </div>
        </aside>

        {/* Dynamic Inner Layout Body: Swap handles Left <-> Right positions of (Feed panel vs Reader panel) */}
        <main className={`flex-1 flex ${layoutSwap ? 'flex-row-reverse' : 'flex-row'} h-full overflow-hidden transition-all duration-300`}>
          
          {}
          <section className={`w-full md:w-80 lg:w-96 h-full flex flex-col border-r border-l transition-all duration-300 ${
            theme === 'dark' ? 'bg-[#121314] border-neutral-800' : 'bg-white border-neutral-100'
          } ${focusMode ? 'hidden' : 'flex'}`}>
            
            {/* Search Column Container */}
            <div className="p-4 border-b dark:border-neutral-800 space-y-3">
              <div className={`relative flex items-center rounded-xl p-1 transition-all ${
                theme === 'dark' ? 'bg-[#1c1d1f]' : 'bg-[#f0f4f9]'
              }`}>
                <div className="pl-3 pr-2 text-neutral-400">
                  <Icon name="search" className="w-4 h-4" />
                </div>
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索当前列表的文章..."
                  className="w-full py-1.5 bg-transparent text-sm outline-none placeholder-neutral-400 dark:placeholder-neutral-500"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full"
                  >
                    <Icon name="close" className="w-3.5 h-3.5 text-neutral-500" />
                  </button>
                )}
              </div>

              {/* Resource Content Categories Filters */}
              <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                {[
                  { id: 'all', label: '全部' },
                  { id: 'text', label: '资讯' },
                  { id: 'video', label: '视频' },
                  { id: 'audio', label: '音频' },
                  { id: 'image', label: '图片' }
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                      activeCategory === cat.id
                        ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-sm'
                        : 'bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable list of feeds */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
              <div className="flex items-center justify-between text-xs text-neutral-400 mb-2">
                <span>{activeTab === 'bookmarks' ? '收藏的文章' : 'Today 全部文章'}</span>
                <span>共 {filteredArticles.length} 篇</span>
              </div>

              {filteredArticles.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 rounded-full bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-3">
                    <Icon name="search" className="w-6 h-6 text-neutral-400" />
                  </div>
                  <p className="text-sm text-neutral-400">未找到符合条件的资讯资源</p>
                </div>
              ) : (
                filteredArticles.map((item) => {
                  const isSelected = selectedItem && selectedItem.id === item.id;
                  return (
                    <div 
                      key={item.id}
                      onClick={() => handleItemSelect(item)}
                      className={`group relative p-3.5 rounded-2xl cursor-pointer transition-all duration-300 border ${
                        isSelected 
                          ? 'bg-[#e9eef6] dark:bg-neutral-800 border-indigo-200 dark:border-neutral-700 shadow-sm' 
                          : 'bg-white hover:bg-[#f0f4f9] dark:bg-neutral-900 dark:hover:bg-neutral-800/40 border-neutral-100 dark:border-neutral-800/50'
                      }`}
                    >
                      <div className="flex gap-3 justify-between">
                        <div className="flex-1 space-y-1">
                          {/* Platform Tag & Resource Type Icon */}
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full flex items-center justify-center text-[5px] text-white ${
                              item.pluginId === 'verge' ? 'bg-cyan-500' :
                              item.pluginId === 'polygon' ? 'bg-rose-500' :
                              item.pluginId === 'youtube' ? 'bg-red-500' :
                              item.pluginId === 'spotify' ? 'bg-emerald-500' : 'bg-neutral-800'
                            }`}>
                              {item.pluginName.charAt(0)}
                            </span>
                            <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">{item.pluginName}</span>
                            <span className="text-[10px] text-neutral-300">•</span>
                            <div className="text-neutral-400 group-hover:text-indigo-600 transition-colors">
                              <Icon name={item.type} className="w-3 h-3" />
                            </div>
                          </div>
                          
                          <h4 className={`text-sm font-semibold leading-snug line-clamp-2 transition-colors ${
                            isSelected ? 'text-indigo-700 dark:text-indigo-400' : 'text-neutral-800 dark:text-neutral-200'
                          }`}>
                            {item.title}
                          </h4>
                        </div>

                        {item.image && (
                          <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-neutral-100 relative">
                            <img 
                              src={item.image} 
                              alt="Thumbnail" 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => { e.target.src = 'https://placehold.co/100x100/eaeaea/999999?text=Cover'; }}
                            />
                            {/* Overlay media badge */}
                            {item.type !== 'text' && (
                              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                <Icon name={item.type} className="w-4 h-4 text-white drop-shadow" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Summary Excerpt */}
                      <p className="text-xs text-neutral-400 dark:text-neutral-500 line-clamp-2 mt-2">
                        {item.summary}
                      </p>

                      {/* Footer specs inside card */}
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-dashed border-neutral-100 dark:border-neutral-800/80 text-[10px] text-neutral-400">
                        <div className="flex items-center gap-2">
                          <span>{item.author}</span>
                          <span>•</span>
                          <span>{item.time}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>{item.reads}</span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBookmarkToggle(item.id);
                            }}
                            className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full"
                          >
                            <Icon name="bookmark" className="w-3 h-3 text-neutral-400" active={item.isBookmarked} />
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })
              )}
            </div>
          </section>

          {}
          <section className={`flex-1 h-full overflow-y-auto transition-all duration-300 ${
            theme === 'dark' ? 'bg-[#121314]' : 'bg-[#fafafa]'
          } ${dimmerMode ? 'brightness-[0.85] contrast-105' : ''}`}>
            
            {selectedItem ? (
              <div className="max-w-3xl mx-auto px-6 py-8 md:py-12 space-y-6">
                
                {/* Reader Panel Header with Control Widgets */}
                <div className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border transition-colors ${
                  theme === 'dark' ? 'bg-[#1c1d1f] border-neutral-800' : 'bg-white border-neutral-100'
                } shadow-sm`}>
                  
                  {/* Left Controls: Tags and Source info */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400 px-2 py-1 rounded-lg">
                      {selectedItem.pluginName}
                    </span>
                    <span className="text-xs text-neutral-400">
                      由 {selectedItem.author} 撰写
                    </span>
                  </div>

                  {/* Right Controls Actions Panel */}
                  <div className="flex items-center gap-1.5">
                    {/* Focus Mode button */}
                    <button 
                      onClick={() => setFocusMode(!focusMode)}
                      className={`p-2 rounded-xl text-xs flex items-center gap-1 transition-all ${
                        focusMode 
                          ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' 
                          : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500'
                      }`}
                      title={focusMode ? "退出专注模式" : "开启专注模式"}
                    >
                      <Icon name="focus" className="w-4 h-4" />
                      <span className="hidden sm:inline">{focusMode ? "退出专注" : "专注模式"}</span>
                    </button>

                    {/* Dimmer (Micro-read tint) */}
                    <button 
                      onClick={() => setDimmerMode(!dimmerMode)}
                      className={`p-2 rounded-xl text-xs flex items-center gap-1 transition-all ${
                        dimmerMode 
                          ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-400' 
                          : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500'
                      }`}
                      title="微光高亮阅读护眼模式"
                    >
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                      <span className="hidden sm:inline">微光高亮</span>
                    </button>

                    <button 
                      onClick={() => handleBookmarkToggle(selectedItem.id)}
                      className={`p-2 rounded-xl transition-all ${
                        selectedItem.isBookmarked 
                          ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400' 
                          : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500'
                      }`}
                      title="加入收藏"
                    >
                      <Icon name="bookmark" className="w-4 h-4" active={selectedItem.isBookmarked} />
                    </button>

                    <button 
                      className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl text-neutral-500"
                      title="分享文章链接"
                      onClick={() => {
                        // Safe clipboard mock copy
                        document.execCommand('copy');
                        alert('【OmniReader提示】: 文章分享链接已成功复制到剪切板！');
                      }}
                    >
                      <Icon name="share" className="w-4 h-4" />
                    </button>

                    {/* AI Prompt Summarizer Trigger */}
                    <button 
                      onClick={handleAISimplify}
                      disabled={isSummarizing}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-xs font-semibold shadow-sm hover:shadow transition-all disabled:opacity-50"
                    >
                      <Icon name="sparkles" className="w-3.5 h-3.5 text-white" />
                      <span>{isSummarizing ? "研读中..." : "一键一键 AI 精简总结"}</span>
                    </button>
                  </div>

                </div>

                {/* AI Summary Highlight Panel */}
                {aiSummary && (
                  <div className="relative p-5 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-100 dark:border-indigo-900/30 text-sm leading-relaxed text-indigo-900 dark:text-indigo-300">
                    <button 
                      onClick={() => setAiSummary(null)}
                      className="absolute top-3 right-3 p-1 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                    >
                      <Icon name="close" className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="sparkles" className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span className="font-bold">AI 速读概括</span>
                    </div>
                    <p className="whitespace-pre-line text-xs md:text-sm">{aiSummary}</p>
                  </div>
                )}

                {/* Article Header (Title, Subinfo) */}
                <div className="space-y-4">
                  <h1 className="text-2xl md:text-3.5xl font-extrabold tracking-tight text-neutral-900 dark:text-white leading-tight">
                    {selectedItem.title}
                  </h1>

                  {/* Dynamic Interactive Media Section (Based on Resource Type) */}
                  <div className="w-full rounded-2xl overflow-hidden shadow-md bg-neutral-100 dark:bg-neutral-900">
                    
                    {/* Type 1: Standard Article Main Image */}
                    {selectedItem.type === 'text' && selectedItem.image && (
                      <img 
                        src={selectedItem.image} 
                        alt="Article Cover" 
                        className="w-full h-auto max-h-[380px] object-cover"
                        onError={(e) => { e.target.src = 'https://placehold.co/800x400/eaeaea/999999?text=Cover'; }}
                      />
                    )}

                    {/* Type 2: Interactive Custom Video Player */}
                    {selectedItem.type === 'video' && (
                      <div className="relative aspect-video bg-neutral-950 flex flex-col items-center justify-center text-white">
                        <video 
                          id="reader-video"
                          src={selectedItem.videoUrl} 
                          className="w-full h-full object-cover"
                          controls
                          poster={selectedItem.image}
                        />
                        <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded-full text-xs flex items-center gap-1.5 backdrop-blur-md">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                          <span>超清 4K HDR 视频流</span>
                        </div>
                      </div>
                    )}

                    {/* Type 3: Interactive Podcast/Audio Player Deck */}
                    {selectedItem.type === 'audio' && (
                      <div className="p-6 md:p-8 bg-gradient-to-br from-neutral-900 to-neutral-800 text-white space-y-6">
                        <div className="flex flex-col sm:flex-row items-center gap-6">
                          {/* Rotating Album Art */}
                          <div className={`w-28 h-28 rounded-full overflow-hidden border-4 border-neutral-700 flex-shrink-0 shadow-lg relative ${
                            isPlayingAudio ? 'animate-spin' : ''
                          }`} style={{ animationDuration: '15s' }}>
                            <img src={selectedItem.image} alt="Podcast Cover" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 m-auto w-8 h-8 rounded-full bg-neutral-900 border border-neutral-700"></div>
                          </div>
                          
                          <div className="flex-1 text-center sm:text-left space-y-2">
                            <span className="text-xs uppercase tracking-wider text-emerald-400 font-bold">Spotify Podcaster</span>
                            <h3 className="text-lg font-bold line-clamp-2">{selectedItem.title}</h3>
                            <p className="text-xs text-neutral-400">正在播放访谈：Sam Altman Special</p>
                          </div>
                        </div>

                        {/* Custom Player Controls */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-xs text-neutral-400">
                            <span>05:12</span>
                            <span>{selectedItem.audioDuration}</span>
                          </div>
                          
                          {/* Audio Progress Bar */}
                          <div 
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const clickX = e.clientX - rect.left;
                              const width = rect.width;
                              setAudioProgress(Math.floor((clickX / width) * 100));
                            }}
                            className="h-1.5 bg-neutral-700 rounded-full cursor-pointer relative"
                          >
                            <div 
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${audioProgress}%` }}
                            ></div>
                            <div 
                              className="absolute w-3.5 h-3.5 rounded-full bg-white shadow top-1/2 -translate-y-1/2 transition-all cursor-grab"
                              style={{ left: `calc(${audioProgress}% - 7px)` }}
                            ></div>
                          </div>

                          {/* Control deck */}
                          <div className="flex items-center justify-center gap-6 pt-2">
                            <button className="text-neutral-400 hover:text-white">
                              <span className="text-lg">⏮</span>
                            </button>
                            <button 
                              onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                              className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center text-black font-bold transition-all transform hover:scale-105"
                            >
                              <Icon name={isPlayingAudio ? "pause" : "play"} className="w-6 h-6 text-black" />
                            </button>
                            <button className="text-neutral-400 hover:text-white">
                              <span className="text-lg">⏭</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Type 4: Interactive Photo Gallery Viewer */}
                    {selectedItem.type === 'image' && selectedItem.galleryImages && (
                      <div className="relative bg-neutral-900 flex flex-col">
                        <div className="aspect-video w-full overflow-hidden flex items-center justify-center">
                          <img 
                            src={selectedItem.galleryImages[activeImageIndex]} 
                            alt={`Gallery image ${activeImageIndex}`}
                            className="max-h-[400px] object-contain w-full transition-all duration-300" 
                          />
                        </div>

                        {/* Gallery Thumbnails navigation bar */}
                        <div className="p-3 bg-black/60 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            {selectedItem.galleryImages.map((img, idx) => (
                              <button 
                                key={idx}
                                onClick={() => setActiveImageIndex(idx)}
                                className={`w-12 h-8 rounded-lg overflow-hidden border-2 transition-all ${
                                  activeImageIndex === idx ? 'border-indigo-500 scale-105' : 'border-transparent opacity-60'
                                }`}
                              >
                                <img src={img} className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>

                          <div className="text-xs text-white/80">
                            第 {activeImageIndex + 1} 张 / 共 {selectedItem.galleryImages.length} 张
                          </div>
                        </div>
                      </div>
                    )}

                  </div>

                </div>

                {/* Tags Section */}
                <div className="flex flex-wrap gap-2">
                  {selectedItem.tags.map((tag, idx) => (
                    <span 
                      key={idx} 
                      className="px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer transition-colors"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                {/* Content body */}
                {selectedItem.content ? (
                  <div 
                    className="prose prose-neutral dark:prose-invert max-w-none text-neutral-700 dark:text-neutral-300 mt-6"
                    dangerouslySetInnerHTML={{ __html: selectedItem.content }}
                  />
                ) : (
                  <div className="mt-6 border-t border-dashed dark:border-neutral-800 pt-6 space-y-4">
                    <p className="text-base text-neutral-600 dark:text-neutral-400 leading-relaxed italic">
                      “ {selectedItem.summary} ”
                    </p>
                    <p className="text-sm text-neutral-400">
                      （这是一个带有交互式卡片的媒体项目资源，详情请在上方播放器/视图组件中直接点击交互并体验。）
                    </p>
                  </div>
                )}

              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-neutral-800 flex items-center justify-center mb-4">
                  <Icon name="sparkles" className="w-8 h-8 text-indigo-500" />
                </div>
                <h3 className="text-lg font-bold text-neutral-800 dark:text-white">请在列表中选择一篇文章开始阅读</h3>
                <p className="text-sm text-neutral-400 max-w-sm mt-2">支持文章、视频、播客有声书与图片，全平台自适应，尊享极简。 </p>
              </div>
            )}

          </section>

        </main>

      </div>

      {}
      {showPluginStore && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-lg rounded-3xl p-6 space-y-6 shadow-2xl transition-colors ${
            theme === 'dark' ? 'bg-[#1c1d1f] text-white border border-neutral-800' : 'bg-white text-neutral-900'
          }`}>
            
            <div className="flex items-center justify-between border-b dark:border-neutral-800 pb-4">
              <div className="flex items-center gap-2">
                <Icon name="puzzle" className="w-5 h-5 text-indigo-500" />
                <h3 className="text-lg font-bold">自定义插件/获取端管理器</h3>
              </div>
              <button 
                onClick={() => setShowPluginStore(false)}
                className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full"
              >
                <Icon name="close" className="w-5 h-5" />
              </button>
            </div>

            {/* Currently Installed Plugins */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">已装载获取端插件</h4>
              <div className="space-y-2">
                {myPlugins.filter(p => p.id !== 'all').map(plugin => (
                  <div 
                    key={plugin.id}
                    className="flex items-center justify-between p-3 rounded-xl border dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm text-white ${plugin.color}`}>
                        {plugin.logoText}
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{plugin.name}</div>
                        <div className="text-xs text-neutral-400 line-clamp-1">{plugin.desc}</div>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => handleUninstallPlugin(plugin.id)}
                      className="text-xs text-rose-500 hover:text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                    >
                      卸载
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Store Available Plugins */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">推荐插件库 (一键安装)</h4>
              <div className="space-y-2">
                {PLUGINS_STORE.filter(p => !myPlugins.some(mp => mp.id === p.id)).length === 0 ? (
                  <p className="text-xs text-neutral-400 text-center py-4">🎉 已安装商店内所有可用源插件！</p>
                ) : (
                  PLUGINS_STORE.filter(p => !myPlugins.some(mp => mp.id === p.id)).map(plugin => (
                    <div 
                      key={plugin.id}
                      className="flex items-center justify-between p-3 rounded-xl border dark:border-neutral-800 hover:border-indigo-200 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm text-white ${plugin.color}`}>
                          {plugin.logoText}
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{plugin.name}</div>
                          <div className="text-xs text-neutral-400 line-clamp-1">{plugin.desc}</div>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => handleInstallPlugin(plugin)}
                        className="text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1"
                      >
                        <span>添加</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Plugin customize form input */}
            <div className="border-t dark:border-neutral-800 pt-4">
              <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">或手动导入自定义 RSS / 平台插件</h4>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="https://example.com/feed.xml"
                  className="flex-1 px-3 py-1.5 rounded-xl border text-sm bg-transparent outline-none focus:border-indigo-500 dark:border-neutral-800"
                />
                <button 
                  onClick={() => {
                    const customId = `custom-${Math.random().toString(36).substr(2, 4)}`;
                    handleInstallPlugin({
                      id: customId,
                      name: '自定义 RSS 源',
                      icon: 'text',
                      desc: '自定义外部 RSS 新闻数据源接口',
                      logoText: 'R',
                      color: 'bg-orange-500'
                    });
                  }}
                  className="px-3 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-semibold rounded-xl"
                >
                  导入连接
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}