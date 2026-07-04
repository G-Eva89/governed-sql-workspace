export function getServerApiUrl(): string {
  return process.env.API_URL ?? "http://localhost:3001";
}
