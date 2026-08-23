-- admin_growth_stats.sql
-- Adds get_admin_growth_stats() RPC for the Users admin page.
-- Returns new-user counts for today/week/month/year and a 90-day cumulative chart series.

CREATE OR REPLACE FUNCTION get_admin_growth_stats()
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  result      jsonb;
  chart_data  jsonb;
  today_start timestamptz := date_trunc('day',   now());
  week_start  timestamptz := date_trunc('week',  now());
  month_start timestamptz := date_trunc('month', now());
  year_start  timestamptz := date_trunc('year',  now());
  base_count  bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Period new-user counts
  SELECT jsonb_build_object(
    'today', jsonb_build_object(
      'total',     COUNT(*) FILTER (WHERE created_at >= today_start),
      'free',      COUNT(*) FILTER (WHERE created_at >= today_start AND subscription_status = 'free'),
      'unlimited', COUNT(*) FILTER (WHERE created_at >= today_start AND subscription_tier = 'unlimited' AND subscription_status = 'active')
    ),
    'week', jsonb_build_object(
      'total',     COUNT(*) FILTER (WHERE created_at >= week_start),
      'free',      COUNT(*) FILTER (WHERE created_at >= week_start AND subscription_status = 'free'),
      'unlimited', COUNT(*) FILTER (WHERE created_at >= week_start AND subscription_tier = 'unlimited' AND subscription_status = 'active')
    ),
    'month', jsonb_build_object(
      'total',     COUNT(*) FILTER (WHERE created_at >= month_start),
      'free',      COUNT(*) FILTER (WHERE created_at >= month_start AND subscription_status = 'free'),
      'unlimited', COUNT(*) FILTER (WHERE created_at >= month_start AND subscription_tier = 'unlimited' AND subscription_status = 'active')
    ),
    'year', jsonb_build_object(
      'total',     COUNT(*) FILTER (WHERE created_at >= year_start),
      'free',      COUNT(*) FILTER (WHERE created_at >= year_start AND subscription_status = 'free'),
      'unlimited', COUNT(*) FILTER (WHERE created_at >= year_start AND subscription_tier = 'unlimited' AND subscription_status = 'active')
    )
  ) INTO result FROM profiles;

  -- Users created before the 90-day window (base for cumulative line)
  SELECT COUNT(*) INTO base_count
  FROM profiles
  WHERE created_at < (date_trunc('day', now()) - interval '89 days');

  -- 90-day daily series with cumulative total
  SELECT jsonb_agg(row_data ORDER BY row_data->>'day') INTO chart_data
  FROM (
    SELECT jsonb_build_object(
      'day',        to_char(d.day, 'YYYY-MM-DD'),
      'new_users',  COALESCE(s.cnt, 0),
      'cumulative', base_count + SUM(COALESCE(s.cnt, 0)) OVER (ORDER BY d.day)
    ) AS row_data
    FROM generate_series(
      date_trunc('day', now()) - interval '89 days',
      date_trunc('day', now()),
      '1 day'::interval
    ) AS d(day)
    LEFT JOIN (
      SELECT date_trunc('day', created_at) AS signup_day, COUNT(*) AS cnt
      FROM profiles
      WHERE created_at >= date_trunc('day', now()) - interval '89 days'
      GROUP BY 1
    ) s ON s.signup_day = d.day
  ) sub;

  RETURN result || jsonb_build_object('chart', chart_data);
END;
$$;
