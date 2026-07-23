package plugin

import (
	"sync"
)

type channelSessionKey struct {
	pluginID  string
	channelID string
}

type chapterSessionKey struct {
	pluginID  string
	channelID string
	parentID  string
}

type ChannelSession struct {
	LastResponse *FetchResult
	LastParams   map[string]string
	Ephemeral    []FeedItem
	HasMore      bool
	// AutoListRefreshRequested is set when ListItems kicks off a one-shot
	// background refresh for an empty channel. Prevents re-enqueue storms
	// while the frontend polls for results.
	AutoListRefreshRequested bool
	// ListRefreshPending is true while that auto (or interactive) refresh is
	// still queued/running for an empty list.
	ListRefreshPending bool
}

type ChapterSession struct {
	LastResponse *FetchResult
	LastParams   map[string]string
	Ephemeral    []FeedItem
	HasMore      bool // API reports more pages available
	LoadedCount  int  // items already delivered to the client in this view
}

type SessionStore struct {
	mu              sync.RWMutex
	sessions        map[channelSessionKey]*ChannelSession
	chapterSessions map[chapterSessionKey]*ChapterSession
}

func NewSessionStore() *SessionStore {
	return &SessionStore{
		sessions:        make(map[channelSessionKey]*ChannelSession),
		chapterSessions: make(map[chapterSessionKey]*ChapterSession),
	}
}

func (s *SessionStore) key(pluginID, channelID string) channelSessionKey {
	return channelSessionKey{pluginID: pluginID, channelID: channelID}
}

func (s *SessionStore) Get(pluginID, channelID string) *ChannelSession {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.sessions[s.key(pluginID, channelID)]
}

func (s *SessionStore) GetOrCreate(pluginID, channelID string) *ChannelSession {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := s.key(pluginID, channelID)
	if sess, ok := s.sessions[k]; ok {
		return sess
	}
	sess := &ChannelSession{}
	s.sessions[k] = sess
	return sess
}

func (s *SessionStore) SetListResponse(
	pluginID, channelID string,
	result FetchResult,
	hasMore bool,
	params map[string]string,
) {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := s.key(pluginID, channelID)
	sess := s.sessions[k]
	if sess == nil {
		sess = &ChannelSession{}
		s.sessions[k] = sess
	}
	copyResult := result
	sess.LastResponse = &copyResult
	sess.LastParams = cloneStringMap(params)
	sess.HasMore = hasMore
}

func (s *SessionStore) SetEphemeral(pluginID, channelID string, items []FeedItem, hasMore bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := s.key(pluginID, channelID)
	sess := s.sessions[k]
	if sess == nil {
		sess = &ChannelSession{}
		s.sessions[k] = sess
	}
	sess.Ephemeral = append([]FeedItem(nil), items...)
	sess.HasMore = hasMore
}

func (s *SessionStore) AppendEphemeral(pluginID, channelID string, items []FeedItem, hasMore bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := s.key(pluginID, channelID)
	sess := s.sessions[k]
	if sess == nil {
		sess = &ChannelSession{}
		s.sessions[k] = sess
	}
	sess.Ephemeral = append(sess.Ephemeral, items...)
	sess.HasMore = hasMore
}

func (s *SessionStore) Clear(pluginID, channelID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, s.key(pluginID, channelID))
}

// BeginAutoListRefresh marks a one-shot empty-list refresh as requested+pending.
// Returns false if an auto refresh was already requested for this session.
func (s *SessionStore) BeginAutoListRefresh(pluginID, channelID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := s.key(pluginID, channelID)
	sess := s.sessions[k]
	if sess == nil {
		sess = &ChannelSession{}
		s.sessions[k] = sess
	}
	if sess.AutoListRefreshRequested {
		return false
	}
	sess.AutoListRefreshRequested = true
	sess.ListRefreshPending = true
	return true
}

// ListRefreshPending reports whether an empty-list refresh is still in flight.
func (s *SessionStore) ListRefreshPending(pluginID, channelID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess := s.sessions[s.key(pluginID, channelID)]
	return sess != nil && sess.ListRefreshPending
}

// MarkListRefreshSettled clears the in-flight flag after a refresh attempt finishes.
func (s *SessionStore) MarkListRefreshSettled(pluginID, channelID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess := s.sessions[s.key(pluginID, channelID)]
	if sess == nil {
		return
	}
	sess.ListRefreshPending = false
}

// ResetAutoListRefresh allows the next empty ListItems call to enqueue again
// (used after an explicit user refresh).
func (s *SessionStore) ResetAutoListRefresh(pluginID, channelID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess := s.sessions[s.key(pluginID, channelID)]
	if sess == nil {
		return
	}
	sess.AutoListRefreshRequested = false
	sess.ListRefreshPending = false
}

// ResetFeedPagination resets lastParams to the home-page refresh params while
// preserving LastResponse.Next when the previous fetch was also a home page.
// That keeps pageToken / seenIds cursors available for the first load-more.
// Returns the preserved next map (may be nil) for clients listing the home page.
func (s *SessionStore) ResetFeedPagination(
	pluginID, channelID string,
	params map[string]string,
	hasMore bool,
	pag *PaginationFeature,
) map[string]string {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := s.key(pluginID, channelID)
	sess := s.sessions[k]
	if sess == nil {
		sess = &ChannelSession{}
		s.sessions[k] = sess
	}

	var preservedNext map[string]string
	if sess.LastResponse != nil && len(sess.LastResponse.Next) > 0 && IsHomePage(sess.LastParams, pag) {
		preservedNext = cloneStringMap(sess.LastResponse.Next)
	}
	if preservedNext != nil {
		sess.LastResponse = &FetchResult{Next: preservedNext}
	} else {
		sess.LastResponse = nil
	}
	sess.LastParams = cloneStringMap(params)
	sess.HasMore = hasMore
	return preservedNext
}

func (s *SessionStore) chapterKey(pluginID, channelID, parentID string) chapterSessionKey {
	return chapterSessionKey{pluginID: pluginID, channelID: channelID, parentID: parentID}
}

func (s *SessionStore) GetChapter(pluginID, channelID, parentID string) *ChapterSession {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.chapterSessions[s.chapterKey(pluginID, channelID, parentID)]
}

func cloneStringMap(src map[string]string) map[string]string {
	if len(src) == 0 {
		return nil
	}
	out := make(map[string]string, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}

func (s *SessionStore) SetChapterListResponse(
	pluginID, channelID, parentID string,
	result FetchResult,
	hasMore bool,
	params map[string]string,
) {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := s.chapterKey(pluginID, channelID, parentID)
	sess := s.chapterSessions[k]
	if sess == nil {
		sess = &ChapterSession{}
		s.chapterSessions[k] = sess
	}
	copyResult := result
	sess.LastResponse = &copyResult
	sess.LastParams = cloneStringMap(params)
	sess.HasMore = hasMore
}

func (s *SessionStore) SetChapterEphemeral(pluginID, channelID, parentID string, items []FeedItem, hasMore bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := s.chapterKey(pluginID, channelID, parentID)
	sess := s.chapterSessions[k]
	if sess == nil {
		sess = &ChapterSession{}
		s.chapterSessions[k] = sess
	}
	sess.Ephemeral = append([]FeedItem(nil), items...)
	sess.HasMore = hasMore
}

func (s *SessionStore) AppendChapterEphemeral(pluginID, channelID, parentID string, items []FeedItem, hasMore bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := s.chapterKey(pluginID, channelID, parentID)
	sess := s.chapterSessions[k]
	if sess == nil {
		sess = &ChapterSession{}
		s.chapterSessions[k] = sess
	}
	sess.Ephemeral = append(sess.Ephemeral, items...)
	sess.HasMore = hasMore
}

func (s *SessionStore) ResetChapterPagination(
	pluginID, channelID, parentID string,
	params map[string]string,
	hasMore bool,
) {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := s.chapterKey(pluginID, channelID, parentID)
	sess := s.chapterSessions[k]
	if sess == nil {
		sess = &ChapterSession{}
		s.chapterSessions[k] = sess
	}
	sess.LastResponse = nil
	sess.LastParams = cloneStringMap(params)
	sess.HasMore = hasMore
	sess.LoadedCount = 0
}

func (s *SessionStore) SetChapterLoadedCount(pluginID, channelID, parentID string, loadedCount int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := s.chapterKey(pluginID, channelID, parentID)
	sess := s.chapterSessions[k]
	if sess == nil {
		sess = &ChapterSession{}
		s.chapterSessions[k] = sess
	}
	sess.LoadedCount = loadedCount
}

func (s *SessionStore) ResetChapterDisplay(pluginID, channelID, parentID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := s.chapterKey(pluginID, channelID, parentID)
	sess := s.chapterSessions[k]
	if sess == nil {
		return
	}
	sess.LoadedCount = 0
}

func (s *SessionStore) ClearChapter(pluginID, channelID, parentID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.chapterSessions, s.chapterKey(pluginID, channelID, parentID))
}

func (s *SessionStore) ClearPlugin(pluginID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k := range s.sessions {
		if k.pluginID == pluginID {
			delete(s.sessions, k)
		}
	}
	for k := range s.chapterSessions {
		if k.pluginID == pluginID {
			delete(s.chapterSessions, k)
		}
	}
}
