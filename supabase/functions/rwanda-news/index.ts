const feedUrl = 'https://www.igihe.com/spip.php?page=backend'
const allowedHeaders = [
  'authorization',
  'apikey',
  'content-type',
  'x-client-info',
  'x-supabase-api-version',
  'x-supabase-client-platform',
  'x-supabase-client-version',
  'x-supabase-client-runtime',
  'x-supabase-client-runtime-version',
].join(', ')

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': allowedHeaders,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim()
}

function readTag(xml: string, tag: string) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`, 'i'))
  return match ? decodeXml(match[1]) : ''
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('origin'))
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(feedUrl, {
      headers: { 'User-Agent': 'Inzu Rwanda trends reader/1.0' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`IGIHE news feed returned ${response.status}.`)
    const xml = await response.text()
    const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
      .map(([, item]) => ({
        title: readTag(item, 'title'),
        url: readTag(item, 'link'),
        publishedAt: readTag(item, 'dc:date') || readTag(item, 'pubDate'),
      }))
      .filter((item) => item.title && /^https:\/\/www\.igihe\.com\//i.test(item.url))
      .slice(0, 5)

    return Response.json(
      { source: 'IGIHE', sourceUrl: 'https://www.igihe.com/', items, fetchedAt: new Date().toISOString() },
      { headers: { ...headers, 'Cache-Control': 'public, max-age=300' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not fetch the Rwanda news feed.'
    return Response.json({ error: message }, { status: 502, headers })
  } finally {
    clearTimeout(timeout)
  }
})
