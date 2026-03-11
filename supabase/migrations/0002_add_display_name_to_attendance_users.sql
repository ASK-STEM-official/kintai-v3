alter table attendance.users
  add column if not exists display_name text;

update attendance.users u
set display_name = m.display_name
from member.members m
where u.supabase_auth_user_id = m.supabase_auth_user_id
  and u.display_name is null;
