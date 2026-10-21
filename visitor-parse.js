/* 访客信息中文智能解析（纯前端本地解析，不向任何第三方发送数据）。
   用法：
     VisitorParse.render(visitor)  -> HTML 字符串（给 diag 面板用）
     VisitorParse.analyze(visitor) -> 结构化结果（便于调试/扩展）

   设计原则（重要）：
   - 只做「本地字符串解析 + 内置资料表」，不请求第三方、不调用 AI。
   - 识别不了的一律写「暂无法确定」并保留原始值，绝不臆造型号/硬件参数。
   - 每个字段标注可信度：confirmed(已确认) / inferred(合理推断) / unknown(暂无法确定)。
*/
(function () {
  'use strict';

  /* ══════════════ 资料表 ══════════════ */

  // 国家/地区代码 → 中文（一个中国表述：TW/HK/MO 均为中国的一部分）
  var COUNTRY = {
    CN:'中国大陆', TW:'中国台湾地区', HK:'中国香港', MO:'中国澳门',
    US:'美国', JP:'日本', KR:'韩国', SG:'新加坡', MY:'马来西亚', TH:'泰国', VN:'越南',
    PH:'菲律宾', ID:'印度尼西亚', IN:'印度', PK:'巴基斯坦', BD:'孟加拉国', LK:'斯里兰卡',
    AU:'澳大利亚', NZ:'新西兰', CA:'加拿大', GB:'英国', IE:'爱尔兰', FR:'法国', DE:'德国',
    NL:'荷兰', BE:'比利时', LU:'卢森堡', CH:'瑞士', AT:'奥地利', IT:'意大利', ES:'西班牙',
    PT:'葡萄牙', SE:'瑞典', NO:'挪威', DK:'丹麦', FI:'芬兰', PL:'波兰', CZ:'捷克', SK:'斯洛伐克',
    HU:'匈牙利', RO:'罗马尼亚', BG:'保加利亚', GR:'希腊', TR:'土耳其', RU:'俄罗斯', UA:'乌克兰',
    BY:'白俄罗斯', KZ:'哈萨克斯坦', IL:'以色列', SA:'沙特阿拉伯', AE:'阿联酋', QA:'卡塔尔',
    KW:'科威特', EG:'埃及', ZA:'南非', NG:'尼日利亚', KE:'肯尼亚', MA:'摩洛哥', BR:'巴西',
    AR:'阿根廷', CL:'智利', CO:'哥伦比亚', PE:'秘鲁', MX:'墨西哥', VE:'委内瑞拉', EC:'厄瓜多尔',
    UY:'乌拉圭', PY:'巴拉圭', CR:'哥斯达黎加', PA:'巴拿马', DO:'多米尼加', CU:'古巴',
    IR:'伊朗', IQ:'伊拉克', JO:'约旦', LB:'黎巴嫩', SY:'叙利亚', AF:'阿富汗', NP:'尼泊尔',
    MM:'缅甸', KH:'柬埔寨', LA:'老挝', BN:'文莱', MN:'蒙古', GE:'格鲁吉亚', AM:'亚美尼亚',
    AZ:'阿塞拜疆', UZ:'乌兹别克斯坦', KG:'吉尔吉斯斯坦', TJ:'塔吉克斯坦', TM:'土库曼斯坦'
  };

  // 常见城市英文 → 中文（Cloudflare 返回的是英文城市名）
  var CITY = {
    'taichung':'台中市','taipei':'台北市','kaohsiung':'高雄市','tainan':'台南市','hsinchu':'新竹市',
    'taoyuan':'桃园市','keelung':'基隆市','chiayi':'嘉义市','changhua':'彰化市',
    'hong kong':'中国香港','macau':'中国澳门','macao':'中国澳门',
    'beijing':'北京市','shanghai':'上海市','guangzhou':'广州市','shenzhen':'深圳市','hangzhou':'杭州市',
    'chengdu':'成都市','wuhan':'武汉市','nanjing':'南京市','xian':'西安市','chongqing':'重庆市',
    'tianjin':'天津市','suzhou':'苏州市','qingdao':'青岛市','dalian':'大连市','xiamen':'厦门市',
    'tokyo':'东京','osaka':'大阪','kyoto':'京都','seoul':'首尔','busan':'釜山',
    'singapore':'新加坡','kuala lumpur':'吉隆坡','bangkok':'曼谷','hanoi':'河内','ho chi minh city':'胡志明市',
    'manila':'马尼拉','jakarta':'雅加达','mumbai':'孟买','new delhi':'新德里','delhi':'德里',
    'sydney':'悉尼','melbourne':'墨尔本','auckland':'奥克兰',
    'london':'伦敦','manchester':'曼彻斯特','paris':'巴黎','berlin':'柏林','munich':'慕尼黑',
    'amsterdam':'阿姆斯特丹','brussels':'布鲁塞尔','zurich':'苏黎世','vienna':'维也纳','rome':'罗马',
    'milan':'米兰','madrid':'马德里','barcelona':'巴塞罗那','lisbon':'里斯本','stockholm':'斯德哥尔摩',
    'oslo':'奥斯陆','copenhagen':'哥本哈根','helsinki':'赫尔辛基','warsaw':'华沙','prague':'布拉格',
    'moscow':'莫斯科','kyiv':'基辅','kiev':'基辅','istanbul':'伊斯坦布尔',
    'new york':'纽约','los angeles':'洛杉矶','san francisco':'旧金山','seattle':'西雅图','chicago':'芝加哥',
    'boston':'波士顿','washington':'华盛顿','miami':'迈阿密','dallas':'达拉斯','houston':'休斯敦',
    'toronto':'多伦多','vancouver':'温哥华','montreal':'蒙特利尔',
    'sao paulo':'圣保罗','rio de janeiro':'里约热内卢','buenos aires':'布宜诺斯艾利斯',
    'mexico city':'墨西哥城','lima':'利马','bogota':'波哥大','santiago':'圣地亚哥',
    'dubai':'迪拜','abu dhabi':'阿布扎比','riyadh':'利雅得','tel aviv':'特拉维夫',
    'cairo':'开罗','johannesburg':'约翰内斯堡','cape town':'开普敦','nairobi':'内罗毕'
  };

  // 语言代码 → 中文
  var LANG = {
    'zh':'中文','zh-cn':'简体中文','zh-tw':'繁体中文','zh-hk':'繁体中文（香港）','zh-hant':'繁体中文','zh-hans':'简体中文',
    'en':'英语','en-us':'英语（美国）','en-gb':'英语（英国）','ja':'日语','ko':'韩语','fr':'法语','de':'德语',
    'es':'西班牙语','pt':'葡萄牙语','ru':'俄语','it':'意大利语','nl':'荷兰语','pl':'波兰语','tr':'土耳其语',
    'th':'泰语','vi':'越南语','id':'印度尼西亚语','ms':'马来语','ar':'阿拉伯语','hi':'印地语','he':'希伯来语',
    'sv':'瑞典语','da':'丹麦语','fi':'芬兰语','no':'挪威语','cs':'捷克语','el':'希腊语','uk':'乌克兰语',
    'ro':'罗马尼亚语','hu':'匈牙利语','bg':'保加利亚语','fa':'波斯语','bn':'孟加拉语','ta':'泰米尔语'
  };

  // 地区代码 → 中文（用于语言区域，如 zh_TW 的 TW）
  var REGION = {
    CN:'中国大陆', TW:'中国台湾地区', HK:'中国香港', MO:'中国澳门',
    US:'美国', GB:'英国', JP:'日本', KR:'韩国', SG:'新加坡', MY:'马来西亚', TH:'泰国', VN:'越南',
    PH:'菲律宾', ID:'印度尼西亚', IN:'印度', AU:'澳大利亚', NZ:'新西兰', CA:'加拿大',
    FR:'法国', DE:'德国', NL:'荷兰', BE:'比利时', CH:'瑞士', AT:'奥地利', IT:'意大利', ES:'西班牙',
    PT:'葡萄牙', SE:'瑞典', NO:'挪威', DK:'丹麦', FI:'芬兰', PL:'波兰', CZ:'捷克', RU:'俄罗斯',
    UA:'乌克兰', TR:'土耳其', IL:'以色列', SA:'沙特阿拉伯', AE:'阿联酋', EG:'埃及', ZA:'南非',
    BR:'巴西', AR:'阿根廷', CL:'智利', CO:'哥伦比亚', PE:'秘鲁', MX:'墨西哥'
  };

  // 应用（内置浏览器）识别
  var APPS = [
    { re:/\bInstagram\b(?:\s+([\d.]+))?/i, name:'Instagram', cn:'Instagram', vendor:'Meta' },
    { re:/\bFBAN\/\S+/i, name:'Facebook', cn:'Facebook', vendor:'Meta' },
    { re:/\bFBAV\/([\d.]+)/i, name:'Facebook', cn:'Facebook', vendor:'Meta' },
    { re:/\bMicroMessenger\/([\d.]+)/i, name:'WeChat', cn:'微信', vendor:'腾讯' },
    { re:/\bQQ\/([\d.]+)/i, name:'QQ', cn:'QQ', vendor:'腾讯' },
    { re:/\bQQBrowser\/([\d.]+)/i, name:'QQBrowser', cn:'QQ 浏览器', vendor:'腾讯' },
    { re:/\bMQQBrowser\/([\d.]+)/i, name:'MQQBrowser', cn:'QQ 浏览器', vendor:'腾讯' },
    { re:/\bWeibo\b(?:\/([\d.]+))?/i, name:'Weibo', cn:'微博', vendor:'新浪' },
    { re:/\bTikTok\b(?:\s*([\d.]+))?/i, name:'TikTok', cn:'TikTok（抖音国际版）', vendor:'字节跳动' },
    { re:/\bmusical_ly\b(?:\s*([\d.]+))?/i, name:'TikTok', cn:'TikTok（抖音国际版）', vendor:'字节跳动' },
    { re:/\bBytedanceWebview\b/i, name:'ByteDance WebView', cn:'字节跳动内置浏览器', vendor:'字节跳动' },
    { re:/\bTwitter\b(?:\s+for\s+\w+)?(?:\s*([\d.]+))?/i, name:'X (Twitter)', cn:'X（原 Twitter）', vendor:'X Corp.' },
    { re:/\bLine\/([\d.]+)/i, name:'LINE', cn:'LINE', vendor:'LINE' },
    { re:/\bSnapchat\b(?:\s*([\d.]+))?/i, name:'Snapchat', cn:'Snapchat', vendor:'Snap' },
    { re:/\bPinterest\b(?:\s*([\d.]+))?/i, name:'Pinterest', cn:'Pinterest', vendor:'Pinterest' },
    { re:/\bLinkedInApp\b(?:\s*([\d.]+))?/i, name:'LinkedIn', cn:'领英', vendor:'Microsoft' },
    { re:/\bReddit\b(?:\s*([\d.]+))?/i, name:'Reddit', cn:'Reddit', vendor:'Reddit' },
    { re:/\bWhatsApp\/([\d.]+)/i, name:'WhatsApp', cn:'WhatsApp', vendor:'Meta' },
    { re:/\bTelegram\b(?:\s*([\d.]+))?/i, name:'Telegram', cn:'Telegram', vendor:'Telegram' },
    { re:/\bGSA\/([\d.]+)/i, name:'Google App', cn:'Google 应用', vendor:'Google' },
    { re:/\bDuckDuckGo\/([\d.]+)/i, name:'DuckDuckGo', cn:'DuckDuckGo', vendor:'DuckDuckGo' }
  ];

  // GPU 渲染器 → 平台说明（只列常见、可确定的）
  var GPUS = [
    { re:/Adreno\s*\(?TM\)?\s*(\d{3})/i, name:function(m){ return 'Adreno ' + m[1]; }, vendor:'Qualcomm（高通）', note:'高通骁龙 SoC 内置的 GPU 系列' },
    { re:/Mali[- ]?G(\d{2,3})/i, name:function(m){ return 'Mali-G' + m[1]; }, vendor:'Arm', note:'Arm Mali 系列 GPU，常见于联发科天玑 / 三星 Exynos 等 SoC' },
    { re:/Apple\s*GPU/i, name:function(){ return 'Apple GPU'; }, vendor:'Apple', note:'苹果自研 GPU（A 系列 / M 系列芯片内置）' },
    { re:/PowerVR/i, name:function(){ return 'PowerVR'; }, vendor:'Imagination', note:'Imagination PowerVR GPU' },
    { re:/Xclipse\s*(\d+)/i, name:function(m){ return 'Xclipse ' + m[1]; }, vendor:'Samsung / AMD', note:'三星与 AMD RDNA 合作的 GPU' },
    { re:/NVIDIA|GeForce|RTX|GTX/i, name:function(){ return 'NVIDIA 显卡'; }, vendor:'NVIDIA', note:'桌面/笔记本独立显卡（WebGL 报告的型号）' },
    { re:/Intel|Iris|UHD Graphics/i, name:function(){ return 'Intel 核显'; }, vendor:'Intel', note:'Intel 集成显卡' },
    { re:/AMD|Radeon/i, name:function(){ return 'AMD Radeon'; }, vendor:'AMD', note:'AMD 显卡' }
  ];

  // 机型资料库：只收录可靠确认的机型；未收录一律「暂无法确定」，不猜。
  var DEVICES = {
    '25113PN0EG': { brand:'Xiaomi', brandCn:'小米', product:'Xiaomi 17', productCn:'小米 17（国际版）', codename:'pudding', soc:'高通 SM8850（骁龙 8 Elite Gen 5）', os:'Android 16', region:'国际版（Global）', src:'PhoneDB / Geekbench / EEC 认证资料' },
    '25113PN0EC': { brand:'Xiaomi', brandCn:'小米', product:'Xiaomi 17', productCn:'小米 17（国行）', codename:'pudding', soc:'高通 SM8850（骁龙 8 Elite Gen 5）', os:'Android 16', region:'国行（中国大陆）', src:'认证资料' },
    '25113PN0EI': { brand:'Xiaomi', brandCn:'小米', product:'Xiaomi 17', productCn:'小米 17（印度版）', codename:'pudding', soc:'高通 SM8850（骁龙 8 Elite Gen 5）', os:'Android 16', region:'印度版', src:'认证资料' },
    'SM-S918B': { brand:'Samsung', brandCn:'三星', product:'Galaxy S23 Ultra', productCn:'三星 Galaxy S23 Ultra', region:'国际版', src:'机型资料库' },
    'SM-S911B': { brand:'Samsung', brandCn:'三星', product:'Galaxy S23', productCn:'三星 Galaxy S23', region:'国际版', src:'机型资料库' },
    'SM-S928B': { brand:'Samsung', brandCn:'三星', product:'Galaxy S24 Ultra', productCn:'三星 Galaxy S24 Ultra', region:'国际版', src:'机型资料库' },
    'SM-S921B': { brand:'Samsung', brandCn:'三星', product:'Galaxy S24', productCn:'三星 Galaxy S24', region:'国际版', src:'机型资料库' },
    'SM-S938B': { brand:'Samsung', brandCn:'三星', product:'Galaxy S25 Ultra', productCn:'三星 Galaxy S25 Ultra', region:'国际版', src:'机型资料库' },
    'SM-S931B': { brand:'Samsung', brandCn:'三星', product:'Galaxy S25', productCn:'三星 Galaxy S25', region:'国际版', src:'机型资料库' }
  };

  var XIAOMI_REGION = { G:'国际版（Global）', C:'国行（中国大陆）', I:'印度版' };
  var HW_VENDOR = {
    qcom:'高通（Qualcomm）', mtk:'联发科（MediaTek）', mediatek:'联发科（MediaTek）',
    exynos:'三星（Samsung Exynos）', kirin:'华为海思（HiSilicon Kirin）', hisilicon:'华为海思（HiSilicon Kirin）',
    unisoc:'紫光展锐（UNISOC）', spreadtrum:'紫光展锐（UNISOC）'
  };

  // Android API Level → 版本
  var API_VER = {
    21:'5.0', 22:'5.1', 23:'6.0', 24:'7.0', 25:'7.1', 26:'8.0', 27:'8.1', 28:'9',
    29:'10', 30:'11', 31:'12', 32:'12L', 33:'13', 34:'14', 35:'15', 36:'16'
  };

  var BRAND_CN = {
    xiaomi:'小米', redmi:'红米', poco:'POCO', samsung:'三星', apple:'苹果', huawei:'华为', honor:'荣耀',
    oppo:'OPPO', vivo:'vivo', oneplus:'一加', realme:'realme', google:'谷歌', sony:'索尼', lg:'LG',
    motorola:'摩托罗拉', nokia:'诺基亚', lenovo:'联想', zte:'中兴', meizu:'魅族', nubia:'努比亚',
    asus:'华硕', acer:'宏碁', dell:'戴尔', hp:'惠普', microsoft:'微软', amazon:'亚马逊'
  };

  /* ══════════════ 工具 ══════════════ */

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function trim(s){ return String(s || '').trim(); }
  function pad2(n){ return n < 10 ? '0' + n : '' + n; }
  function tzName(){
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || '本机时区'; } catch(e){ return '本机时区'; }
  }
  function fmtTime(ts){
    if (!ts) return '—';
    try {
      var d = new Date(ts);
      return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()) +
             ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    } catch(e){ return String(ts); }
  }
  function relTime(ts){
    if (!ts) return '—';
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 0) return '刚刚';
    if (s < 60) return s + ' 秒前';
    if (s < 3600) return Math.floor(s/60) + ' 分钟前';
    if (s < 86400) return Math.floor(s/3600) + ' 小时前';
    if (s < 86400*30) return Math.floor(s/86400) + ' 天前';
    if (s < 86400*365) return Math.floor(s/(86400*30)) + ' 个月前';
    return Math.floor(s/(86400*365)) + ' 年前';
  }
  function cityCn(name){
    if (!name) return '';
    var k = String(name).toLowerCase();
    return CITY[k] || name;
  }
  function countryCn(code){
    if (!code) return '';
    var k = String(code).toUpperCase();
    return COUNTRY[k] || code;
  }
  function langCn(tag){
    if (!tag) return '';
    var k = String(tag).toLowerCase().replace('_', '-');
    if (LANG[k]) return LANG[k];
    var base = k.split('-')[0];
    return LANG[base] || tag;
  }
  function regionCn(code){
    if (!code) return '';
    var k = String(code).toUpperCase();
    return REGION[k] || code;
  }

  /* ══════════════ UA 解析 ══════════════ */

  function parseUA(ua){
    var out = {
      raw: ua || '',
      os: '', osName: '', osVersion: '', api: '',
      brand: '', brandCn: '', model: '', codename: '', hardware: '',
      browser: '', browserVer: '', engine: '', webview: false,
      app: '', appCn: '', appVer: '', appVendor: '',
      resolution: '', dpi: '', locale: '', apiVer: '',
      buildId: '', deviceBlock: null, conflicts: [], netType: ''
    };
    if (!ua) return out;

    var s = String(ua);

    // ---- 平台块：第一个括号 ----
    var pm = s.match(/\(([^)]*)\)/);
    var platform = pm ? pm[1] : '';

    // ---- 操作系统 ----
    var m;
    if ((m = s.match(/Android\s+([\d.]+)/i))) {
      out.os = 'Android'; out.osName = 'Android'; out.osVersion = m[1];
    } else if ((m = s.match(/iPhone OS\s+([\d_]+)/i))) {
      out.os = 'iOS'; out.osName = 'iOS'; out.osVersion = m[1].replace(/_/g, '.');
    } else if ((m = s.match(/iPad; CPU OS\s+([\d_]+)/i))) {
      out.os = 'iPadOS'; out.osName = 'iPadOS'; out.osVersion = m[1].replace(/_/g, '.');
    } else if ((m = s.match(/Windows NT\s+([\d.]+)/i))) {
      out.os = 'Windows'; out.osName = 'Windows';
      var nt = { '10.0':'10 / 11', '6.3':'8.1', '6.2':'8', '6.1':'7', '6.0':'Vista' };
      out.osVersion = nt[m[1]] || m[1];
    } else if ((m = s.match(/Mac OS X\s+([\d_]+)/i))) {
      out.os = 'macOS'; out.osName = 'macOS'; out.osVersion = m[1].replace(/_/g, '.');
    } else if (/CrOS/.test(s)) {
      out.os = 'ChromeOS'; out.osName = 'ChromeOS';
    } else if (/Linux/.test(s)) {
      out.os = 'Linux'; out.osName = 'Linux';
    }

    // ---- 机型（平台块里 "MODEL Build/ID" 或 "品牌 型号"）----
    var modelFromPlatform = '';
    if (platform) {
      var segs = platform.split(';').map(trim);
      for (var i = 0; i < segs.length; i++) {
        var seg = segs[i];
        var bm = seg.match(/^(.*?)\s+Build\/(.+)$/i);
        if (bm) { modelFromPlatform = trim(bm[1]); out.buildId = trim(bm[2]); break; }
      }
      // 去掉品牌前缀（如 "K; Pixel 7" 之类）
      if (!modelFromPlatform) {
        // 常见：Android X; MODEL; ... → 取第三段
        if (segs.length >= 3 && /Android/i.test(segs[1])) modelFromPlatform = segs[2] || '';
      }
      // WebView 标记
      if (/\bwv\b/.test(platform) || /\bwv\b/i.test(s)) out.webview = true;
    }

    // ---- App 内置设备块：Android (33/13; 420dpi; 1080x2400; Xiaomi; 25113PN0EG; pudding; qcom; zh_TW; ...) ----
    var dm = s.match(/Android\s*\(([^)]*)\)/i);
    if (dm) {
      var parts = dm[1].split(';').map(trim);
      out.deviceBlock = parts;
      // 位置解析（Instagram/TikTok 等通用格式）
      var looksPos = parts.length >= 6 && /dpi$/i.test(parts[1] || '') && /^\d{3,4}x\d{3,4}$/.test(parts[2] || '');
      if (looksPos) {
        out.apiVer = parts[0] || '';
        out.dpi = parts[1] || '';
        out.resolution = parts[2] || '';
        out.brand = parts[3] || '';
        out.model = parts[4] || '';
        out.codename = parts[5] || '';
        out.hardware = parts[6] || '';
        out.locale = parts[7] || '';
      } else {
        // 回退：逐段模式匹配
        parts.forEach(function(p){
          if (/^\d{2,4}dpi$/i.test(p)) out.dpi = p;
          else if (/^\d{3,4}x\d{3,4}$/.test(p)) out.resolution = p;
          else if (/^[a-z]{2}[_-][A-Z]{2}$/.test(p)) out.locale = p;
          else if (/^\d+\/\d+(\.\d+)?$/.test(p)) out.apiVer = p;
          else if (HW_VENDOR[p.toLowerCase()]) out.hardware = p;
        });
      }
    }

    // ---- API / 版本（外层的 Android X 与内层 API 可能冲突，如实记录）----
    if (out.apiVer) {
      var av = out.apiVer.split('/');
      var apiNum = parseInt(av[0], 10);
      if (API_VER[apiNum]) out.api = 'API ' + apiNum + '（Android ' + API_VER[apiNum] + '）';
      var innerVer = av[1] || '';
      if (innerVer && out.osVersion && innerVer !== out.osVersion) {
        out.conflicts.push('外层 UA 标注 Android ' + out.osVersion + '，而 App 内置块标注 ' + out.apiVer + '（API ' + av[0] + ' / Android ' + innerVer + '），两者不一致');
      }
    }

    // ---- 品牌 / 型号补全 ----
    if (!out.model && modelFromPlatform) out.model = modelFromPlatform;
    if (out.brand) out.brandCn = BRAND_CN[out.brand.toLowerCase()] || out.brand;
    // 型号里常含品牌前缀
    if (out.model) {
      var mm = out.model.match(/^(Xiaomi|Redmi|POCO|Samsung|HUAWEI|HONOR|OPPO|vivo|OnePlus|realme|Google|Sony|LG|motorola|Nokia|Lenovo|ZTE|Meizu|nubia|ASUS)\b/i);
      if (mm && !out.brand) { out.brand = mm[1]; out.brandCn = BRAND_CN[mm[1].toLowerCase()] || mm[1]; }
    }
    // Apple：iOS UA 不含具体机型代码，但可确定品牌
    if (!out.brand && /iPhone|iPad|iPod/.test(s)) { out.brand = 'Apple'; out.brandCn = '苹果'; }

    // ---- 浏览器 / 内核 ----
    var bm2;
    if (/^(curl|wget|python-requests|python-urllib|Go-http-client|okhttp|java|axios|libwww|httpie)\//i.test(s)) {
      out.browser = '命令行 / 程序请求工具'; out.browserVer = (s.match(/^([\w.-]+\/[\d.]+)/) || [])[1] || '';
    }
    else if ((bm2 = s.match(/Edg(?:e|A|iOS)?\/([\d.]+)/))) { out.browser = 'Edge'; out.browserVer = bm2[1]; }
    else if ((bm2 = s.match(/OPR\/([\d.]+)/))) { out.browser = 'Opera'; out.browserVer = bm2[1]; }
    else if ((bm2 = s.match(/SamsungBrowser\/([\d.]+)/))) { out.browser = 'Samsung Internet'; out.browserVer = bm2[1]; }
    else if ((bm2 = s.match(/UCBrowser\/([\d.]+)/))) { out.browser = 'UC 浏览器'; out.browserVer = bm2[1]; }
    else if ((bm2 = s.match(/MQQBrowser\/([\d.]+)/))) { out.browser = 'QQ 浏览器'; out.browserVer = bm2[1]; }
    else if ((bm2 = s.match(/Firefox\/([\d.]+)/))) { out.browser = 'Firefox'; out.browserVer = bm2[1]; }
    else if ((bm2 = s.match(/CriOS\/([\d.]+)/))) { out.browser = 'Chrome (iOS)'; out.browserVer = bm2[1]; }
    else if ((bm2 = s.match(/FxiOS\/([\d.]+)/))) { out.browser = 'Firefox (iOS)'; out.browserVer = bm2[1]; }
    else if ((bm2 = s.match(/Chrome\/([\d.]+)/))) {
      out.browser = out.webview ? 'Android WebView（Chrome 内核）' : 'Chrome';
      out.browserVer = bm2[1];
    }
    else if ((bm2 = s.match(/Version\/([\d.]+).*Safari\//))) { out.browser = 'Safari'; out.browserVer = bm2[1]; }
    else if ((bm2 = s.match(/Safari\/([\d.]+)/))) { out.browser = 'Safari'; out.browserVer = bm2[1]; }

    if (/AppleWebKit/.test(s)) {
      out.engine = /Chrome\/|CriOS\/|Edg\/|OPR\//.test(s) ? 'Blink（Chromium 内核）' : 'WebKit';
    } else if (/Gecko\//.test(s) && !/like Gecko/i.test(s)) {
      out.engine = 'Gecko（Firefox 内核）';
    } else if (/Trident\//.test(s)) {
      out.engine = 'Trident（旧版 IE 内核）';
    }

    // ---- 访问 App ----
    for (var a = 0; a < APPS.length; a++) {
      var ap = APPS[a];
      var am = s.match(ap.re);
      if (am) {
        out.app = ap.name; out.appCn = ap.cn; out.appVendor = ap.vendor;
        if (am[1]) out.appVer = am[1];
        break;
      }
    }

    // ---- 语言地区 ----
    if (!out.locale) {
      var lm = s.match(/\b([a-z]{2})[_-]([A-Z]{2})\b/);
      if (lm) out.locale = lm[1] + '_' + lm[2];
    }

    // ---- UA 自报网络类型（微信等 App 会带 NetType/WIFI）----
    var nt = s.match(/NetType\/(WIFI|5G|4G|3G|2G)/i);
    if (nt) out.netType = nt[1].toUpperCase();

    // ---- 分辨率 / DPI（若 App 块没有，再兜底扫一遍）----
    if (!out.resolution) {
      var rm = s.match(/\b(\d{3,4})x(\d{3,4})\b/);
      if (rm) out.resolution = rm[1] + 'x' + rm[2];
    }
    if (!out.dpi) {
      var dpiM = s.match(/\b(\d{2,4})dpi\b/i);
      if (dpiM) out.dpi = dpiM[1] + 'dpi';
    }

    // 桌面 / 移动判断
    out.mobile = /Mobile|Android|iPhone|iPad|iPod/.test(s) && !/Windows NT|Macintosh|X11/.test(s);

    return out;
  }

  /* ══════════════ IP 解析 ══════════════ */

  function parseIP(ip){
    var r = { raw: ip || '—', version: 0, scope: 'unknown', scopeCn: '暂无法确定', note: '' };
    if (!ip || ip === '—' || ip === 'unknown') { r.note = '该记录未保存 IP'; return r; }

    var s = String(ip).trim();
    if (s.indexOf(':') >= 0) {
      r.version = 6;
      var low = s.toLowerCase();
      if (low === '::1') { r.scope = 'loopback'; r.scopeCn = '本机回环地址（::1）'; }
      else if (low === '::') { r.scope = 'reserved'; r.scopeCn = '未指定地址（::）'; }
      else if (/^f[cd][0-9a-f]{2}:/.test(low)) { r.scope = 'private'; r.scopeCn = '私有地址（IPv6 ULA，fc00::/7）'; }
      else if (/^fe[89ab][0-9a-f]:/.test(low)) { r.scope = 'linklocal'; r.scopeCn = '链路本地地址（fe80::/10）'; }
      else if (/^ff[0-9a-f]{2}:/.test(low)) { r.scope = 'multicast'; r.scopeCn = '组播地址（ff00::/8）'; }
      else if (/^2[0-9a-f]{3}:/.test(low) || /^3[0-9a-f]{3}:/.test(low)) { r.scope = 'public'; r.scopeCn = '公网地址（IPv6 全球单播 2000::/3）'; }
      else { r.scope = 'unknown'; r.scopeCn = 'IPv6 地址（具体用途暂无法确定）'; }
      return r;
    }

    var p = s.split('.');
    if (p.length !== 4 || p.some(function(x){ return !/^\d{1,3}$/.test(x) || +x > 255; })) {
      r.note = '不是合法的 IPv4/IPv6 地址';
      return r;
    }
    r.version = 4;
    var a = +p[0], b = +p[1];
    if (a === 10) { r.scope = 'private'; r.scopeCn = '私有地址（10.0.0.0/8）'; }
    else if (a === 172 && b >= 16 && b <= 31) { r.scope = 'private'; r.scopeCn = '私有地址（172.16.0.0/12）'; }
    else if (a === 192 && b === 168) { r.scope = 'private'; r.scopeCn = '私有地址（192.168.0.0/16）'; }
    else if (a === 127) { r.scope = 'loopback'; r.scopeCn = '本机回环地址（127.0.0.0/8）'; }
    else if (a === 169 && b === 254) { r.scope = 'linklocal'; r.scopeCn = '链路本地地址（169.254.0.0/16，常见于 DHCP 失败）'; }
    else if (a === 100 && b >= 64 && b <= 127) { r.scope = 'cgnat'; r.scopeCn = '运营商级 NAT 地址（100.64.0.0/10）'; }
    else if (a === 0) { r.scope = 'reserved'; r.scopeCn = '保留地址（0.0.0.0/8）'; }
    else if (a >= 224 && a <= 239) { r.scope = 'multicast'; r.scopeCn = '组播地址（224.0.0.0/4）'; }
    else if (a >= 240) { r.scope = 'reserved'; r.scopeCn = '保留地址（240.0.0.0/4）'; }
    else if (a === 255 && b === 255) { r.scope = 'reserved'; r.scopeCn = '广播地址'; }
    else { r.scope = 'public'; r.scopeCn = '公网地址'; }
    return r;
  }

  /* ══════════════ 机型查表 ══════════════ */

  function lookupDevice(model, codename){
    if (!model) return null;
    var key = String(model).toUpperCase();
    if (DEVICES[key]) return DEVICES[key];
    // 尝试去掉品牌前缀
    var stripped = String(model).replace(/^(Xiaomi|Redmi|POCO|Samsung|HUAWEI|HONOR|OPPO|vivo|OnePlus|realme|Google|Sony|LG|motorola|Nokia|Lenovo|ZTE|Meizu|nubia|ASUS)\s+/i, '');
    if (DEVICES[stripped.toUpperCase()]) return DEVICES[stripped.toUpperCase()];
    // 小米型号代码后缀 → 销售地区（仅 G/C/I 有可靠依据）
    var xm = String(model).match(/^(\d{4})([A-Z0-9]{3,5})([A-Z])$/i);
    if (xm) {
      var suf = xm[3].toUpperCase();
      if (XIAOMI_REGION[suf]) {
        return { brand:'Xiaomi', brandCn:'小米', product:'', productCn:'', region:XIAOMI_REGION[suf], regionInferred:true, src:'型号后缀推断' };
      }
    }
    return null;
  }

  /* ══════════════ 可信度标签 ══════════════ */

  var CONF = {
    confirmed: { txt:'已确认', cls:'cf-ok' },
    inferred:  { txt:'合理推断', cls:'cf-mid' },
    unknown:   { txt:'暂无法确定', cls:'cf-no' }
  };
  function badge(conf){
    var c = CONF[conf] || CONF.unknown;
    return '<i class="vp-c ' + c.cls + '">' + c.txt + '</i>';
  }

  /* ══════════════ 主分析 ══════════════ */

  function analyze(v){
    v = v || {};
    var ua = parseUA(v.ua || '');
    var ip = parseIP(v.ip || '');
    var dev = lookupDevice(ua.model, ua.codename);

    // 地理位置：city 形如 "Taichung · TW"
    var cityRaw = v.city || '';
    var cityParts = cityRaw.split('·').map(trim).filter(Boolean);
    var cityName = cityParts[0] || '';
    var cc = cityParts[1] || '';
    var cityZh = cityCn(cityName);
    var ccZh = countryCn(cc);
    var geoParts = [];
    if (cityZh) geoParts.push(cityZh);
    if (ccZh && ccZh !== cityZh) geoParts.push(ccZh);
    var geoText = geoParts.join(' · ');

    // 语言地区
    var loc = ua.locale || '';
    var locLang = '', locRegion = '';
    if (loc) {
      var lp = loc.replace('-', '_').split('_');
      locLang = langCn(lp[0] + (lp[1] ? '-' + lp[1] : ''));
      locRegion = regionCn(lp[1] || '');
    }

    // 设备品牌/型号
    var brandCn = ua.brandCn || (dev && dev.brandCn) || '';
    var productCn = (dev && dev.productCn) || '';
    var product = (dev && dev.product) || '';
    var codename = ua.codename || (dev && dev.codename) || '';

    // 处理器
    var soc = (dev && dev.soc) || '';
    var hwCn = ua.hardware ? (HW_VENDOR[ua.hardware.toLowerCase()] || ua.hardware) : '';

    // GPU
    var gpu = String(v.gpu || '').trim();
    var gpuInfo = null;
    if (gpu) {
      for (var gi = 0; gi < GPUS.length; gi++) {
        var gm = gpu.match(GPUS[gi].re);
        if (gm) { gpuInfo = { name: GPUS[gi].name(gm), vendor: GPUS[gi].vendor, note: GPUS[gi].note }; break; }
      }
    }

    // 分辨率 / DPI
    var resText = ua.resolution || '';
    var resNote = '';
    if (/^\d{3,4}x\d{3,4}$/.test(resText)) {
      var rp = resText.split('x');
      var w = +rp[0], h = +rp[1];
      resNote = '约 ' + Math.min(w,h) + ' × ' + Math.max(w,h) + ' 像素（' + (h > w ? '竖屏' : '横屏') + '；UA 中写作 ' + resText + '）';
    }

    // ── 分组 ──
    var groups = [];

    // 1) 设备信息
    var g1 = [];
    g1.push({ k:'品牌', v: brandCn || '暂无法确定', conf: brandCn ? 'confirmed' : 'unknown', note: ua.brand ? ('UA 原始值：' + ua.brand) : '' });
    g1.push({ k:'具体型号', v: productCn || '暂无法确定', conf: productCn ? 'inferred' : 'unknown', note: productCn ? ('资料库识别：' + product + (dev && dev.src ? '（来源：' + dev.src + '）' : '')) : (ua.brand === 'Apple' ? 'iOS 的 UA 不含具体机型代码，无法据此判断是哪种 iPhone / iPad' : (!ua.model ? 'UA 中未提供型号代码' : '未收录该型号代码，不做猜测')) });
    g1.push({ k:'型号代码', v: ua.model || '暂无法确定', conf: ua.model ? 'confirmed' : 'unknown', note: ua.model ? ('UA 原始值' + (dev && dev.region ? '；销售地区：' + dev.region + (dev.regionInferred ? '（由后缀推断）' : '') : '')) : '' });
    g1.push({ k:'设备代号', v: codename || '暂无法确定', conf: codename ? (dev && dev.codename ? 'confirmed' : 'inferred') : 'unknown', note: codename ? (dev && dev.codename ? '与机型资料库一致' : 'UA 中的 device 字段，未能对应到具体机型') : '' });
    g1.push({ k:'处理器 / 平台', v: soc || hwCn || '暂无法确定', conf: soc ? 'inferred' : (hwCn ? 'confirmed' : 'unknown'), note: soc ? '来自机型资料库' : (hwCn ? 'UA 中的 hardware 字段（仅平台厂商，非具体 SoC）' : '') });
    g1.push({ k:'GPU', v: gpuInfo ? (gpuInfo.name + '（' + gpuInfo.vendor + '）') : (gpu || '暂无法确定'), conf: gpuInfo ? 'inferred' : (gpu ? 'confirmed' : 'unknown'), note: gpuInfo ? gpuInfo.note + '；原始值：' + gpu : (gpu ? 'WebGL 原始值，未能归类' : '该访客未上报 WebGL 信息') });
    g1.push({ k:'操作系统', v: ua.osName ? (ua.osName + (ua.osVersion ? ' ' + ua.osVersion : '')) : '暂无法确定', conf: ua.osName ? 'confirmed' : 'unknown', note: ua.api || '' });
    g1.push({ k:'屏幕分辨率', v: resText || '暂无法确定', conf: resText ? 'confirmed' : 'unknown', note: resNote });
    g1.push({ k:'设备密度', v: ua.dpi || '暂无法确定', conf: ua.dpi ? 'confirmed' : 'unknown', note: ua.dpi ? 'App 上报的屏幕密度（dpi）；它不一定等于屏幕实际物理 PPI' : '' });
    g1.push({ k:'语言 / 地区', v: loc ? ((locLang || loc) + (locRegion ? ' · ' + locRegion : '')) : '暂无法确定', conf: loc ? 'confirmed' : 'unknown', note: loc ? ('原始值：' + loc + '；这是设备语言区域设置，不等于国籍') : '' });
    if (ua.buildId) g1.push({ k:'系统构建号', v: ua.buildId, conf:'confirmed', note:'UA 中的 Build ID' });
    groups.push({ title:'设备信息', rows: g1 });

    // 2) 浏览器与访问来源
    var g2 = [];
    g2.push({ k:'访问应用', v: ua.appCn || '普通浏览器（未识别到 App）', conf: ua.appCn ? 'confirmed' : 'inferred', note: ua.app ? ('UA 标识：' + ua.app + (ua.appVendor ? '（' + ua.appVendor + '）' : '')) : '' });
    if (ua.appVer) g2.push({ k:'应用版本', v: ua.appVer, conf:'confirmed', note:'UA 中 App 名称后的版本号' });
    g2.push({ k:'浏览器', v: ua.browser ? (ua.browser + (ua.browserVer ? ' ' + ua.browserVer : '')) : '暂无法确定', conf: ua.browser ? 'confirmed' : 'unknown', note:'' });
    g2.push({ k:'内核', v: ua.engine || '暂无法确定', conf: ua.engine ? 'confirmed' : 'unknown', note:'' });
    g2.push({ k:'WebView', v: ua.webview ? '是，App 内置网页环境（WebView）' : (ua.app ? '可能不是 WebView' : '未检测到 WebView 标记'), conf: ua.webview ? 'confirmed' : 'inferred', note: ua.webview ? 'UA 平台块含 wv 标记' : 'UA 平台块未含 wv 标记；部分 App 不会标注' });
    // 打开方式说明
    var how = '';
    if (ua.app && ua.webview) how = '访问者很可能是在 ' + ua.appCn + ' App 内点击链接，用 App 内置浏览器（WebView）打开的页面。';
    else if (ua.app) how = '访问者很可能通过 ' + ua.appCn + ' 打开该页面（是否内置浏览器无法完全确认）。';
    else if (ua.webview) how = '访问者使用某个 App 的内置浏览器打开页面（未能识别具体 App）。';
    else how = '访问者使用常规浏览器直接访问。';
    g2.push({ k:'打开方式', v: how, conf: (ua.app && ua.webview) ? 'inferred' : 'unknown', note:'' });
    groups.push({ title:'浏览器与访问来源', rows: g2 });

    // 3) IP 与网络
    var g3 = [];
    g3.push({ k:'IP 地址', v: ip.raw, conf: ip.raw !== '—' ? 'confirmed' : 'unknown', note: ip.note || '' });
    g3.push({ k:'地址类型', v: ip.version ? ('IPv' + ip.version + ' · ' + ip.scopeCn) : '暂无法确定', conf: ip.version ? 'confirmed' : 'unknown', note:'' });
    g3.push({ k:'地理位置', v: geoText || '暂无法确定', conf: geoText ? 'confirmed' : 'unknown', note: cityRaw ? ('IP 数据库原始值：' + cityRaw + '；城市级定位，非 GPS，不能据此确定实际位置') : '该记录未保存城市信息' });
    // 运营商/ASN：Worker 若采集了 asn/org 才显示
    var asn = v.asn, org = v.org;
    if (asn || org) {
      g3.push({ k:'运营商 / 网络归属', v: [org, asn ? ('AS' + asn) : ''].filter(Boolean).join(' · '), conf:'confirmed', note:'来自 Cloudflare 边缘网络信息' });
    } else {
      g3.push({ k:'运营商 / 网络归属', v:'暂无法确定', conf:'unknown', note:'该记录未采集 ASN/ISP；需后端在访问时记录 Cloudflare 的 asn/asOrganization 字段' });
    }
    if (ua.netType) {
      g3.push({ k:'网络类型', v:'UA 自报：' + ua.netType, conf:'inferred', note:'来自 UA 的 NetType 字段（App 自报），仅供参考；不等于 IP 归属网络类型' });
    } else {
      g3.push({ k:'网络类型', v:'暂无法确定', conf:'unknown', note:'仅凭 IP 无法可靠判断运营商/企业/数据中心网络，需 IP 归属数据库支持' });
    }
    g3.push({ k:'代理 / VPN 迹象', v:'无可靠依据，暂不判断', conf:'unknown', note:'不能仅凭 IP 或 UA 断定使用了 VPN/代理' });
    g3.push({ k:'定位可靠性', v:'城市级（IP 数据库）', conf:'confirmed', note:'不等于手机 GPS 定位；可能与实际所在城市有偏差' });
    groups.push({ title:'IP 与网络信息', rows: g3 });

    // 4) 访问行为与时间
    var g4 = [];
    var verdict = v.verdict || '';
    var vTxt = verdict === 'auto' ? '机器 / 自动化（webdriver=true）'
             : verdict === 'bot' ? '疑似机器人（UA 命中爬虫特征）'
             : verdict === 'human' ? '真人（未命中机器人特征）'
             : '未记录判定';
    var vConf = verdict ? 'inferred' : 'unknown';
    g4.push({ k:'访客 ID', v: v.fp || '—', conf:'confirmed', note:'由设备指纹（UA/平台/Canvas/WebGL/屏幕/时区/语言/CPU/内存）哈希得到的 8 位短 ID，用于区分设备；不是账号，也不是会话 ID' });
    g4.push({ k:'系统分类', v: vTxt, conf: vConf, note:'这是启发式判定：命中 UA 爬虫特征或 webdriver=true 才标为机器人；标「真人」不代表一定能证明是真实人类' });
    g4.push({ k:'首次访问', v: fmtTime(v.first) + '（' + relTime(v.first) + '）', conf:'confirmed', note:'按你本机时区 ' + tzName() + ' 显示' });
    g4.push({ k:'最近访问', v: fmtTime(v.last) + '（' + relTime(v.last) + '）', conf:'confirmed', note:'按你本机时区 ' + tzName() + ' 显示' });
    g4.push({ k:'访问次数', v: String(v.count || 1) + ' 次', conf:'confirmed', note:'该指纹累计上报次数（每次打开页面 POST /visit 计 1 次）；不是独立会话数，也不代表同一人' });
    if (v.note) g4.push({ k:'站长备注', v: v.note, conf:'confirmed', note:'' });
    groups.push({ title:'访问行为与时间', rows: g4 });

    // ── 交叉分析 ──
    var cross = [];
    if (dev && dev.codename && ua.codename && dev.codename === ua.codename) cross.push('机型代码与设备代号互相吻合（' + ua.model + ' ↔ ' + ua.codename + '），可提高型号识别可信度。');
    if (dev && dev.soc && gpuInfo) cross.push('处理器资料（' + dev.soc + '）与 GPU 上报（' + gpuInfo.name + '）方向一致，均指向 ' + gpuInfo.vendor + ' 平台。');
    if (resText && ua.mobile) cross.push('UA 标注为移动设备，分辨率 ' + resText + ' 与手机形态一致。');
    if (ua.app && ua.webview) cross.push('UA 同时含 App 标识与 wv 标记 → 基本可确认是 App 内置浏览器访问。');
    if (ua.conflicts && ua.conflicts.length) cross = cross.concat(ua.conflicts);

    // ── 概览 ──
    var ov = [];
    var devDesc = productCn ? (productCn + '（' + (ua.model || '') + '）') : (brandCn ? (brandCn + ' 设备' + (ua.model ? '（型号 ' + ua.model + '）' : '')) : '设备');
    ov.push('这是一条来自 ' + (ua.osName ? (ua.osName + (ua.osVersion ? ' ' + ua.osVersion : '')) : '未知系统') + ' ' + (ua.mobile ? '移动设备' : '设备') + '的访问记录。');
    if (productCn) ov.push('设备型号识别为 ' + devDesc + '。');
    else if (brandCn) ov.push('品牌识别为 ' + brandCn + '，具体型号暂无法确定。');
    if (ua.app) {
      var via = '通过 ' + ua.appCn + (ua.appVer ? ' ' + ua.appVer : '') + (ua.webview ? ' App 内置浏览器' : '');
      ov.push(via + (/[\u4e00-\u9fa5]$/.test(via) ? '' : ' ') + '访问。');
    }
    if (geoText) ov.push('IP 地理数据库将网络位置定位到 ' + geoText + '。');
    ov.push('本次记录显示访问 ' + (v.count || 1) + ' 次。');
    if (ua.conflicts && ua.conflicts.length) ov.push('注意：' + ua.conflicts[0] + '。');

    return {
      overview: ov.join(''),
      groups: groups,
      cross: cross,
      ua: ua,
      ip: ip,
      raw: { ua: v.ua || '', json: v }
    };
  }

  /* ══════════════ HTML 渲染 ══════════════ */

  function rowHtml(r){
    var note = r.note ? '<div class="vp-note">' + esc(r.note) + '</div>' : '';
    return '<div class="vp-row"><span class="vp-k">' + esc(r.k) + '</span><span class="vp-v">' +
      esc(r.v) + ' ' + badge(r.conf) + '</span></div>' + note;
  }

  function render(v){
    var a;
    try { a = analyze(v); }
    catch(e){
      return '<div class="vp-sec"><div class="vp-h">解析失败</div><p class="vp-overview">本地解析出错，已保留原始数据，请查看「原始数据」。</p></div>' +
             rawHtml(v);
    }
    var h = '';
    // 概览
    h += '<div class="vp-sec"><div class="vp-h">访问概览</div><p class="vp-overview">' + esc(a.overview) + '</p></div>';
    // 分组
    a.groups.forEach(function(g){
      h += '<div class="vp-sec"><div class="vp-h">' + esc(g.title) + '</div><div class="vp-rows">';
      g.rows.forEach(function(r){ h += rowHtml(r); });
      h += '</div></div>';
    });
    // 交叉分析
    if (a.cross && a.cross.length) {
      h += '<div class="vp-sec"><div class="vp-h">交叉分析</div><ul class="vp-cross">';
      a.cross.forEach(function(x){ h += '<li>' + esc(x) + '</li>'; });
      h += '</ul></div>';
    }
    // 原始数据
    h += rawHtml(v);
    return h;
  }

  function rawHtml(v){
    var json = '';
    try { json = JSON.stringify(v, null, 2); } catch(e){ json = String(v); }
    return '<details class="vp-raw"><summary>原始数据（点击展开 / 可复制）</summary>' +
      '<div class="vp-raw-block"><div class="vp-raw-h"><span>原始 User-Agent</span><button type="button" class="vp-copy">复制</button></div>' +
      '<pre class="vp-pre">' + esc(v && v.ua || '—') + '</pre></div>' +
      '<div class="vp-raw-block"><div class="vp-raw-h"><span>原始访客字段</span><button type="button" class="vp-copy">复制</button></div>' +
      '<pre class="vp-pre">' + esc(json) + '</pre></div>' +
      '</details>';
  }

  window.VisitorParse = {
    analyze: analyze,
    render: render,
    parseUA: parseUA,
    parseIP: parseIP,
    _tables: { COUNTRY: COUNTRY, CITY: CITY, DEVICES: DEVICES, APPS: APPS, GPUS: GPUS }
  };
})();
