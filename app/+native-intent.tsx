export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    if (path.includes("/invite/")) return path;
    if (path.includes("/swayger/")) return path;
    return "/";
  } catch {
    return "/";
  }
}
