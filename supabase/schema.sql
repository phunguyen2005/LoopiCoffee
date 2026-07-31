-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. STORES TABLE
CREATE TABLE IF NOT EXISTS public.stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  latitude DOUBLE PRECISION NOT NULL DEFAULT 10.776889,
  longitude DOUBLE PRECISION NOT NULL DEFAULT 106.700806,
  allowed_wifi_ips JSONB DEFAULT '[]'::jsonb,
  attendance_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. EMPLOYEES TABLE
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'team_lead', 'employee')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'inactive')),
  invited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_store_status ON public.employees(store_id, status);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);

-- 3. EMPLOYEE CONSENTS TABLE
CREATE TABLE IF NOT EXISTS public.employee_consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  notice_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, notice_version)
);

-- 4. ATTENDANCE RULES TABLE
CREATE TABLE IF NOT EXISTS public.attendance_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  early_checkin_minutes INT NOT NULL DEFAULT 15,
  late_minutes INT NOT NULL DEFAULT 5,
  early_departure_minutes INT NOT NULL DEFAULT 5,
  missing_checkout_minutes INT NOT NULL DEFAULT 480,
  evidence_retention_days INT NOT NULL DEFAULT 90,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id, version)
);

-- 5. SHIFTS TABLE
CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  timezone_snapshot TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  role_label TEXT NOT NULL,
  is_shift_lead BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shifts_employee_start ON public.shifts(employee_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_shifts_store_start ON public.shifts(store_id, starts_at);

-- 6. ATTENDANCE SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  rule_version_id UUID REFERENCES public.attendance_rules(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'completed', 'review_required')),
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  worked_minutes INT
);

-- 7. ATTENDANCE EVENTS TABLE
CREATE TABLE IF NOT EXISTS public.attendance_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('check_in', 'check_out')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key TEXT UNIQUE NOT NULL,
  verification_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_required BOOLEAN NOT NULL DEFAULT false,
  photo_status TEXT NOT NULL CHECK (photo_status IN ('stored', 'unavailable', 'failed')),
  exception_reason TEXT,
  UNIQUE(session_id, action)
);

-- 8. ATTENDANCE LOCATIONS TABLE
CREATE TABLE IF NOT EXISTS public.attendance_locations (
  event_id UUID PRIMARY KEY REFERENCES public.attendance_events(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_meters DOUBLE PRECISION NOT NULL,
  browser_position_at TIMESTAMPTZ,
  server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  distance_from_store_meters DOUBLE PRECISION NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 9. ATTENDANCE PHOTOS TABLE
CREATE TABLE IF NOT EXISTS public.attendance_photos (
  event_id UUID PRIMARY KEY REFERENCES public.attendance_events(id) ON DELETE CASCADE,
  storage_object_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  size_bytes INT NOT NULL,
  sha256 TEXT NOT NULL,
  overlay_version TEXT NOT NULL DEFAULT 'v1',
  expires_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 10. ATTENDANCE EXCEPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.attendance_exceptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID UNIQUE NOT NULL REFERENCES public.attendance_events(id) ON DELETE CASCADE,
  employee_reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewer_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. CHECKLIST TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('opening', 'mid', 'closing')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. CHECKLIST RUNS TABLE
CREATE TABLE IF NOT EXISTS public.checklist_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  completed_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. CHECKLIST ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.checklist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES public.checklist_runs(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT true,
  photo_required BOOLEAN NOT NULL DEFAULT false,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  photo_url TEXT,
  notes TEXT
);

-- 14. INCIDENTS TABLE
CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'closed')),
  assigned_to UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. SHORTAGES TABLE
CREATE TABLE IF NOT EXISTS public.shortages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity_remaining TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'low' CHECK (urgency IN ('low', 'urgent')),
  status TEXT NOT NULL DEFAULT 'reported' CHECK (status IN ('reported', 'ordered', 'restocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. HANDOVERS TABLE
CREATE TABLE IF NOT EXISTS public.handovers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  author_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  manager_attention BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. REQUESTS TABLE (Leave & Shift Swap)
CREATE TABLE IF NOT EXISTS public.requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('leave', 'swap', 'correction')),
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  entity_href TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. AUDIT EVENTS TABLE
CREATE TABLE IF NOT EXISTS public.audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shortages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

-- Helper RLS function
CREATE OR REPLACE FUNCTION public.get_current_employee()
RETURNS TABLE (store_id UUID, role TEXT, employee_id UUID) AS $$
  SELECT store_id, role, id FROM public.employees WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- STORES POLICY: Active employees can read their store
DROP POLICY IF EXISTS "Employees can view their store" ON public.stores;
CREATE POLICY "Employees can view their store" ON public.stores
FOR SELECT USING (
  id IN (SELECT store_id FROM public.get_current_employee())
);

-- EMPLOYEES POLICY: Employees can view staff in their store
DROP POLICY IF EXISTS "Employees can view store colleagues" ON public.employees;
CREATE POLICY "Employees can view store colleagues" ON public.employees
FOR SELECT USING (
  store_id IN (SELECT store_id FROM public.get_current_employee())
);

-- SHIFTS POLICY: Employees can view shift schedules for their store
DROP POLICY IF EXISTS "Employees can view store shifts" ON public.shifts;
CREATE POLICY "Employees can view store shifts" ON public.shifts
FOR SELECT USING (
  store_id IN (SELECT store_id FROM public.get_current_employee())
);
