// frameworks.ts — framework-native authentication/authorization markers.
// Used by AS-06 so dependency-injection and guard idioms count as protection,
// not just decorator/middleware names.
export const FRAMEWORK_AUTH_PATTERNS: RegExp[] = [
  // FastAPI / Starlette dependency injection
  /Depends\(\s*[A-Za-z_][\w.]*(?:current_user|get_current_user|require_[a-z_]+|auth[\w]*|verify_[a-z_]+)/i,
  /Security\(\s*[A-Za-z_][\w.]*(?:current_user|get_current_user|require_[a-z_]+|auth[\w]*|verify_[a-z_]+|scopes)/i,
  // NestJS guards
  /@UseGuards\(/,
  // Spring Security
  /@PreAuthorize\(|@Secured\(|@RolesAllowed\(/,
  // ASP.NET
  /\[Authorize(?:\([^)]*\))?\]/,
  // Generic decorator/middleware idioms (Flask/Django/Express/etc.)
  /@(?:login_required|auth_required|requires_auth|authenticated|jwt_required|permission_classes|require_[a-z_]+)/i,
  /\b(?:authenticate|isAuthenticated|requireAuth|authMiddleware|bearerAuth|apiKeyAuth|verifyToken|checkAuth|jwt\.verify|auth\.required)\b/i,
];
