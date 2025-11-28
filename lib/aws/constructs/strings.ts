export function capitalize(...parts: string[]): string {
  return parts
    .flatMap(part => part.split(/[\s\-._]+/))
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}