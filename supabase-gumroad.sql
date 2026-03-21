-- ============================================================
-- AIWorkSuite v4 — Gumroad Integration: Supabase SQL Setup
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- ============================================================

-- ── 1. Tabla principal de suscripciones ─────────────────────

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email                 text NOT NULL,
  plan                  text NOT NULL CHECK (plan IN ('free', 'pro', 'agency')),
  billing_cycle         text CHECK (billing_cycle IN ('monthly', 'yearly')),
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'cancelled', 'expired', 'trialing')),
  seats                 integer NOT NULL DEFAULT 1,
  gumroad_sale_id       text UNIQUE,
  gumroad_product_id    text,
  gumroad_subscriber_id text,
  trial_ends_at         timestamptz,
  current_period_end    timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- ── 2. Tabla de seats para plan Agency ──────────────────────

CREATE TABLE IF NOT EXISTS public.subscription_seats (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id  uuid REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email            text NOT NULL,
  role             text DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  invited_at       timestamptz DEFAULT now(),
  accepted_at      timestamptz
);

-- ── 3. Row Level Security ───────────────────────────────────

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_seats ENABLE ROW LEVEL SECURITY;

-- subscriptions: el usuario solo ve la suya
CREATE POLICY "users_see_own_subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- subscriptions: solo el webhook (service_role) puede insertar/actualizar
CREATE POLICY "service_role_manage_subscriptions"
  ON public.subscriptions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- seats: el owner ve todos los seats de su suscripción
CREATE POLICY "owner_sees_team_seats"
  ON public.subscription_seats FOR SELECT TO authenticated
  USING (
    subscription_id IN (
      SELECT id FROM public.subscriptions WHERE user_id = auth.uid()
    )
  );

-- seats: service_role gestiona todo
CREATE POLICY "service_role_manage_seats"
  ON public.subscription_seats FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 4. Trigger updated_at ───────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 5. Vista helper: tier activo del usuario ────────────────

CREATE OR REPLACE VIEW public.user_active_tier AS
SELECT
  user_id,
  plan,
  status,
  seats,
  billing_cycle,
  trial_ends_at,
  current_period_end,
  CASE
    WHEN status = 'trialing' AND trial_ends_at > now() THEN true
    WHEN status = 'active' THEN true
    ELSE false
  END AS is_active
FROM public.subscriptions;

-- ── 6. Permisos sobre la vista ──────────────────────────────

GRANT SELECT ON public.user_active_tier TO authenticated;
