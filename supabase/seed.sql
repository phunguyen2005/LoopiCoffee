-- SEED SCRIPT FOR LOOPICAFE INITIAL STORE AND RULES

-- 1. Create Initial Store
INSERT INTO public.stores (id, name, address, timezone, latitude, longitude, attendance_enabled)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'LoopiCafe - Main Store',
  '123 Le Loi Street, District 1, Ho Chi Minh City',
  'Asia/Ho_Chi_Minh',
  10.776889,
  106.700806,
  true
)
ON CONFLICT (id) DO NOTHING;

-- 2. Create Default Attendance Rules for Store
INSERT INTO public.attendance_rules (
  id, store_id, version, early_checkin_minutes, late_minutes, early_departure_minutes, missing_checkout_minutes, evidence_retention_days, active, created_by
) VALUES (
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  1,
  15, -- 15 mins early checkin allowed
  5,  -- 5 mins late grace period
  5,  -- 5 mins early departure grace
  480, -- 8 hours missing checkout timeout
  90, -- 90 days photo retention
  true,
  '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (store_id, version) DO NOTHING;

-- 3. Create Standard Checklist Templates
INSERT INTO public.checklist_templates (id, store_id, title, type, active)
VALUES 
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Opening Store Checklist', 'opening', true),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Closing Store Checklist', 'closing', true)
ON CONFLICT (id) DO NOTHING;
