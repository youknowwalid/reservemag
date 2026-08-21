import { supabase } from '../lib/supabase';
import { Notification } from '../types';
import { OperationType, logSupabaseError } from '../lib/supabaseUtils';

const TABLE = 'notifications';

function rowToNotification(row: any): Notification {
  return {
    id: row.id,
    contributorId: row.contributor_id,
    submissionId: row.submission_id,
    message: row.message,
    read: row.read,
    createdAt: row.created_at,
  };
}

export const notificationService = {
  /** The signed-in contributor's own notifications (RLS-scoped, same pattern as submissionService.getOwnSubmissions). */
  async getOwnNotifications(contributorId: string): Promise<Notification[]> {
    try {
      const { data, error } = await supabase.from(TABLE).select('*').eq('contributor_id', contributorId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToNotification);
    } catch (error) {
      logSupabaseError(error, OperationType.LIST, `${TABLE}/${contributorId}`);
      return [];
    }
  },

  /** Marks one notification read -- RLS only allows a contributor to touch their own (see the add_submissions_and_notifications migration's "contributor marks own notification read" policy), and only the `read` flag, never fabricating a new one. */
  async markAsRead(id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).update({ read: true }).eq('id', id);
    if (error) throw error;
  },
};
