export async function safeFetchJson<T = any>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      return await res.json();
    } catch (err) {
      throw new Error(`无法解析服务器响应的数据 (${res.status})`);
    }
  }
  
  if (!res.ok) {
    throw new Error(`服务器响应异常 (${res.status})`);
  }

  return {} as T;
}

export async function fetchJsonSafely<T = any>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await res.json();
      return { ok: res.ok, status: res.status, data, error: !res.ok ? (data?.error || `请求失败 (${res.status})`) : undefined };
    }
    return {
      ok: res.ok,
      status: res.status,
      data: null,
      error: res.ok ? undefined : `服务器返回了非 JSON 格式的响应 (${res.status})`
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err.message || '网络连接失败'
    };
  }
}
