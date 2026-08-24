// Pure, browser-and-server-safe slugify. Deliberately duplicates
// articleService.generateSlug's exact algorithm rather than importing it
// -- same reasoning as submissionPublishService.ts's generateSlugFromTitle:
// articleService.ts pulls in lib/supabase.ts's browser-only env access,
// which server.ts can't safely import. Categories have no dedicated slug
// column (categoryService.CategoryDoc is just { id, name }), so category
// URLs are slugified from the name on the fly, both here and in
// server-supabase.ts's getCategoryByNameSlugServer.
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
