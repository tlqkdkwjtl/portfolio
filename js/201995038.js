// Scroll reveal
  const reveals = document.querySelectorAll('.reveal');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.1 });
  reveals.forEach(r => obs.observe(r));

  // Toggle projects
  function toggleProject(el) {
    el.classList.toggle('open');
  }

  // around_you: Code modal (read-only)
  const aroundYouCodeFiles = [
    {
      id: 'main_dart',
      path: 'lib/main.dart',
      desc: '앱 시작점 + MultiProvider 구성',
      code: `// main.dart (핵심 발췌)
void main() => runApp(const MyApp());

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => LanguageProvider()),
        ChangeNotifierProvider(create: (_) => PostProvider()),
        ChangeNotifierProvider(create: (_) => UiTranslationProvider()),
      ],
      child: Consumer2<LanguageProvider, UiTranslationProvider>(
        builder: (_, languageProvider, uiTranslationProvider, __) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            uiTranslationProvider.initialize(languageProvider.currentLanguageCode);
          });
          return const MaterialApp(home: MainNavigation());
        },
      ),
    );
  }
}
`
    },
    {
      id: 'main_navigation',
      path: 'lib/screens/main_navigation.dart',
      desc: '하단 탭(홈/동네생활/렌탈) + 화면 전환 흐름 (앱 UX 뼈대)',
      code: `// main_navigation.dart (핵심 발췌)
class _MainNavigationState extends State<MainNavigation> {
  int _currentIndex = 0;
  int _previousIndex = 0;

  final List<Widget> _screens = const [
    HomeScreen(),
    CommunityScreen(),
    RentalScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    // 탭 이동 시 현재 섹션에 맞게 게시글 필터 재적용
    if (_currentIndex != _previousIndex) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final postProvider = context.read<PostProvider>();
        final lang = context.read<LanguageProvider>().currentLanguageCode;

        if (_currentIndex == 0) {
          postProvider.clearPosts();
          postProvider.loadPosts(
            context: context,
            refresh: true,
            parentCategoryId: 1, // 홈: 중고거래
            targetLanguage: lang,
          );
        } else if (_currentIndex == 1) {
          postProvider.clearPosts();
          postProvider.loadPosts(
            context: context,
            refresh: true,
            categoryId: 7, // 동네생활: 모임
            targetLanguage: lang,
          );
        }
        _previousIndex = _currentIndex;
      });
    }

    return Scaffold(
      body: IndexedStack(index: _currentIndex, children: _screens),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        type: BottomNavigationBarType.fixed,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: '홈'),
          BottomNavigationBarItem(icon: Icon(Icons.people), label: '동네생활'),
          BottomNavigationBarItem(icon: Icon(Icons.shopping_bag), label: '물건 랜탈'),
        ],
      ),
    );
  }
}
`
    },
    {
      id: 'post_provider',
      path: 'lib/providers/post_provider.dart',
      desc: '데이터 로딩/페이징/에러·로딩 상태 (UI와 비즈니스 로직 분리)',
      code: `// post_provider.dart (핵심 발췌)
class PostProvider with ChangeNotifier {
  final ApiService _apiService = ApiService();
  final TranslationCacheService _translationService = TranslationCacheService();

  List<Post> _posts = [];
  bool _isLoading = false;
  String? _error;
  int _currentPage = 1;
  bool _hasMore = true;
  int? _categoryId;
  int? _parentCategoryId;
  String? _searchQuery;

  List<Post> get posts => _posts;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get hasMore => _hasMore;

  Future<void> loadPosts({
    int? categoryId,
    int? parentCategoryId,
    String? search,
    bool refresh = false,
    required BuildContext context,
    String? targetLanguage,
  }) async {
    if (_isLoading) return;
    if (refresh) {
      _currentPage = 1;
      _posts = [];
      _hasMore = true;
    }

    _categoryId = categoryId;
    _parentCategoryId = parentCategoryId;
    _searchQuery = search;
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final language = targetLanguage ??
          context.read<LanguageProvider>().currentLanguageCode;

      final response = await _apiService.getPosts(
        categoryId: categoryId,
        parentCategoryId: parentCategoryId,
        page: _currentPage,
        limit: 20,
        search: search,
      );

      final next = response.posts.map((post) {
        if (language != 'ko' && language != 'en' &&
            !_hasTranslationForLanguage(post, language)) {
          _updateTranslationInBackground(post.id, language);
        }
        return post; // 원본 + 번역 필드 유지
      }).toList();

      refresh ? _posts = next : _posts.addAll(next);
      _hasMore = response.hasMore;
      if (_hasMore) _currentPage++;
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadMore(BuildContext context) async {
    if (!_hasMore || _isLoading) return;
    await loadPosts(
      categoryId: _categoryId,
      parentCategoryId: _parentCategoryId,
      search: _searchQuery,
      context: context,
      targetLanguage: context.read<LanguageProvider>().currentLanguageCode,
    );
  }

  void clearPosts() {
    _posts = [];
    _currentPage = 1;
    _hasMore = true;
    _categoryId = null;
    _parentCategoryId = null;
    _searchQuery = null;
    _error = null;
    notifyListeners();
  }
}
`
    },
    {
      id: 'api_service',
      path: 'lib/services/api_service.dart',
      desc: '서버 통신 방식 + 엔드포인트 호출 구조 (프론트-백 연결)',
      code: `// api_service.dart (핵심 발췌, 민감정보 마스킹)
class ApiService {
  static const _baseUrl = '[BASE_URL]'; 
  static const _headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer [API_KEY]',
    'X-Client-Key': '[API_KEY]',
  };

  Future<PostListResponse> getPosts({
    int page = 1,
    int limit = 20,
    int? categoryId,
    int? parentCategoryId,
    String? search,
  }) async {
    final query = <String, String>{
      'page': '$page',
      'limit': '$limit',
      if (categoryId != null) 'category_id': '$categoryId',
      if (parentCategoryId != null) 'parent_category_id': '$parentCategoryId',
      if (search != null && search.isNotEmpty) 'search': search,
    };

    final uri = Uri.parse('$_baseUrl/posts/list.php')
        .replace(queryParameters: query);

    final res = await http.get(uri, headers: _headers).timeout(ApiConfig.timeout);
    if (res.statusCode != 200) {
      throw Exception('HTTP \${res.statusCode}: \${res.reasonPhrase}');
    }

    final body = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    if (body['success'] != true || body['data'] == null) {
      throw Exception(body['message'] ?? 'Failed to fetch posts');
    }

    final data = body['data'] as Map<String, dynamic>;
    final posts = (data['posts'] as List)
        .map((e) => Post.fromJson(e as Map<String, dynamic>))
        .toList();
    final p = data['pagination'] as Map<String, dynamic>;

    return PostListResponse(
      posts: posts,
      page: p['page'] ?? page,
      limit: p['limit'] ?? limit,
      total: p['total'] ?? 0,
      totalPages: p['total_pages'] ?? 0,
    );
  }

  Future<Map<String, String>> updatePostTranslation({
    required int postId,
    required String languageCode,
  }) async {
    final uri = Uri.parse('$_baseUrl/posts/update_translation.php');
    final body = jsonEncode({'post_id': postId, 'language_code': languageCode});
    final res = await http.post(uri, headers: _headers, body: body);

    final data = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    if (res.statusCode != 200 || data['success'] != true || data['data'] == null) {
      throw Exception(data['message'] ?? 'Failed to update translation');
    }

    final t = data['data'] as Map<String, dynamic>;
    return {'title': t['title'] as String, 'content': t['content'] as String};
  }
}
`
    },
    {
      id: 'model_rental',
      path: 'lib/models/rental.dart (또는 post.dart)',
      desc: 'JSON 파싱 + 데이터 모델링 (실무형 데이터 처리)',
      code: `// rental.dart (핵심 발췌)
class Rental {
  final int id;
  final int userId;
  final String title;
  final String description;
  final String? titleEn, titleJa, titleZh, titleEs, titleFr, titleDe, titleRu;
  final String? descriptionEn, descriptionJa, descriptionZh, descriptionEs, descriptionFr, descriptionDe, descriptionRu;
  final int? dailyPrice;
  final String status;
  final DateTime createdAt;
  final DateTime updatedAt;

  Rental({
    required this.id,
    required this.userId,
    required this.title,
    required this.description,
    this.titleEn, this.titleJa, this.titleZh, this.titleEs, this.titleFr, this.titleDe, this.titleRu,
    this.descriptionEn, this.descriptionJa, this.descriptionZh, this.descriptionEs, this.descriptionFr, this.descriptionDe, this.descriptionRu,
    this.dailyPrice,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Rental.fromJson(Map<String, dynamic> json) {
    return Rental(
      id: json['id'] as int,
      userId: json['user_id'] as int,
      title: json['title'] as String,
      description: json['description'] as String,
      titleEn: json['title_en'] as String?,
      titleJa: json['title_ja'] as String?,
      titleZh: json['title_zh'] as String?,
      titleEs: json['title_es'] as String?,
      titleFr: json['title_fr'] as String?,
      titleDe: json['title_de'] as String?,
      titleRu: json['title_ru'] as String?,
      descriptionEn: json['description_en'] as String?,
      descriptionJa: json['description_ja'] as String?,
      descriptionZh: json['description_zh'] as String?,
      descriptionEs: json['description_es'] as String?,
      descriptionFr: json['description_fr'] as String?,
      descriptionDe: json['description_de'] as String?,
      descriptionRu: json['description_ru'] as String?,
      dailyPrice: json['daily_price'] as int?,
      status: json['status'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }

  String getTitleByLanguage(String code) {
    switch (code) {
      case 'en': return titleEn ?? title;
      case 'ja': return titleJa ?? titleEn ?? title;
      case 'zh': return titleZh ?? titleEn ?? title;
      case 'es': return titleEs ?? titleEn ?? title;
      case 'fr': return titleFr ?? titleEn ?? title;
      case 'de': return titleDe ?? titleEn ?? title;
      case 'ru': return titleRu ?? titleEn ?? title;
      default: return title; // ko + fallback
    }
  }

  String get formattedDailyPrice {
    if (dailyPrice == null) return '가격 미정';
    return '\${dailyPrice!.toString().replaceAllMapped(RegExp(r'(\\\\d)(?=(\\\\d{3})+(?!\\\\d))'), (m) => '\${m[1]},')}원/일';
  }
}
`
    },
    {
      id: 'php_list',
      path: 'server/api/rentals/list.php',
      desc: '백엔드 API 실제 구현 (필터링 + 페이징 + UTF-8 응답)',
      code: `<?php
// rentals/list.php (핵심 발췌, 환경정보 마스킹)
require_once '[CONFIG_PATH]/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendError('Only GET method is allowed', 405);
}

$page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
$limit = isset($_GET['limit']) ? min(100, max(1, (int)$_GET['limit'])) : 20;
$offset = ($page - 1) * $limit;
$search = isset($_GET['search']) ? trim($_GET['search']) : null;
$status = isset($_GET['status']) ? trim($_GET['status']) : 'available';

try {
    $db = (new Database())->getConnection();
    $db->exec("SET NAMES utf8mb4");

    $where = ["r.status != 'deleted'"];
    $params = [];

    if ($status) {
        $where[] = "r.status = ?";
        $params[] = $status;
    }
    if ($search) {
        $where[] = "(r.title LIKE ? OR r.description LIKE ?)";
        $term = "%{$search}%";
        $params[] = $term;
        $params[] = $term;
    }

    $whereClause = implode(' AND ', $where);

    $countStmt = $db->prepare("SELECT COUNT(*) as total FROM rentals r WHERE {$whereClause}");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetch(PDO::FETCH_ASSOC)['total'];

    $stmt = $db->prepare("
      SELECT r.id, r.user_id, r.title, r.description, r.title_en, r.description_en,
             r.title_ja, r.description_ja, r.title_zh, r.description_zh,
             r.daily_price, r.status, r.created_at, u.nickname as user_nickname
      FROM rentals r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE {$whereClause}
      ORDER BY r.created_at DESC
      LIMIT {$limit} OFFSET {$offset}
    ");
    $stmt->execute($params);
    $rentals = $stmt->fetchAll(PDO::FETCH_ASSOC);

    header('Content-Type: application/json; charset=utf-8');
    sendSuccess([
      'rentals' => $rentals,
      'pagination' => [
        'page' => $page,
        'limit' => $limit,
        'total' => $total,
        'total_pages' => (int)ceil($total / $limit),
      ]
    ]);
} catch (Exception $e) {
    sendError('Failed to fetch rentals', 500); // 내부 상세 에러는 로그에서 확인
}
?>`
    },
    {
      id: 'rental_screen',
      path: 'lib/screens/rental_screen.dart',
      desc: '실제 화면 + API 사용 + 번역 반영까지 (한 파일로 흐름 확인)',
      code: `// rental_screen.dart (핵심 발췌)
class _RentalScreenState extends State<RentalScreen> {
  final ApiService _apiService = ApiService();
  final List<Rental> _rentals = [];
  bool _isLoading = false;
  String? _error;
  int _currentPage = 1;
  bool _hasMore = true;
  String _currentLanguage = 'ko';

  @override
  void initState() {
    super.initState();
    _loadRentals();
    final langProvider = context.read<LanguageProvider>();
    _currentLanguage = langProvider.currentLanguageCode;
    langProvider.addListener(_onLanguageChanged);
  }

  void _onLanguageChanged() {
    final newLang = context.read<LanguageProvider>().currentLanguageCode;
    if (_currentLanguage == newLang) return;
    setState(() => _currentLanguage = newLang);
    _updateRentalsTranslation(newLang); // 다국어 번역 백그라운드 반영
  }

  Future<void> _loadRentals({bool refresh = false}) async {
    if (_isLoading) return;
    if (refresh) {
      _currentPage = 1;
      _rentals.clear();
      _hasMore = true;
    }
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final res = await _apiService.getRentals(page: _currentPage, limit: 20);
      setState(() {
        _rentals.addAll(res.rentals);
        _hasMore = res.hasMore;
        if (_hasMore) _currentPage++;
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('물건 랜탈'),
        actions: const [LanguageSelector(), SizedBox(width: 8)],
      ),
      body: RefreshIndicator(
        onRefresh: () => _loadRentals(refresh: true),
        child: ListView.builder(
          itemCount: _rentals.length + (_hasMore ? 1 : 0),
          itemBuilder: (context, index) {
            if (index == _rentals.length) {
              if (!_isLoading) _loadRentals(); // 무한 스크롤
              return const Center(child: CircularProgressIndicator());
            }
            final rental = _rentals[index];
            final lang = context.watch<LanguageProvider>().currentLanguageCode;
            return ListTile(
              title: Text(rental.getTitleByLanguage(lang)),
              subtitle: Text(rental.getDescriptionByLanguage(lang), maxLines: 2),
              trailing: Text(rental.formattedDailyPrice),
              onTap: () => _showRentalBookingDialog(context, rental),
            );
          },
        ),
      ),
    );
  }

  void _showRentalBookingDialog(BuildContext context, Rental rental) {
    // 시작일/종료일 선택 + 대여일 계산 + 총액 계산(일/주/월 요금 반영)
    // 확인 시 예약 API 연동 지점(TODO)
  }
}
`
    }
  ];

  let aroundYouActiveId = null;

  function renderAroundYouCodeFiles() {
    const wrap = document.getElementById('aroundYouCodeFiles');
    if (!wrap) return;
    wrap.innerHTML = '';

    aroundYouCodeFiles.forEach((f, idx) => {
      const btn = document.createElement('button');
      btn.className = 'codefile' + (idx === 0 ? ' active' : '');
      btn.type = 'button';
      btn.onclick = () => selectAroundYouFile(f.id);

      const p = document.createElement('div');
      p.className = 'path';
      p.textContent = f.path;

      const d = document.createElement('div');
      d.className = 'desc';
      d.textContent = f.desc;

      btn.appendChild(p);
      btn.appendChild(d);
      wrap.appendChild(btn);
    });

    if (aroundYouCodeFiles.length) selectAroundYouFile(aroundYouCodeFiles[0].id);
  }

  function selectAroundYouFile(id) {
    aroundYouActiveId = id;
    const file = aroundYouCodeFiles.find(x => x.id === id);
    if (!file) return;

    const activeFile = document.getElementById('aroundYouActiveFile');
    const activeDesc = document.getElementById('aroundYouActiveDesc');
    const codeText = document.getElementById('aroundYouCodeText');

    if (activeFile) activeFile.textContent = file.path;
    if (activeDesc) activeDesc.textContent = file.desc;
    if (codeText) {
      const lang = detectCodeLang(file.path);
      codeText.innerHTML = highlightCode(file.code || '', lang);
    }

    const wrap = document.getElementById('aroundYouCodeFiles');
    if (wrap) {
      [...wrap.querySelectorAll('.codefile')].forEach((el, idx) => {
        const fid = aroundYouCodeFiles[idx]?.id;
        el.classList.toggle('active', fid === id);
      });
    }
  }

  function detectCodeLang(path) {
    const p = (path || '').toLowerCase();
    if (p.endsWith('.dart')) return 'dart';
    if (p.endsWith('.php')) return 'php';
    return 'plain';
  }

  function escapeHtml(s) {
    return s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  function highlightCode(input, lang) {
    let s = escapeHtml(input);
    s = s.replace(/(\/\/.*)$/gm, '<span class="tok-comment">$1</span>');
    s = s.replace(/(#.*)$/gm, '<span class="tok-comment">$1</span>');
    s = s.replace(/("([^"\\\\]|\\\\.)*"|'([^'\\\\]|\\\\.)*')/g, '<span class="tok-string">$1</span>');
    s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>');

    if (lang === 'dart') {
      s = s.replace(/\b(class|extends|with|final|const|var|void|int|bool|double|String|Future|return|if|else|switch|case|default|break|try|catch|async|await|required|this|new|static)\b/g, '<span class="tok-keyword">$1</span>');
      s = s.replace(/\b(StatefulWidget|StatelessWidget|State|Widget|BuildContext|Scaffold|AppBar|ListView|RefreshIndicator|LanguageProvider|ApiService|Rental)\b/g, '<span class="tok-type">$1</span>');
    } else if (lang === 'php') {
      s = s.replace(/\b(function|class|public|private|protected|try|catch|if|else|foreach|return|require_once|new|as|throw)\b/g, '<span class="tok-keyword">$1</span>');
      s = s.replace(/\b(PDO|Exception|Database)\b/g, '<span class="tok-type">$1</span>');
      s = s.replace(/(\$[a-zA-Z_]\w*)/g, '<span class="tok-attr">$1</span>');
    }
    return s;
  }

  function openAroundYouCodeModal(evt) {
    if (evt) {
      evt.preventDefault();
      evt.stopPropagation(); // prevent project toggle
    }
    const modal = document.getElementById('aroundYouCodeModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    renderAroundYouCodeFiles();
  }

  function closeAroundYouCodeModal() {
    const modal = document.getElementById('aroundYouCodeModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAroundYouCodeModal();
  });

