async function chooseOneTrack({ weeklyTrack, playlistId }) {
  const normalized = normalizeToTrack(weeklyTrack);
  if (normalized) return normalized;

  // 1) total tracks
  const meta = await api(`/playlists/${playlistId}/tracks?limit=1&offset=0&market=SE`, { method: "GET" });
  const total = Number(meta.total || 0);
  if (!total) throw new Error("Playlisten tom eller otillgänglig.");

  // 2) random index
  const idx = Math.floor(Math.random() * total);

  // 3) fetch page containing idx
  const pageSize = 50;
  const pageOffset = Math.floor(idx / pageSize) * pageSize;
  const page = await api(`/playlists/${playlistId}/tracks?limit=${pageSize}&offset=${pageOffset}&market=SE`, { method: "GET" });

  const within = idx - pageOffset;
  const t = page.items?.[within]?.track;
  if (!t?.uri || !t?.external_urls?.spotify) throw new Error("Kunde inte välja slumpad låt.");

  return { uri: t.uri, url: t.external_urls.spotify, name: t.name || "" };
}
