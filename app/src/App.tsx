import { useMemo, useState } from "react";
import orbitLogo from "@/assets/logo.png";
import { Icon } from "@/components/Icon";
import { ARTICLES_DATA } from "@/data/articles";
import { INITIAL_PLUGINS } from "@/data/plugins";
import { PluginManagerModal } from "@/components/PluginManagerModal";
import { useTitlebarDrag } from "@/hooks/useTitlebarDrag";
import { useTitlebarEnv } from "@/hooks/useTitlebarEnv";
import { useUiZoom } from "@/hooks/useUiZoom";
import type {
  ActiveTab,
  Article,
  CategoryFilter,
  Plugin,
  ThemeMode,
} from "@/types";

export default function App() {
  useUiZoom();
  useTitlebarEnv();
  const onTitlebarMouseDown = useTitlebarDrag();

  const [theme, setTheme] = useState<ThemeMode>("light");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [layoutSwap, setLayoutSwap] = useState(false);
  const [activePlugin, setActivePlugin] = useState("all");
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [articles, setArticles] = useState<Article[]>(ARTICLES_DATA);
  const [selectedItem, setSelectedItem] = useState<Article | null>(
    ARTICLES_DATA[0] ?? null,
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>("today");

  const [myPlugins, setMyPlugins] = useState<Plugin[]>(INITIAL_PLUGINS);
  const [showPluginStore, setShowPluginStore] = useState(false);

  const [focusMode, setFocusMode] = useState(false);
  const [dimmerMode, setDimmerMode] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

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

  const handleItemSelect = (item: Article) => {
    setSelectedItem(item);
    setAiSummary(null); // Clear previous AI summarizes
    setIsPlayingAudio(false);
    setActiveImageIndex(0);
  };

  const handleBookmarkToggle = (id: number) => {
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

  const handleInstallPlugin = (newPlugin: Plugin) => {
    if (!myPlugins.some(p => p.id === newPlugin.id)) {
      setMyPlugins(prev => [...prev, { ...newPlugin, active: true }]);
    }
  };

  const handleUninstallPlugin = (id: string) => {
    setMyPlugins(prev => prev.filter(p => p.id !== id));
    if (activePlugin === id) {
      setActivePlugin("all");
    }
  };

  const handleTogglePluginActive = (id: string) => {
    setMyPlugins(prev =>
      prev.map(p => (p.id === id ? { ...p, active: p.active === false } : p)),
    );
    if (activePlugin === id) {
      const target = myPlugins.find(p => p.id === id);
      if (target?.active !== false) {
        setActivePlugin("all");
      }
    }
  };

  const handleMovePlugin = (id: string, direction: "up" | "down") => {
    setMyPlugins(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx <= 0) return prev;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx <= 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  const handleImportCustomPlugin = (url: string) => {
    const trimmed = url.trim();
    let displayName = "自定义 RSS 源";
    if (trimmed) {
      try {
        displayName = new URL(trimmed).hostname;
      } catch {
        displayName = "自定义 RSS 源";
      }
    }
    const customId = `custom-${Math.random().toString(36).slice(2, 8)}`;
    handleInstallPlugin({
      id: customId,
      name: displayName,
      icon: "text",
      desc: trimmed || "自定义外部 RSS 新闻数据源",
      logoText: "R",
      color: "bg-orange-500",
      active: true,
      marketCategory: "blog",
      categoryTag: "RSS",
      official: false,
    });
  };

  return (
    <div className={`h-screen flex flex-col font-sans transition-colors duration-300 ${theme === 'dark' ? 'bg-[#121314] text-[#e3e3e3]' : 'bg-[#f8f9fa] text-[#1f1f1f]'}`}>
      
      {}
      <header
        data-tauri-drag-region
        onMouseDown={onTitlebarMouseDown}
        className={`app-titlebar app-titlebar-drag shrink-0 z-40 flex h-12 items-center justify-between border-b px-4 transition-colors duration-300 ${theme === "dark" ? "bg-[#1c1d1f] border-neutral-800" : "bg-white border-neutral-100"}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 select-none pointer-events-none">
          <img
            src={orbitLogo}
            alt=""
            className="h-7 w-7 shrink-0 object-contain"
            draggable={false}
          />
          <span
            className={`text-sm font-bold tracking-tight truncate ${
              theme === "dark" ? "text-white" : "text-black"
            }`}
          >
            ORBIT
          </span>
        </div>

        <div className="flex-1 self-stretch min-w-4" aria-hidden />

        {/* Right Section: Visual Layout Control Actions */}
        <div className="app-titlebar-no-drag flex items-center gap-1 shrink-0">
          {/* Swap Layout Button */}
          <button 
            onClick={() => setLayoutSwap(!layoutSwap)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${
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
            className={`p-1.5 rounded-lg transition-colors duration-200 ${theme === 'dark' ? 'hover:bg-neutral-800 text-yellow-400' : 'hover:bg-neutral-100 text-neutral-600'}`}
            title={theme === 'dark' ? "切换为白昼模式" : "切换为暗夜模式"}
          >
            <Icon name={theme === 'dark' ? "sun" : "moon"} className="w-3.5 h-3.5" />
          </button>

          {/* Plugin Install Quick Button */}
          <button 
            onClick={() => setShowPluginStore(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            <Icon name="puzzle" className="w-3.5 h-3.5 text-white" />
            <span className="hidden sm:inline">安装/管理插件</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden relative">
        
        {}
        <aside className={`h-full flex flex-col justify-between border-r transition-all duration-300 ${
          theme === 'dark' ? 'bg-[#1c1d1f] border-neutral-800' : 'bg-white border-neutral-100'
        } ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
          
          <div className="flex-1 py-3 overflow-y-auto no-scrollbar">
            
            {/* Sidebar collapse toggle */}
            <div
              className={`mb-1 pb-1 border-b ${theme === "dark" ? "border-neutral-800" : "border-neutral-100"} ${isSidebarCollapsed ? "px-0" : "px-3"}`}
            >
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className={`w-full flex items-center py-1 rounded-lg text-xs transition-all duration-200 ${
                  isSidebarCollapsed ? "justify-center px-0" : "gap-2 px-2"
                } ${
                  theme === "dark"
                    ? "text-neutral-400 hover:bg-neutral-800/50"
                    : "text-neutral-500 hover:bg-neutral-50"
                }`}
                title={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
              >
                <Icon
                  name={isSidebarCollapsed ? "expand" : "collapse"}
                  className="w-3.5 h-3.5 shrink-0"
                />
                {!isSidebarCollapsed && (
                  <span className="font-medium">收起侧栏</span>
                )}
              </button>
            </div>

            {/* Top Navigation Items (Today, Bookmarks, Trending) */}
            <div className={`space-y-1 ${isSidebarCollapsed ? "px-0" : "px-3"}`}>
              <div className={`text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2 px-3 ${isSidebarCollapsed ? 'hidden' : 'block'}`}>
                视图大盘
              </div>

              <button 
                onClick={() => { setActiveTab('today'); setActivePlugin('all'); }}
                className={`w-full flex items-center py-2.5 rounded-xl text-sm transition-all duration-200 ${
                  isSidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
                } ${
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
                className={`w-full flex items-center py-2.5 rounded-xl text-sm transition-all duration-200 ${
                  isSidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
                } ${
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
                className={`w-full flex items-center py-2.5 rounded-xl text-sm transition-all duration-200 ${
                  isSidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
                } ${
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
            <div className={`mt-6 space-y-1 ${isSidebarCollapsed ? "px-0" : "px-3"}`}>
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

              {myPlugins
                .filter(p => p.id === "all" || p.active !== false)
                .map(plugin => (
                <button 
                  key={plugin.id}
                  onClick={() => {
                    setActivePlugin(plugin.id);
                    setActiveTab('all');
                  }}
                  className={`w-full flex items-center py-2.5 rounded-xl text-sm transition-all duration-200 ${
                    isSidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
                  } ${
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
                      {plugin.id !== "all" && plugin.active !== false && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>

          </div>

          {/* Bottom App Footer */}
          <div className={`border-t dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/20 ${isSidebarCollapsed ? "p-2" : "p-3"}`}>
            <button 
              onClick={() => setShowPluginStore(true)}
              className={`w-full flex items-center justify-center rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-semibold transition-all ${
                isSidebarCollapsed ? "p-2" : "gap-2 py-2 px-3"
              }`}
            >
              <Icon name="puzzle" className="w-4 h-4" />
              {!isSidebarCollapsed && <span>添加/自定新插件</span>}
            </button>
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
                {(
                  [
                    { id: "all", label: "全部" },
                    { id: "text", label: "资讯" },
                    { id: "video", label: "视频" },
                    { id: "audio", label: "音频" },
                    { id: "image", label: "图片" },
                  ] as const satisfies ReadonlyArray<{
                    id: CategoryFilter;
                    label: string;
                  }>
                ).map((cat) => (
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
                              onError={(e) => {
                                e.currentTarget.src =
                                  "https://placehold.co/100x100/eaeaea/999999?text=Cover";
                              }}
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
              <div className="max-w-3xl mx-auto px-6 pb-8 md:pb-10">
                {/* Reader toolbar — sticky near top */}
                <div
                  className={`sticky top-0 z-10 -mx-6 px-6 pt-2 pb-2 ${theme === "dark" ? "bg-[#121314]" : "bg-[#fafafa]"}`}
                >
                  <div
                    className={`rounded-xl border transition-all duration-200 ${
                      theme === "dark"
                        ? "bg-[#1c1d1f] border-neutral-800"
                        : "bg-white border-neutral-100"
                    } shadow-sm`}
                  >
                    <div className="flex items-center gap-2 p-2.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400 px-2 py-1 rounded-lg shrink-0">
                          {selectedItem.pluginName}
                        </span>
                        <span className="text-xs text-neutral-400 truncate">
                          由 {selectedItem.author} 撰写
                        </span>
                      </div>

                      <div className="flex items-center justify-end gap-1 shrink-0 ml-auto">
                        <button
                          onClick={() => setFocusMode(!focusMode)}
                          className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all ${
                            focusMode
                              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                              : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
                          }`}
                          title={focusMode ? "退出专注模式" : "开启专注模式"}
                        >
                          <Icon name="focus" className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">
                            {focusMode ? "退出专注" : "专注模式"}
                          </span>
                        </button>

                        <button
                          onClick={() => setDimmerMode(!dimmerMode)}
                          className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all ${
                            dimmerMode
                              ? "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-400"
                              : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
                          }`}
                          title="微光高亮阅读护眼模式"
                        >
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                          <span className="hidden sm:inline">微光高亮</span>
                        </button>

                        <button
                          onClick={() => handleBookmarkToggle(selectedItem.id)}
                          className={`p-1.5 rounded-lg transition-all ${
                            selectedItem.isBookmarked
                              ? "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
                              : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
                          }`}
                          title="加入收藏"
                        >
                          <Icon
                            name="bookmark"
                            className="w-3.5 h-3.5"
                            active={selectedItem.isBookmarked}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
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
                        onError={(e) => {
                          e.currentTarget.src =
                            "https://placehold.co/800x400/eaeaea/999999?text=Cover";
                        }}
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
        <PluginManagerModal
          theme={theme}
          myPlugins={myPlugins}
          onClose={() => setShowPluginStore(false)}
          onInstall={handleInstallPlugin}
          onUninstall={handleUninstallPlugin}
          onToggleActive={handleTogglePluginActive}
          onMove={handleMovePlugin}
          onImport={handleImportCustomPlugin}
        />
      )}

    </div>
  );
}