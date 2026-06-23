const CRLF = Buffer.from('\r\n');
const DOUBLE_CRLF = Buffer.from('\r\n\r\n');

export class MultipartError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'MultipartError';
    this.status = status;
  }
}

function parseContentDisposition(value = '') {
  const result = {};
  for (const part of value.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawValue.length) continue;
    const key = rawKey.trim().toLowerCase();
    result[key] = rawValue.join('=').trim().replace(/^"|"$/g, '');
  }
  return result;
}

function getBoundary(contentType = '') {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match ? match[1] || match[2] : '';
}

function parseHeaders(buffer) {
  const headers = {};
  const lines = buffer.toString('utf8').split('\r\n');
  for (const line of lines) {
    const index = line.indexOf(':');
    if (index === -1) continue;
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return headers;
}

function trimTrailingLineBreak(buffer) {
  if (buffer.subarray(-2).equals(CRLF)) return buffer.subarray(0, -2);
  return buffer;
}

export async function parseMultipartRequest(request, { maxBytes = 220 * 1024 * 1024 } = {}) {
  const boundary = getBoundary(request.headers['content-type'] || '');
  if (!boundary) throw new MultipartError('Некорректный multipart/form-data запрос.');

  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new MultipartError('Загруженные фото слишком большие для одного отчёта.', 413);
    }
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks);
  const marker = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = [];
  let cursor = body.indexOf(marker);

  while (cursor !== -1) {
    cursor += marker.length;
    if (body[cursor] === 45 && body[cursor + 1] === 45) break;
    if (body.subarray(cursor, cursor + 2).equals(CRLF)) cursor += 2;

    const headerEnd = body.indexOf(DOUBLE_CRLF, cursor);
    if (headerEnd === -1) break;

    const headers = parseHeaders(body.subarray(cursor, headerEnd));
    const disposition = parseContentDisposition(headers['content-disposition']);
    const nextMarker = body.indexOf(marker, headerEnd + DOUBLE_CRLF.length);
    if (nextMarker === -1) break;

    const content = trimTrailingLineBreak(body.subarray(headerEnd + DOUBLE_CRLF.length, nextMarker));
    const name = disposition.name;
    if (!name) {
      cursor = nextMarker;
      continue;
    }

    if (disposition.filename) {
      files.push({
        fieldName: name,
        filename: disposition.filename,
        mimeType: headers['content-type'] || 'application/octet-stream',
        size: content.length,
        buffer: Buffer.from(content)
      });
    } else {
      fields[name] = content.toString('utf8');
    }

    cursor = nextMarker;
  }

  return { fields, files };
}
