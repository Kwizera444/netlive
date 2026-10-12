type Publisher = {
  name: string
  homepage: string
  hosts: readonly string[]
  rss?: string
}

const publishers: Publisher[] = [
  {
    name: 'IGIHE',
    homepage: 'https://igihe.com/',
    rss: 'https://igihe.com/spip.php?page=backend',
    hosts: ['igihe.com', 'www.igihe.com'],
  },
  {
    name: 'Kigali Today',
    homepage: 'https://www.kigalitoday.com/',
    hosts: ['kigalitoday.com', 'www.kigalitoday.com'],
  },
] as const

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

type NewsItem = { title: string; url: string; publishedAt: string; source: string; imageUrl?: string }

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': allowedHeaders,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([\da-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
}

function plainText(html: string) {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

function attribute(tag: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? '') : ''
}

function articleUrl(rawUrl: string, publisher: Publisher) {
  try {
    const url = new URL(rawUrl, publisher.homepage)
    if (
      url.protocol !== 'https:'
      || !publisher.hosts.includes(url.hostname.toLowerCase())
      || !url.pathname.toLowerCase().includes('/article/')
    ) return null
    url.hash = ''
    return url.href
  } catch {
    return null
  }
}

function imageUrl(rawUrl: string, baseUrl: string) {
  try {
    const url = new URL(rawUrl, baseUrl)
    return url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

function imageFromMarkup(markup: string, baseUrl: string) {
  const imageTag = markup.match(/<img\b[^>]*>/i)?.[0]
  if (!imageTag) return undefined
  const rawSrcSet = attribute(imageTag, 'srcset') || attribute(imageTag, 'data-srcset')
  const srcSetCandidate = rawSrcSet
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean)
    .at(-1)
  const rawUrl = attribute(imageTag, 'data-src')
    || attribute(imageTag, 'data-lazy-src')
    || attribute(imageTag, 'data-original')
    || srcSetCandidate
    || attribute(imageTag, 'src')
  return rawUrl ? imageUrl(rawUrl, baseUrl) : undefined
}

function extractHomepageArticles(html: string, publisher: Publisher): NewsItem[] {
  const results: NewsItem[] = []
  const seen = new Set<string>()
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi
  const imageByUrl = new Map<string, string>()
  for (const [, attributes, content] of html.matchAll(anchorPattern)) {
    const url = articleUrl(attribute(attributes, 'href'), publisher)
    const image = imageFromMarkup(content, publisher.homepage)
    if (url && image && !imageByUrl.has(url)) imageByUrl.set(url, image)
  }
  let match: RegExpExecArray | null

  anchorPattern.lastIndex = 0
  while ((match = anchorPattern.exec(html)) !== null && results.length < 200) {
    const title = plainText(match[2])
    if (title.length < 20) continue
    const url = articleUrl(attribute(match[1], 'href'), publisher)
    if (!url || seen.has(url)) continue
    seen.add(url)

    results.push({
      title,
      url,
      publishedAt: '',
      source: publisher.name,
      imageUrl: imageByUrl.get(url) ?? imageFromMarkup(match[2], publisher.homepage),
    })
  }
  return results
}

function readTag(xml: string, tag: string) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`, 'i'))
  if (!match) return ''
  return plainText(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))
}

function extractRssArticles(xml: string, publisher: Publisher): NewsItem[] {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .map(([, item]) => {
      const imageTag = [...item.matchAll(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi)]
        .map(([tag]) => tag)
        .find((tag) => {
          if (/^<media:thumbnail\b/i.test(tag)) return true
          const type = attribute(tag, 'type').toLowerCase()
          return type.startsWith('image/') || attribute(tag, 'medium').toLowerCase() === 'image'
        })
      const imageRawUrl = imageTag ? attribute(imageTag, 'url') : ''
      return {
        title: readTag(item, 'title'),
        url: articleUrl(readTag(item, 'link'), publisher) ?? '',
        publishedAt: readTag(item, 'dc:date') || readTag(item, 'pubDate'),
        source: publisher.name,
        imageUrl: (imageRawUrl && imageUrl(imageRawUrl, publisher.homepage))
          || imageFromMarkup(item, publisher.homepage),
      }
    })
    .filter((item) => item.title && item.url)
    .slice(0, 200)
}

async function fetchText(url: string, timeoutMs = 12000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InzuRwandaNews/1.0)' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}.`)
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchPublisherNews(publisher: Publisher) {
  const errors: string[] = []
  const attemptHomepage = async () => {
    const html = await fetchText(publisher.homepage)
    const items = extractHomepageArticles(html, publisher)
    if (!items.length) throw new Error('Homepage contained no article links.')
    return items
  }

  if (publisher.rss) {
    try {
      const xml = await fetchText(publisher.rss)
      const items = extractRssArticles(xml, publisher)
      if (items.length) return { items, error: null }
      errors.push('RSS feed contained no article links.')
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'RSS request failed.')
    }
  }

  try {
    const items = await attemptHomepage()
    return { items, error: null }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Homepage request failed.')
  }

  return { items: [] as NewsItem[], error: `${publisher.name}: ${errors.join(' Homepage fallback: ')}` }
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('origin'))
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers })
  }

  const fetchedAt = new Date().toISOString()
  const publisherResults = await Promise.all(publishers.map(fetchPublisherNews))
  const items = publisherResults.flatMap((result) => result.items)
  if (items.length) {
    items.sort((first, second) => {
      const firstDate = Date.parse(first.publishedAt)
      const secondDate = Date.parse(second.publishedAt)
      if (!Number.isNaN(firstDate) && !Number.isNaN(secondDate)) return secondDate - firstDate
      if (!Number.isNaN(firstDate)) return -1
      if (!Number.isNaN(secondDate)) return 1
      return 0
    })
    const availableSources = [...new Set(items.map((item) => item.source))]
    return Response.json(
      {
        source: availableSources.join(' + '),
        sourceUrl: 'https://igihe.com/',
        sources: publishers.map(({ name, homepage }) => ({ name, url: homepage })),
        items,
        fetchedAt,
        warnings: publisherResults.flatMap((result) => result.error ? [result.error] : []),
      },
      { headers: { ...headers, 'Cache-Control': 'public, max-age=300' } },
    )
  }

  const failures = publisherResults.flatMap((result) => result.error ? [result.error] : [])
  console.error('Could not fetch Rwanda headlines:', failures)
  return Response.json(
    { error: 'Could not fetch news from IGIHE or Kigali Today.', details: failures },
    { status: 502, headers },
  )
})
