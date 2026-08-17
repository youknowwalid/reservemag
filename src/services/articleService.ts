import { supabase } from '../lib/supabase';
import { Article } from '../types';
import { OperationType, logSupabaseError } from '../lib/supabaseUtils';
import { normalizeArticle } from '../lib/schemas';

const TABLE = 'articles';

function rowToArticle(row: any): Article {
  return normalizeArticle({
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    excerpt: row.excerpt,
    content: row.content,
    category: row.category,
    status: row.status,
    featured: row.featured,
    author: row.author,
    authorId: row.author_id,
    image: row.image,
    mobileImage: row.mobile_image,
    mobileCropX: row.mobile_crop_x,
    readTime: row.read_time,
    date: row.date,
    publishDate: row.publish_date,
    seo: row.seo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function articleToRow(article: Partial<Article>): Record<string, any> {
  const row: Record<string, any> = {};
  if (article.slug !== undefined) row.slug = article.slug;
  if (article.title !== undefined) row.title = article.title;
  if (article.subtitle !== undefined) row.subtitle = article.subtitle;
  if (article.excerpt !== undefined) row.excerpt = article.excerpt;
  if (article.content !== undefined) row.content = article.content;
  if (article.category !== undefined) row.category = article.category;
  if (article.status !== undefined) row.status = article.status;
  if (article.featured !== undefined) row.featured = article.featured;
  if (article.author !== undefined) row.author = article.author;
  if (article.authorId !== undefined) row.author_id = article.authorId;
  if (article.image !== undefined) row.image = article.image;
  if (article.mobileImage !== undefined) row.mobile_image = article.mobileImage;
  if (article.mobileCropX !== undefined) row.mobile_crop_x = article.mobileCropX;
  if (article.readTime !== undefined) row.read_time = article.readTime;
  if (article.date !== undefined) row.date = article.date;
  if (article.publishDate !== undefined) row.publish_date = article.publishDate;
  if (article.seo !== undefined) row.seo = article.seo;
  return row;
}

export const articleService = {
  generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  },

  async ensureContentExists() {
    // An empty archive is a normal, valid state under Supabase -- unlike
    // the old Firestore path, we don't auto-seed demo content here.
    return false;
  },

  async getAllArticles(includeDrafts = true): Promise<Article[]> {
    try {
      let q = supabase.from(TABLE).select('*').order('updated_at', { ascending: false });
      if (!includeDrafts) q = q.eq('status', 'published');
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(rowToArticle);
    } catch (error) {
      logSupabaseError(error, OperationType.LIST, TABLE);
      return [];
    }
  },

  async getPublishedArticles(limitCount: number = 50): Promise<Article[]> {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('status', 'published')
        .order('updated_at', { ascending: false })
        .limit(limitCount);
      if (error) throw error;
      return (data ?? []).map(rowToArticle);
    } catch (error) {
      logSupabaseError(error, OperationType.LIST, TABLE);
      return [];
    }
  },

  async getArticlesByIds(ids: string[]): Promise<Article[]> {
    if (!ids || ids.length === 0) return [];
    try {
      const { data, error } = await supabase.from(TABLE).select('*').in('id', ids.slice(0, 10));
      if (error) throw error;
      return (data ?? []).map(rowToArticle);
    } catch (error) {
      logSupabaseError(error, OperationType.LIST, TABLE);
      return [];
    }
  },

  async getArticleBySlug(slug: string): Promise<Article | null> {
    try {
      const { data, error } = await supabase.from(TABLE).select('*').eq('slug', slug).limit(1).maybeSingle();
      if (error) throw error;
      return data ? rowToArticle(data) : null;
    } catch (error) {
      logSupabaseError(error, OperationType.GET, `${TABLE}/slug/${slug}`);
      return null;
    }
  },

  async getFeaturedArticles(): Promise<Article[]> {
    try {
      const { data, error } = await supabase.from(TABLE).select('*').eq('featured', true).limit(10);
      if (error) throw error;
      return (data ?? []).map(rowToArticle);
    } catch (error) {
      logSupabaseError(error, OperationType.LIST, TABLE);
      return [];
    }
  },

  async createArticle(article: Omit<Article, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const cleanSlug = article.slug || this.generateSlug(article.title);
      const row = articleToRow({ ...article, slug: cleanSlug });
      const { data, error } = await supabase.from(TABLE).insert(row).select('id').single();
      if (error) throw error;
      return data.id as string;
    } catch (error) {
      logSupabaseError(error, OperationType.CREATE, TABLE);
    }
  },

  async updateArticle(id: string, article: Partial<Article>) {
    try {
      const row = articleToRow(article);
      const { error } = await supabase.from(TABLE).update(row).eq('id', id);
      if (error) throw error;
    } catch (error) {
      logSupabaseError(error, OperationType.UPDATE, `${TABLE}/${id}`);
    }
  },

  async deleteArticle(id: string) {
    try {
      const { error } = await supabase.from(TABLE).delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      logSupabaseError(error, OperationType.DELETE, `${TABLE}/${id}`);
    }
  },

  async isAuthorUsed(authorId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.from(TABLE).select('id').eq('author_id', authorId).limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    } catch (error) {
      console.error('Error checking author usage:', error);
      return false;
    }
  },
};
