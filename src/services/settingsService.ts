import { supabase } from '../lib/supabase';
import { SiteSettings, HomepageConfig } from '../types';
import { OperationType, logSupabaseError } from '../lib/supabaseUtils';
import { normalizeSettings } from '../lib/schemas';

const SETTINGS_ID = 'default';

function rowToSettings(row: any): SiteSettings {
  return normalizeSettings({
    title: row.title,
    browserTitle: row.browser_title,
    description: row.description,
    logoUrl: row.logo_url,
    faviconUrl: row.favicon_url,
    ctaButton: row.cta_button,
    socialUrls: row.social_urls,
    footerUrls: row.footer_urls,
    updatedAt: row.updated_at,
  });
}

export const settingsService = {
  async getSiteSettings(): Promise<SiteSettings | null> {
    try {
      const { data, error } = await supabase.from('site_settings').select('*').eq('id', SETTINGS_ID).maybeSingle();
      if (error) throw error;
      return data ? rowToSettings(data) : normalizeSettings({});
    } catch (error) {
      logSupabaseError(error, OperationType.GET, `site_settings/${SETTINGS_ID}`);
      return null;
    }
  },

  // Real-time listener for global site settings, replacing Firestore's onSnapshot.
  subscribeToSiteSettings(callback: (settings: SiteSettings) => void): () => void {
    this.getSiteSettings().then((s) => {
      if (s) callback(s);
    });

    const channel = supabase
      .channel('site_settings_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'site_settings', filter: `id=eq.${SETTINGS_ID}` },
        (payload) => {
          if (payload.new) callback(rowToSettings(payload.new));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  async updateSiteSettings(settings: SiteSettings) {
    try {
      const { error } = await supabase.from('site_settings').upsert({
        id: SETTINGS_ID,
        title: settings.title,
        browser_title: settings.browserTitle,
        description: settings.description,
        logo_url: settings.logoUrl,
        favicon_url: settings.faviconUrl,
        cta_button: settings.ctaButton,
        social_urls: settings.socialUrls,
        footer_urls: settings.footerUrls,
      });
      if (error) throw error;
    } catch (error) {
      logSupabaseError(error, OperationType.UPDATE, `site_settings/${SETTINGS_ID}`);
      throw error;
    }
  },

  async getHomepageConfig(): Promise<HomepageConfig | null> {
    try {
      const { data, error } = await supabase.from('homepage_config').select('*').eq('id', SETTINGS_ID).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { heroArticleId: data.hero_article_id, featuredArticleIds: data.featured_article_ids ?? [] };
    } catch (error) {
      logSupabaseError(error, OperationType.GET, `homepage_config/${SETTINGS_ID}`);
      return null;
    }
  },

  async updateHomepageConfig(config: HomepageConfig) {
    try {
      const { error } = await supabase.from('homepage_config').upsert({
        id: SETTINGS_ID,
        hero_article_id: config.heroArticleId,
        featured_article_ids: config.featuredArticleIds,
      });
      if (error) throw error;
    } catch (error) {
      logSupabaseError(error, OperationType.UPDATE, `homepage_config/${SETTINGS_ID}`);
      throw error;
    }
  },
};
