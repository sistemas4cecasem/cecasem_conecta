export function hasPermission(permissions: readonly string[], permission: string): boolean {
  return permissions.includes(permission);
}
