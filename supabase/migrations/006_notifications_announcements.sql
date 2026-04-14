-- Announcements
CREATE TYPE announcement_type AS ENUM ('emergency', 'reschedule', 'reminder', 'system');
CREATE TYPE announcement_urgency AS ENUM ('critical', 'high', 'normal', 'low');
CREATE TYPE audience_type AS ENUM ('all', 'sport', 'event', 'team');

CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES profiles(id),
  type announcement_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  urgency announcement_urgency DEFAULT 'normal',
  audience_type audience_type DEFAULT 'all',
  audience_id UUID,
  is_public BOOLEAN DEFAULT FALSE,
  linked_match_id UUID REFERENCES matches(id),
  new_scheduled_at TIMESTAMPTZ,
  new_venue TEXT,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Notifications (per-user inbox)
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_notifications_recipient ON notifications (recipient_id, read, created_at DESC);
CREATE INDEX idx_announcements_published ON announcements (published_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id, created_at DESC);

-- RLS
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Announcements: public reads for is_public; org/admin all
CREATE POLICY "announcements_select_public" ON announcements FOR SELECT USING (
  is_public = TRUE
  OR auth.uid() IS NOT NULL
);
CREATE POLICY "announcements_write_admin" ON announcements FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

-- Notifications: each user sees only their own
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE USING (recipient_id = auth.uid());
CREATE POLICY "notifications_insert_admin" ON notifications FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

-- Audit logs: only super admin can see all; org can see their own
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT USING (
  actor_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "audit_logs_insert_admin" ON audit_logs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

-- Enable realtime on notifications and announcements
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
