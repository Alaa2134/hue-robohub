/** Resolve a provider-specific video reference into adaptive streaming URLs. Never serves raw MP4s from the app. */
export function resolveVideo(provider: string, source: string, customerCode?: string | null) {
  switch (provider) {
    case "mux":
      return {
        hls: `https://stream.mux.com/${encodeURIComponent(source)}.m3u8`,
        poster: `https://image.mux.com/${encodeURIComponent(source)}/thumbnail.webp?width=1280&time=1`,
        youtubeId: null,
      };
    case "cloudflare": {
      const base = customerCode ? `https://customer-${customerCode}.cloudflarestream.com` : "https://videodelivery.net";
      return {
        hls: `${base}/${encodeURIComponent(source)}/manifest/video.m3u8`,
        poster: `${base}/${encodeURIComponent(source)}/thumbnails/thumbnail.jpg?time=1s&height=720`,
        youtubeId: null,
      };
    }
    case "hls": {
      if (/^https:\/\//.test(source)) return { hls: source, poster: null, youtubeId: null };
      // Self-hosted films produced by the media pipeline: /media/films/<name>/master.m3u8 (+ poster.jpg).
      if (/^\/media\/films\/[\w-]+\/[\w-]+\.m3u8$/.test(source)) {
        return { hls: source, poster: source.replace(/[^/]+\.m3u8$/, "poster.jpg"), youtubeId: null };
      }
      return { hls: null, poster: null, youtubeId: null };
    }
    case "youtube": {
      const id = /^[\w-]{6,20}$/.test(source) ? source : null;
      return { hls: null, poster: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null, youtubeId: id };
    }
    default:
      return { hls: null, poster: null, youtubeId: null };
  }
}
