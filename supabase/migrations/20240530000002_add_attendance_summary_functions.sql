
-- 日別の出勤者数を集計する関数
CREATE OR REPLACE FUNCTION get_daily_attendance_counts_for_month(start_date date, end_date date)
RETURNS TABLE(date date, count bigint) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.date,
        COUNT(DISTINCT a.user_id) AS count
    FROM
        attendance.attendances AS a
    WHERE
        a.date >= start_date AND a.date <= end_date AND a.type = 'in'
    GROUP BY
        a.date
    ORDER BY
        a.date;
END;
$$ LANGUAGE plpgsql;

-- 特定の日の班・学年別出勤詳細を集計する関数
CREATE OR REPLACE FUNCTION get_daily_attendance_details(for_date date)
RETURNS TABLE(team_name text, generation integer, user_count bigint) AS $$
BEGIN
    RETURN QUERY
    WITH daily_attendees AS (
        SELECT DISTINCT user_id
        FROM attendance.attendances
        WHERE date = for_date AND type = 'in'
    )
    SELECT
        COALESCE(t.name, '未所属') AS team_name,
        m.generation,
        COUNT(m.supabase_auth_user_id) AS user_count
    FROM
        member.members m
    JOIN
        daily_attendees da ON m.supabase_auth_user_id = da.user_id
    LEFT JOIN
        member.member_team_relations mtr ON m.supabase_auth_user_id = mtr.member_id
    LEFT JOIN
        member.teams t ON mtr.team_id = t.id
    WHERE
        m.deleted_at IS NULL
    GROUP BY
        t.name, m.generation
    ORDER BY
        team_name, m.generation;
END;
$$ LANGUAGE plpgsql;
