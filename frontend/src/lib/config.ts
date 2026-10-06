export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const WS_URL = `${API_URL.replace(/^http/, "ws")}/api/ws`;
