// frameworks.ts — framework-native authentication/authorization markers.
// Used by AS-06 so dependency-injection and guard idioms count as protection,
// not just decorator/middleware names.
// FastAPI/Starlette auth-dependency callable names, with an optional module
// prefix (e.g. `deps.get_current_user`) — the name itself may lead the call,
// so the marker is not required to be preceded by another identifier.
const FASTAPI_AUTH_DEP = String.raw`(?:[A-Za-z_][\w.]*\.)?(?:current_user|get_current_user|require_[a-z_]+|auth[\w]*|verify_[a-z_]+)`;

export const FRAMEWORK_AUTH_PATTERNS: RegExp[] = [
  // FastAPI / Starlette dependency injection
  new RegExp(String.raw`Depends\(\s*${FASTAPI_AUTH_DEP}`, 'i'),
  new RegExp(
    String.raw`Security\(\s*(?=[^)]*(?:${FASTAPI_AUTH_DEP}|\bscopes\s*=))`,
    'i'
  ),
  // NestJS guards
  /@UseGuards\(/,
  // Spring Security
  /@PreAuthorize\(|@Secured\(|@RolesAllowed\(/,
  // ASP.NET
  /\[Authorize(?:\([^)]*\))?\]/,
  // Generic decorator/middleware idioms (Flask/Django/Express/etc.)
  // require_[a-z_]+ is intentionally narrowed to auth-specific names to avoid
  // matching @require_premium, @require_feature_flag, and other non-auth decorators.
  /@(?:login_required|auth_required|requires_auth|authenticated|jwt_required|permission_classes|require_auth|require_login|require_user|require_role|require_permission|require_scope)/i,
  // bare `authenticate` is changed to a call form to avoid matching comments/prose.
  /\b(?:authenticate\s*\(|isAuthenticated|requireAuth|authMiddleware|bearerAuth|apiKeyAuth|verifyToken|checkAuth|jwt\.verify|auth\.required)\b/i,
];
