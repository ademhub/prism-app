const TMDB_IMG = 'https://image.tmdb.org/t/p'

export const img = (path, size = 'w500') =>
  path ? `${TMDB_IMG}/${size}${path}` : null

export const getMedia = () =>
  fetch('/api/media').then((r) => {
    if (!r.ok) throw new Error('Erreur API /media')
    return r.json()
  })

export const getMediaDetail = (id) =>
  fetch(`/api/media/${id}`).then((r) => {
    if (!r.ok) throw new Error(`Erreur API /media/${id}`)
    return r.json()
  })

export const getProgress = () =>
  fetch('/api/progress').then((r) => r.json())

export const getActorFilms = (name) =>
  fetch(`/api/actor/${encodeURIComponent(name)}`).then((r) => {
    if (!r.ok) throw new Error('Acteur introuvable')
    return r.json()
  })

export const getTrailer = (id) =>
  fetch(`/api/trailer/${id}`).then((r) => {
    if (!r.ok) throw new Error('Aucune bande-annonce')
    return r.json()
  })

export const saveProgress = (media_id, position_secondes) =>
  fetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_id: Number(media_id), position_secondes }),
  }).then((r) => r.json())

export const importMedia = (tmdbId, mediaType = 'movie') =>
  fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tmdbId, mediaType }),
  }).then((r) => r.json())

export const importByQuery = (query, mediaType = 'movie') =>
  fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, mediaType }),
  }).then((r) => r.json())

export const importPopular = (pages = 1) =>
  fetch('/api/import/popular', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pages }),
  }).then((r) => r.json())

export const getSeries = () =>
  fetch('/api/series').then((r) => r.json())

export const getCollections = () =>
  fetch('/api/collections').then((r) => r.json())

export const importSeriesBulk = () =>
  fetch('/api/import/frembed/series', { method: 'POST' }).then((r) => r.json())

// ── Social ────────────────────────────────────────────────────────────────────
export const getMyProfile = (userId) =>
  fetch(`/api/users/me?userId=${userId}`).then((r) => r.json())

export const updateMyProfile = (data) =>
  fetch('/api/users/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json())

export const searchUsers = (q, userId) =>
  fetch(`/api/users/search?q=${encodeURIComponent(q)}&userId=${userId}`).then((r) => r.json())

export const getUserProfile = (id) =>
  fetch(`/api/users/${id}`).then((r) => r.json())

export const getFriends = (userId) =>
  fetch(`/api/friends?userId=${userId}`).then((r) => r.json())

export const getFriendRequests = (userId) =>
  fetch(`/api/friends/requests?userId=${userId}`).then((r) => r.json())

export const getFriendStatus = (userId, otherId) =>
  fetch(`/api/friends/status?userId=${userId}&otherId=${otherId}`).then((r) => r.json())

export const sendFriendRequest = (from, to) =>
  fetch('/api/friends/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to }) }).then((r) => r.json())

export const acceptFriendRequest = (friendshipId, userId) =>
  fetch(`/api/friends/${friendshipId}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }).then((r) => r.json())

export const deleteFriendship = (friendshipId, userId) =>
  fetch(`/api/friends/${friendshipId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }).then((r) => r.json())

export const uploadAvatar = (userId, file) => {
  const form = new FormData()
  form.append('userId', userId)
  form.append('avatar', file)
  return fetch('/api/users/avatar', { method: 'POST', body: form }).then((r) => r.json())
}

export const deleteMyAccount = (userId) =>
  fetch('/api/users/me', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }).then((r) => r.json())

// ── Messages ──────────────────────────────────────────────────────────────────
export const getConversation = (userId, friendId) =>
  fetch(`/api/messages?userId=${userId}&friendId=${friendId}`).then((r) => r.json())

export const sendMessage = (senderId, recipientId, content) =>
  fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senderId, recipientId, content }) }).then((r) => r.json())

export const getConversations = (userId) =>
  fetch(`/api/messages/conversations?userId=${userId}`).then((r) => r.json())

export const deleteMessage = (messageId, userId) =>
  fetch(`/api/messages/${messageId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }).then((r) => r.json())

export const editMessage = (messageId, userId, content) =>
  fetch(`/api/messages/${messageId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, content }) }).then((r) => r.json())

// ── Notifications ─────────────────────────────────────────────────────────────
export const getNotifications = (userId) =>
  fetch(`/api/notifications?userId=${userId}`).then((r) => r.json())

export const markNotificationsRead = (userId) =>
  fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }).then((r) => r.json())

// ── Trophées ──────────────────────────────────────────────────────────────────
export const getTrophies = (userId) =>
  fetch(`/api/trophies?userId=${userId}`).then((r) => r.json())

export const checkTrophies = (userId) =>
  fetch('/api/trophies/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }).then((r) => r.json())
