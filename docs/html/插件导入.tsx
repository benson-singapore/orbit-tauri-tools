import React, { useState, useEffect } from 'react';
import { 
  Rss, 
  Terminal, 
  Layout, 
  Code2, 
  Sparkles, 
  Settings2, 
  Clock, 
  Tag, 
  Check, 
  ChevronRight, 
  Info,
  Layers,
  Save,
  Monitor,
  Eye,
  AlertCircle,
  ArrowRight
} from 'lucide-react';

export default function OrbitPluginImport() {
  // 核心状态
  const [activeSource, setActiveSource] = useState('rss'); // 'rss' | 'script'
  const [viewMode, setViewMode] = useState('form'); // 'form' | 'json'
  
  // 表单数据
  const [formData, setFormData] = useState({
    id: 'techcrunch-rss',
    name: 'TechCrunch',
    version: '1.0.0',
    mediaType: 'article',
    feedUrl: 'https://techcrunch.com/feed/',
    refreshInterval: 3600,
    userAgent: 'OrbitReader/1.0',
    description: 'Startup and Technology News',
    color: 'bg-emerald-500',
    logoText: 'TC',
    category: '科技新闻',
    tag: 'TECH'
  });

  const [jsonText, setJsonText] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  // 同步：Form -> JSON
  useEffect(() => {
    if (viewMode === 'form') {
      const manifest = {
        id: formData.id,
        name: formData.name,
        version: formData.version,
        mediaType: formData.mediaType,
        config: {
          feedUrl: formData.feedUrl,
          refreshInterval: formData.refreshInterval,
          userAgent: formData.userAgent,
        },
        meta: {
          description: formData.description,
          color: formData.color,
          logoText: formData.logoText,
          category: formData.category,
          tag: formData.tag
        }
      };
      setJsonText(JSON.stringify(manifest, null, 2));
    }
  }, [formData, viewMode]);

  // 同步：JSON -> Form (简单实现)
  const handleJsonChange = (val) => {
    setJsonText(val);
    try {
      const p = JSON.parse(val);
      setFormData(prev => ({
        ...prev,
        id: p.id || prev.id,
        name: p.name || prev.name,
        feedUrl: p.config?.feedUrl || prev.feedUrl,
        color: p.meta?.color || prev.color,
        logoText: p.meta?.logoText || prev.logoText,
      }));
    } catch (e) { /* 忽略语法错误直到修正 */ }
  };

  const savePlugin = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="flex w-full h-[720px] bg-[#F8F9FB] font-sans text-[#1E293B] overflow-hidden rounded-[32px] shadow-2xl border border-white">
      
      {/* 左侧：类型分栏 - ORBIT Sidebar Style */}
      <aside className="w-72 bg-white border-r border-slate-100 flex flex-col p-6">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Layers className="text-white w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-800">导入中心</span>
        </div>

        <nav className="flex-1 space-y-2">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">
            选择导入类型
          </div>
          
          <button 
            onClick={() => setActiveSource('rss')}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all ${activeSource === 'rss' ? 'bg-indigo-50 text-indigo-600 shadow-sm shadow-indigo-100/50' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <div className={`p-2 rounded-xl ${activeSource === 'rss' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}>
              <Rss size={18} />
            </div>
            <span className="font-bold text-[15px]">RSS 订阅源</span>
            {activeSource === 'rss' && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500" />}
          </button>

          <button 
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-slate-400 opacity-60 cursor-not-allowed group"
            title="即将到来"
          >
            <div className="p-2 rounded-xl bg-slate-100 group-hover:bg-slate-200 transition-colors">
              <Terminal size={18} />
            </div>
            <span className="font-bold text-[15px]">Script / Scraper</span>
            <span className="ml-auto text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-md font-mono">SOON</span>
          </button>
        </nav>

        <div className="mt-auto p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-2 mb-2 text-indigo-600">
            <Info size={14} />
            <span className="text-xs font-bold uppercase tracking-wider">提示</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            导入的插件将遵循 ORBIT Manifest v1 规范，支持自动排版和全平台同步。
          </p>
        </div>
      </aside>

      {/* 右侧：主工作区 */}
      <main className="flex-1 flex flex-col min-w-0 bg-white m-4 rounded-[24px] shadow-sm overflow-hidden border border-slate-50">
        
        {/* Header: 切换开关 */}
        <header className="px-8 py-5 flex items-center justify-between border-b border-slate-50">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-lg text-slate-800">
              {activeSource === 'rss' ? '配置 RSS 订阅源' : '配置采集器'}
            </h2>
            <div className="flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-emerald-600 font-bold uppercase">实时同步中</span>
            </div>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-[14px]">
            <button 
              onClick={() => setViewMode('form')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-[10px] text-xs font-bold transition-all ${viewMode === 'form' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Layout size={14} /> 可视化配置
            </button>
            <button 
              onClick={() => setViewMode('json')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-[10px] text-xs font-bold transition-all ${viewMode === 'json' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Code2 size={14} /> JSON 编辑
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          
          {viewMode === 'form' ? (
            <div className="max-w-3xl mx-auto space-y-10 animate-fade-in">
              
              {/* 配置部分 */}
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-1 h-4 bg-indigo-600 rounded-full" />
                  <h3 className="font-bold text-sm text-slate-800 tracking-tight">核心配置</h3>
                </div>
                
                <div className="grid grid-cols-1 gap-6">
                  <div className="group">
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">RSS 地址 (Feed URL)</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={formData.feedUrl}
                        onChange={(e) => setFormData({...formData, feedUrl: e.target.value})}
                        className="w-full bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-100 px-4 py-3.5 rounded-2xl text-sm font-medium text-slate-700 transition-all outline-none"
                        placeholder="https://example.com/rss"
                      />
                      <button className="absolute right-3 top-2.5 p-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100 hover:scale-105 transition-all">
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">插件名称</label>
                      <input 
                        type="text" 
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-100 px-4 py-3.5 rounded-2xl text-sm font-medium text-slate-700 transition-all outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">插件 ID</label>
                      <input 
                        type="text" 
                        value={formData.id}
                        className="w-full bg-slate-50 border-2 border-transparent px-4 py-3.5 rounded-2xl text-sm font-mono text-slate-500 outline-none"
                        readOnly
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* 样式展示部分 */}
              <section className="bg-[#F8F9FB] rounded-[32px] p-8 border border-slate-100/50">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-1 h-4 bg-orange-500 rounded-full" />
                  <h3 className="font-bold text-sm text-slate-800 tracking-tight">品牌与展示效果预览</h3>
                </div>

                <div className="flex items-center gap-10">
                  {/* 实机图标预览 */}
                  <div className="flex flex-col items-center gap-4">
                    <div className={`w-20 h-20 ${formData.color} rounded-[24px] flex items-center justify-center text-white text-3xl font-black shadow-2xl shadow-indigo-200/40 border-4 border-white`}>
                      {formData.logoText}
                    </div>
                    <div className="bg-white px-3 py-1 rounded-full shadow-sm border border-slate-100">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Icon Preview</span>
                    </div>
                  </div>

                  {/* 详细样式设置 */}
                  <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-6">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-widest">Logo 文字 (1-2字符)</label>
                      <input 
                        type="text" 
                        maxLength={2}
                        value={formData.logoText}
                        onChange={(e) => setFormData({...formData, logoText: e.target.value})}
                        className="w-full bg-white border border-slate-200 px-4 py-3 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-widest">标识主题色</label>
                      <div className="flex gap-2">
                        {['bg-teal-500', 'bg-indigo-500', 'bg-orange-500', 'bg-rose-500', 'bg-slate-800'].map(c => (
                          <button 
                            key={c}
                            onClick={() => setFormData({...formData, color: c})}
                            className={`w-10 h-10 rounded-xl transition-all ${c} ${formData.color === c ? 'scale-110 ring-4 ring-white shadow-md' : 'hover:scale-105'}`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-widest">排版分类标签</label>
                      <div className="flex gap-3">
                        {['TECH', 'NEWS', 'DESIGN', 'BLOG'].map(t => (
                          <button 
                            key={t}
                            onClick={() => setFormData({...formData, tag: t})}
                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${formData.tag === t ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white text-slate-400 border border-slate-100'}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* 高级选项入口 */}
              <div className="flex items-center justify-between p-6 bg-white border border-slate-100 rounded-[24px] hover:shadow-md transition-all cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-indigo-50 transition-colors">
                    <Settings2 className="text-slate-400 group-hover:text-indigo-500" size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">高级抓取设置</h4>
                    <p className="text-xs text-slate-400">刷新间隔、UA 伪装、Cookie 注入等</p>
                  </div>
                </div>
                <ChevronRight className="text-slate-300" size={20} />
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col animate-fade-in">
              <div className="flex-1 bg-slate-900 rounded-[20px] p-6 font-mono text-sm overflow-hidden relative shadow-inner">
                <div className="absolute top-4 right-4 flex gap-2">
                   <div className="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-500 font-bold uppercase tracking-wider">Manifest Mode</div>
                </div>
                <textarea 
                  value={jsonText}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  className="w-full h-full bg-transparent text-indigo-300 outline-none resize-none custom-scrollbar leading-relaxed"
                  spellCheck="false"
                />
              </div>
              <div className="mt-4 flex items-center gap-3 text-slate-400 px-2">
                <AlertCircle size={14} />
                <span className="text-[11px] font-medium">警告：JSON 编辑模式将直接绕过表单校验，请确保语法正确。</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="px-8 py-6 border-t border-slate-50 bg-white flex items-center justify-between">
          <div className="flex items-center gap-4 text-slate-400 text-xs">
            <div className="flex -space-x-2">
              <div className="w-6 h-6 rounded-full bg-teal-100 border-2 border-white flex items-center justify-center text-[10px] text-teal-600 font-bold">R</div>
              <div className="w-6 h-6 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-[10px] text-indigo-600 font-bold">S</div>
              <div className="w-6 h-6 rounded-full bg-orange-100 border-2 border-white flex items-center justify-center text-[10px] text-orange-600 font-bold">S</div>
            </div>
            <span className="font-medium">已为 ORBIT 阅读器优化</span>
          </div>

          <div className="flex gap-4">
            <button className="px-6 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors">取消</button>
            <button 
              onClick={savePlugin}
              className={`flex items-center gap-2 px-8 py-3 rounded-2xl text-sm font-bold text-white transition-all transform active:scale-95 ${isSaved ? 'bg-emerald-500 shadow-emerald-100' : 'bg-indigo-600 shadow-indigo-100'} shadow-xl`}
            >
              {isSaved ? <Check size={18} /> : <Save size={18} />}
              {isSaved ? '安装成功' : '保存并安装插件'}
            </button>
          </div>
        </footer>
      </main>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out forwards;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E2E8F0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #CBD5E1;
        }
      `}</style>
    </div>
  );
}