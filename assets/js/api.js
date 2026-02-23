export const apiRequest = async (method, path, body) => {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      "accept": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
    cache: "no-store",
  });

  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => "");
  }

  if (!res.ok) {
    const err = new Error("API error");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
};

export const apiGet = (path) => apiRequest("GET", path);
export const apiPost = (path, body) => apiRequest("POST", path, body);
export const apiPut = (path, body) => apiRequest("PUT", path, body);

export const getMe = () => apiGet("/api/me");
