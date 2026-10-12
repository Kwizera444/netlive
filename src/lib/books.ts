export type BookAuthor = {
  name: string
  birth_year: number | null
  death_year: number | null
}

export type Book = {
  id: number
  title: string
  authors: BookAuthor[]
  summaries: string[]
  subjects: string[]
  formats: Record<string, string>
  download_count: number
}

export type BookSearchResult = {
  count: number
  next: string | null
  previous: string | null
  results: Book[]
}

const catalogueUrl = 'https://gutendex.com/books/'

export async function searchBooks(
  query: string,
  topic: string,
  page: number,
  signal?: AbortSignal,
): Promise<BookSearchResult> {
  const url = new URL(catalogueUrl)
  url.searchParams.set('languages', 'en')
  url.searchParams.set('sort', 'popular')
  url.searchParams.set('page', String(page))
  if (query.trim()) url.searchParams.set('search', query.trim())
  if (topic) url.searchParams.set('topic', topic)

  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`The public-domain book catalogue returned HTTP ${response.status}.`)
  }

  const data: unknown = await response.json()
  if (
    typeof data !== 'object'
    || data === null
    || !('results' in data)
    || !Array.isArray(data.results)
    || !('count' in data)
    || typeof data.count !== 'number'
    || !('next' in data)
    || !(typeof data.next === 'string' || data.next === null)
    || !('previous' in data)
    || !(typeof data.previous === 'string' || data.previous === null)
  ) {
    throw new Error('The public-domain book catalogue returned an invalid response.')
  }

  const results = data.results.filter((book): book is Book =>
    typeof book === 'object'
    && book !== null
    && 'id' in book
    && typeof book.id === 'number'
    && 'title' in book
    && typeof book.title === 'string'
    && 'formats' in book
    && typeof book.formats === 'object'
    && book.formats !== null
    && 'authors' in book
    && Array.isArray(book.authors)
    && 'summaries' in book
    && Array.isArray(book.summaries)
    && 'subjects' in book
    && Array.isArray(book.subjects)
    && 'download_count' in book
    && typeof book.download_count === 'number',
  )

  return { count: data.count, next: data.next, previous: data.previous, results }
}

export function bookReaderUrl(book: Book) {
  return book.formats['text/html']
    ?? book.formats['text/plain; charset=utf-8']
    ?? book.formats['text/plain']
    ?? null
}

export function bookCoverUrl(book: Book) {
  return book.formats['image/jpeg'] ?? ''
}
